const express = require('express');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const app = express();
const PORT = 3000;

// Serve static files
app.use(express.static('.'));
app.use(express.json());

// Helper function to check if data is up to date (within last 24 hours on weekdays)
function isDataUpToDate(filePath) {
    if (!fs.existsSync(filePath)) {
        return false;
    }

    const stats = fs.statSync(filePath);
    const lastModified = new Date(stats.mtime);
    const now = new Date();

    // Check if it's a weekend
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = currentDay === 0 || currentDay === 6;

    if (isWeekend) {
        // On weekends, check if data was updated after Friday close (assuming 4 PM ET)
        const lastFriday = new Date(now);
        lastFriday.setDate(now.getDate() - (currentDay === 0 ? 2 : 1)); // Go back to Friday
        lastFriday.setHours(16, 0, 0, 0); // 4 PM ET

        return lastModified >= lastFriday;
    } else {
        // On weekdays, check if data was updated today
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        return lastModified >= today;
    }
}

// API endpoint to get available tickers
app.get('/api/tickers', (req, res) => {
    const historicalDataPath = path.join(__dirname, '..', 'historical_data');

    try {
        // Check if requesting full list or curated list
        const fullList = req.query.full === 'true';

        if (fullList) {
            // Read all CSV files from historical_data directory
            const files = fs.readdirSync(historicalDataPath);

            // Extract ticker names from .csv files
            const availableTickers = files
                .filter(file => file.endsWith('.csv'))
                .map(file => file.replace('.csv', ''))
                .sort(); // Sort alphabetically

            console.log(`Returning full list: ${availableTickers.length} tickers`);
            res.json(availableTickers);
        } else {
            // Return curated list for UI display
            const curatedTickers = ['NVDA', 'AAPL', 'AMZN', 'CRWV', 'GOOGL', 'META', 'MSFT', 'NFLX', 'PLTR', 'SPY', 'TSLA'];

            // Verify that data files exist for curated tickers
            const availableTickers = curatedTickers.filter(ticker => {
                const filePath = path.join(historicalDataPath, `${ticker}.csv`);
                return fs.existsSync(filePath);
            });

            console.log(`Returning curated list: ${availableTickers.length} tickers`);
            res.json(availableTickers);
        }
    } catch (error) {
        console.error('Error reading ticker data files:', error);
        res.status(500).json({ error: 'Failed to read ticker list' });
    }
});

// API endpoint to get stock data
app.get('/api/stock/:ticker', (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    // Updated path to go up one directory to access historical_data
    const csvPath = path.join(__dirname, '..', 'historical_data', `${ticker}.csv`);

    if (!fs.existsSync(csvPath)) {
        return res.status(404).json({ error: `Data file not found for ticker: ${ticker}` });
    }

    const results = [];

    fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (data) => {
            // Parse the CSV data to match the expected format
            const stockData = {
                timestamp: new Date(data.Date).toISOString(),
                open: parseFloat(data.Open),
                high: parseFloat(data.High),
                low: parseFloat(data.Low),
                close: parseFloat(data.Close),
                volume: parseFloat(data.Volume)
            };

            // Only add valid data points
            if (!isNaN(stockData.open) && !isNaN(stockData.high) &&
                !isNaN(stockData.low) && !isNaN(stockData.close) &&
                !isNaN(stockData.volume)) {
                results.push(stockData);
            }
        })
        .on('end', () => {
            // Sort by timestamp
            results.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            res.json(results);
        })
        .on('error', (error) => {
            res.status(500).json({ error: error.message });
        });
});

// API endpoint to get company info
app.get('/api/company/:ticker', (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const pythonScript = path.join(__dirname, '..', 'get_company_info.py');

    console.log(`Fetching company info for ${ticker}...`);

    // Run the Python script with the ticker as argument
    const pythonProcess = spawn('python3', [pythonScript, ticker], {
        cwd: path.join(__dirname, '..')
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
        if (code === 0) {
            try {
                const info = JSON.parse(output);
                res.json(info);
            } catch (e) {
                res.status(500).json({ error: 'Failed to parse company info' });
            }
        } else {
            res.status(500).json({ error: errorOutput || 'Failed to fetch company info' });
        }
    });

    pythonProcess.on('error', (error) => {
        res.status(500).json({ error: error.message });
    });
});

