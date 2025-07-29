const express = require('express');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
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
        const files = fs.readdirSync(historicalDataPath);
        const tickers = files
            .filter(file => file.endsWith('.csv'))
            .map(file => file.replace('.csv', ''))
            .sort(); // Sort alphabetically first

        // Move NVDA to the front if it exists
        const nvdaIndex = tickers.indexOf('NVDA');
        if (nvdaIndex > -1) {
            tickers.splice(nvdaIndex, 1);
            tickers.unshift('NVDA');
        }

        res.json(tickers);
    } catch (error) {
        console.error('Error reading historical data directory:', error);
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

app.listen(PORT, () => {
    console.log(`M3 JavaScript Stock Analysis server running on http://localhost:${PORT}`);
    console.log('Available tickers: AAPL, GOOG, NVDA, TSLA');
    console.log('');
    console.log('📊 Features:');
    console.log('  ✅ Interactive candlestick charts');
    console.log('  ✅ Volume analysis');
    console.log('  ✅ Technical indicators (SMA 10/20/50, Bollinger Bands)');
    console.log('  ✅ Real-time crosshairs and data display');
    console.log('  ✅ Multiple time windows (6M/1Y/5Y)');
    console.log('  ✅ Keyboard shortcuts (F11, 1-3, Ctrl+Q/W)');
    console.log('  ✅ Data update functionality');
    console.log('');
}); 