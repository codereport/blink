const express = require('express');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static files
app.use(express.static('.'));

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
    console.log('');
}); 