// API endpoint to check if data is up to date
app.get('/api/stock/:ticker/status', (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const csvPath = path.join(__dirname, '..', 'historical_data', `${ticker}.csv`);

    const exists = fs.existsSync(csvPath);
    const upToDate = exists ? isDataUpToDate(csvPath) : false;

    let lastModified = null;
    if (exists) {
        const stats = fs.statSync(csvPath);
        lastModified = stats.mtime.toISOString();
    }

    res.json({
        exists,
        upToDate,
        lastModified
    });
});

// API endpoint to update stock data
app.post('/api/stock/:ticker/update', (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const pythonScript = path.join(__dirname, '..', 'download_ticker.py');

    console.log(`Updating data for ${ticker}...`);

    // Run the Python script with the ticker as argument
    const pythonProcess = spawn('python3', [pythonScript, ticker], {
        cwd: path.join(__dirname, '..')
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log(data.toString());
    });

    pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(data.toString());
    });

    pythonProcess.on('close', (code) => {
        if (code === 0) {
            console.log(`Successfully updated data for ${ticker}`);
            res.json({
                success: true,
                message: `Successfully updated data for ${ticker}`,
                output: output
            });
        } else {
            console.error(`Failed to update data for ${ticker}. Exit code: ${code}`);
            res.status(500).json({
                success: false,
                message: `Failed to update data for ${ticker}`,
                error: errorOutput || output
            });
        }
    });

    pythonProcess.on('error', (error) => {
        console.error(`Error running Python script: ${error.message}`);
        res.status(500).json({
            success: false,
            message: 'Failed to run update script',
            error: error.message
        });
    });
});

// API endpoint to transpile DSL expressions
app.post('/api/transpile', (req, res) => {
    const { expression, ticker, dataLength } = req.body;

    if (!expression) {
        return res.status(400).json({ error: 'No expression provided' });
    }

    const transpileScript = path.join(__dirname, '..', 'blink-dsl', 'transpile.py');

    // Use provided ticker and dataLength, or defaults
    const actualTicker = ticker || 'NVDA';
    const actualDataLength = dataLength || '180';

    console.log(`Transpiling expression: ${expression} for ${actualTicker} (${actualDataLength} days)`);

    // Run the transpile.py script with expression, ticker, and dataLength
    const pythonProcess = spawn('python3', [transpileScript, expression, actualTicker, actualDataLength], {
        cwd: path.join(__dirname, '..', 'blink-dsl')
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
        if (code === 0) {
            console.log(`Transpile successful`);
            res.json({
                success: true,
                output: output,
                expression: expression
            });
        } else {
            console.error(`Transpile failed. Exit code: ${code}`);
            res.status(500).json({
                success: false,
                error: errorOutput || output
            });
        }
    });

    pythonProcess.on('error', (error) => {
        console.error(`Error running transpile script: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    });
});

// Track Parrot compilation status per expression hash
const parrotCompilationStatus = new Map();

// API endpoint to start Parrot CUDA compilation in background
// Returns immediately with the code hash, compilation happens asynchronously
// The hash is based on the generated C++ code, not the expression - this ensures
// cache invalidation when the transpiler logic changes.
app.post('/api/parrot/compile', (req, res) => {
    const { expression } = req.body;

    if (!expression) {
        return res.status(400).json({ error: 'No expression provided' });
    }

    const parrotScript = path.join(__dirname, '..', 'blink-dsl', 'parrot_transpile.py');

    // Check if this expression is already compiled (look through status map)
    for (const [hash, status] of parrotCompilationStatus.entries()) {
        if (!hash.startsWith('compiling:') && !hash.startsWith('failed:') && 
            status.expression === expression && status.status === 'compiled') {
            console.log(`✅ Parrot expression already compiled: ${hash}`);
            return res.json({
                success: true,
                hash: hash,
                status: 'compiled',
                cached: true,
                executable: status.executable
            });
        }
    }

    // Check if this expression is already being compiled (use expression as temp key)
    const tempKey = `compiling:${expression}`;
    if (parrotCompilationStatus.get(tempKey)) {
        return res.json({
            success: true,
            hash: null,
            status: 'compiling',
            cached: false
        });
    }

    // Mark as compiling (using expression as temp key until we get the code hash)
    parrotCompilationStatus.set(tempKey, { status: 'compiling', expression });

    console.log(`🔧 Starting Parrot compilation for: ${expression}`);

    // Run compilation in background
    const pythonProcess = spawn('python3', [parrotScript, 'compile', expression], {
        cwd: path.join(__dirname, '..', 'blink-dsl')
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
        // Update temp key to failed status instead of deleting
        // This way the client can see the failure

        if (code === 0) {
            try {
                const result = JSON.parse(output);
                const codeHash = result.hash;

                // Remove temp key
                parrotCompilationStatus.delete(tempKey);

                if (result.success) {
                    parrotCompilationStatus.set(codeHash, {
                        status: 'compiled',
                        expression,
                        executable: result.executable
                    });
                    console.log(`✅ Parrot compilation successful for: ${codeHash}`);
                } else {
                    // Store failure with a generated key based on expression
                    const failKey = `failed:${expression}`;
                    parrotCompilationStatus.set(failKey, {
                        status: 'failed',
                        expression,
                        error: result.message
                    });
                    console.error(`❌ Parrot compilation failed: ${result.message}`);
                }
            } catch (e) {
                // Store failure
                parrotCompilationStatus.delete(tempKey);
                const failKey = `failed:${expression}`;
                parrotCompilationStatus.set(failKey, {
                    status: 'failed',
                    expression,
                    error: `Parse error: ${e.message}`
                });
                console.error(`❌ Parrot compilation parse error: ${e.message}`);
            }
        } else {
            // Store failure for non-zero exit code
            parrotCompilationStatus.delete(tempKey);
            const failKey = `failed:${expression}`;
            parrotCompilationStatus.set(failKey, {
                status: 'failed',
                expression,
                error: errorOutput || 'Unknown error'
            });
            console.error(`❌ Parrot compilation failed: ${errorOutput}`);
        }
    });

    pythonProcess.on('error', (error) => {
        parrotCompilationStatus.delete(tempKey);
        const failKey = `failed:${expression}`;
        parrotCompilationStatus.set(failKey, {
            status: 'failed',
            expression,
            error: error.message
        });
        console.error(`❌ Parrot compilation error: ${error.message}`);
    });

    // Return immediately - compilation happens in background
    // Client will need to poll for the hash once compilation completes
    res.json({
        success: true,
        hash: null,  // Hash not known yet - based on generated code
        status: 'compiling',
        cached: false
    });
});

// API endpoint to check Parrot compilation status by hash
app.get('/api/parrot/status/:hash', (req, res) => {
    const hash = req.params.hash;
    const status = parrotCompilationStatus.get(hash);

    if (!status) {
        return res.json({
            success: false,
            status: 'unknown',
            hash: hash
        });
    }

    res.json({
        success: true,
        hash: hash,
        status: status.status,
        error: status.error || null
    });
});

// API endpoint to check Parrot compilation status by expression
// Since hash is based on generated code, we need to look up by expression
app.post('/api/parrot/status-by-expr', (req, res) => {
    const { expression } = req.body;

    if (!expression) {
        return res.status(400).json({ error: 'No expression provided' });
    }

    // Check if still compiling
    const tempKey = `compiling:${expression}`;
    if (parrotCompilationStatus.get(tempKey)) {
        return res.json({
            success: true,
            status: 'compiling',
            hash: null
        });
    }

    // Check if failed
    const failKey = `failed:${expression}`;
    const failedStatus = parrotCompilationStatus.get(failKey);
    if (failedStatus) {
        return res.json({
            success: true,
            hash: null,
            status: 'failed',
            error: failedStatus.error || 'Unknown error'
        });
    }

    // Look for compiled status by expression
    for (const [hash, status] of parrotCompilationStatus.entries()) {
        if (!hash.startsWith('compiling:') && !hash.startsWith('failed:') && status.expression === expression) {
            return res.json({
                success: true,
                hash: hash,
                status: status.status,
                error: status.error || null,
                executable: status.executable || null
            });
        }
    }

    // Not found
    return res.json({
        success: false,
        status: 'unknown',
        hash: null
    });
});

// API endpoint to run a compiled Parrot expression
app.post('/api/parrot/run', (req, res) => {
    const { expression, data } = req.body;

    if (!expression || !data || !Array.isArray(data)) {
        return res.status(400).json({ error: 'Expression and data array required' });
    }

    const parrotScript = path.join(__dirname, '..', 'blink-dsl', 'parrot_transpile.py');

    console.log(`🚀 Running Parrot expression: ${expression} with ${data.length} data points`);

    // Run the parrot_transpile.py script with run command
    const pythonProcess = spawn('python3', [parrotScript, 'run', expression, JSON.stringify(data)], {
        cwd: path.join(__dirname, '..', 'blink-dsl')
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
        if (code === 0) {
            try {
                const result = JSON.parse(output);
                res.json({
                    success: result.success,
                    result: result.result,
                    message: result.message
                });
            } catch (e) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to parse execution output'
                });
            }
        } else {
            res.status(500).json({
                success: false,
                error: errorOutput || output
            });
        }
    });

    pythonProcess.on('error', (error) => {
        res.status(500).json({
            success: false,
            error: error.message
        });
    });
});

// API endpoint to verify Parrot result against BQN result
// Runs the Parrot executable with the data (close prices or volume) and compares to the stored BQN result
app.post('/api/parrot/verify', (req, res) => {
    const { expression, ticker, dataLength, bqnResult } = req.body;

    if (!expression || !ticker || !dataLength || bqnResult === undefined) {
        return res.status(400).json({ error: 'Expression, ticker, dataLength, and bqnResult required' });
    }

    // Look up by expression since hash is based on generated code
    let executable = null;
    for (const [hash, status] of parrotCompilationStatus.entries()) {
        if (!hash.startsWith('compiling:') && status.expression === expression && status.status === 'compiled') {
            executable = status.executable;
            break;
        }
    }

    if (!executable) {
        return res.json({
            success: false,
            verified: false,
            error: 'Parrot expression not compiled'
        });
    }
    const csvPath = path.join(__dirname, '..', 'historical_data', `${ticker}.csv`);

    if (!fs.existsSync(csvPath)) {
        return res.json({
            success: false,
            verified: false,
            error: `Data file not found for ticker: ${ticker}`
        });
    }

    // Determine which column to read based on expression
    // 'v' or 'V' means volume, 'c' or 'C' means close prices
    const useVolume = /[vV]/.test(expression) && !/[cC]/.test(expression);
    const columnName = useVolume ? 'Volume' : 'Close';

    // Read data from CSV
    const dataValues = [];

    fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
            const value = parseFloat(row[columnName]);
            if (!isNaN(value)) {
                dataValues.push(value);
            }
        })
        .on('end', () => {
            // Take the last dataLength values
            const values = dataValues.slice(-parseInt(dataLength));
            const valueStr = values.join(' ');

            console.log(`🔍 Verifying Parrot result for: ${expression} (${values.length} ${columnName} values)`);

            // Run the Parrot executable
            const parrotProcess = spawn(executable, [values.length.toString()], {
                cwd: path.join(__dirname, '..', 'blink-dsl')
            });

            let parrotOutput = '';
            let parrotError = '';

            // Send data to stdin
            parrotProcess.stdin.write(valueStr);
            parrotProcess.stdin.end();

            parrotProcess.stdout.on('data', (data) => {
                parrotOutput += data.toString();
            });

            parrotProcess.stderr.on('data', (data) => {
                parrotError += data.toString();
            });

            parrotProcess.on('close', (code) => {
                if (code !== 0) {
                    return res.json({
                        success: false,
                        verified: false,
                        error: parrotError || 'Parrot execution failed'
                    });
                }

                // Parse Parrot result
                const parrotResult = parrotOutput.trim();

                // Compare results
                // BQN result might be a number or an array string
                // Parrot result is space-separated numbers or a single number

                let match = false;
                const tolerance = 0.0001; // Allow small floating point differences

                // Try parsing as single numbers first
                const bqnNum = parseFloat(String(bqnResult).replace(/¯/g, '-'));
                const parrotNum = parseFloat(parrotResult);

                if (!isNaN(bqnNum) && !isNaN(parrotNum)) {
                    // Both are single numbers
                    match = Math.abs(bqnNum - parrotNum) < tolerance * Math.max(1, Math.abs(bqnNum));
                } else {
                    // Try comparing as arrays
                    // BQN arrays look like: ⟨ 1.2 3.4 5.6 ⟩ or space-separated
                    // Parrot arrays are space-separated
                    const bqnStr = String(bqnResult).replace(/[⟨⟩\[\]]/g, '').replace(/¯/g, '-').trim();
                    const bqnVals = bqnStr.split(/\s+/).map(v => parseFloat(v)).filter(v => !isNaN(v));
                    const parrotVals = parrotResult.split(/\s+/).map(v => parseFloat(v)).filter(v => !isNaN(v));

                    if (bqnVals.length === parrotVals.length && bqnVals.length > 0) {
                        match = bqnVals.every((v, i) =>
                            Math.abs(v - parrotVals[i]) < tolerance * Math.max(1, Math.abs(v))
                        );
                    }
                }

                console.log(`${match ? '✅' : '❌'} Verification: BQN=${bqnResult}, Parrot=${parrotResult}, Match=${match}`);

                res.json({
                    success: true,
                    verified: match,
                    bqnResult: bqnResult,
                    parrotResult: parrotResult
                });
            });

            parrotProcess.on('error', (error) => {
                res.json({
                    success: false,
                    verified: false,
                    error: error.message
                });
            });
        })
        .on('error', (error) => {
            res.json({
                success: false,
                verified: false,
                error: error.message
            });
        });
});

// API endpoint to screen a ticker with a compiled Parrot expression (CUDA)
// Similar to verify but just returns the result without comparing to BQN
app.post('/api/parrot/screen', (req, res) => {
    const { expression, ticker, dataLength } = req.body;

    if (!expression || !ticker || !dataLength) {
        return res.status(400).json({ error: 'Expression, ticker, and dataLength required' });
    }

    // Look up by expression since hash is based on generated code
    let executable = null;
    for (const [hash, status] of parrotCompilationStatus.entries()) {
        if (!hash.startsWith('compiling:') && !hash.startsWith('failed:') && status.expression === expression && status.status === 'compiled') {
            executable = status.executable;
            break;
        }
    }

    if (!executable) {
        return res.json({
            success: false,
            error: 'Parrot expression not compiled'
        });
    }

    const csvPath = path.join(__dirname, '..', 'historical_data', `${ticker}.csv`);

    if (!fs.existsSync(csvPath)) {
        return res.json({
            success: false,
            error: `Data file not found for ticker: ${ticker}`
        });
    }

    // Determine which column to read based on expression
    // 'v' or 'V' means volume, 'c' or 'C' means close prices
    const useVolume = /[vV]/.test(expression) && !/[cC]/.test(expression);
    const columnName = useVolume ? 'Volume' : 'Close';

    // Read data from CSV
    const dataValues = [];

    fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
            const value = parseFloat(row[columnName]);
            if (!isNaN(value)) {
                dataValues.push(value);
            }
        })
        .on('end', () => {
            // Take the last dataLength values
            const values = dataValues.slice(-parseInt(dataLength));
            const valueStr = values.join(' ');

            // Run the Parrot executable
            const parrotProcess = spawn(executable, [values.length.toString()], {
                cwd: path.join(__dirname, '..', 'blink-dsl')
            });

            let parrotOutput = '';
            let parrotError = '';

            // Send data to stdin
            parrotProcess.stdin.write(valueStr);
            parrotProcess.stdin.end();

            parrotProcess.stdout.on('data', (data) => {
                parrotOutput += data.toString();
            });

            parrotProcess.stderr.on('data', (data) => {
                parrotError += data.toString();
            });

            parrotProcess.on('close', (code) => {
                if (code !== 0) {
                    return res.json({
                        success: false,
                        error: parrotError || 'Parrot execution failed'
                    });
                }

                // Parse result
                const result = parrotOutput.trim();
                const value = parseFloat(result);

                res.json({
                    success: true,
                    result: isNaN(value) ? result : value,
                    ticker: ticker
                });
            });

            parrotProcess.on('error', (error) => {
                res.json({
                    success: false,
                    error: error.message
                });
            });
        })
        .on('error', (error) => {
            res.json({
                success: false,
                error: error.message
            });
        });
});

app.listen(PORT, () => {
    console.log(`Blink JavaScript Stock Analysis server running on http://localhost:${PORT}`);
    console.log('Loading all available tickers from historical_data/');
    console.log('');
    console.log('📊 Features:');
    console.log('  ✅ Interactive candlestick charts');
    console.log('  ✅ Volume analysis');
    console.log('  ✅ Technical indicators (SMA 10/20/50, Bollinger Bands)');
    console.log('  ✅ Real-time crosshairs and data display');
    console.log('  ✅ Multiple time windows (6M/1Y/5Y)');
    console.log('  ✅ Keyboard shortcuts (F11, 1-3, Ctrl+Q/W)');
    console.log('  ✅ Data update functionality');
    console.log('  ✅ DSL transpilation (/ to open DSL mode)');
    console.log('');
}); 