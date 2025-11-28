# Blink Technical Stock Analysis

A comprehensive technical stock analysis web application.

## 📊 Project Structure

```
blink/
├── dev/                   # Web application
│   ├── server.js          # Express server
│   ├── index.html         # Web interface
│   ├── app.js             # Main application logic
│   └── package.json       # JavaScript dependencies
├── historical_data/       # Stock data (CSV files)
│   ├── AAPL.csv           # Apple Inc.
│   ├── GOOG.csv           # Alphabet Inc.
│   ├── NVDA.csv           # NVIDIA Corporation
│   └── TSLA.csv           # Tesla Inc.
└── README.md              # This file
```

## 🚀 Quick Start

```bash
cd dev
npm install
npm start
# Open http://localhost:3000 in your browser
```

## ✨ Features

- **📈 Interactive Candlestick Charts**: Real-time OHLC price visualization
- **📊 Volume Analysis**: Color-coded volume bars
- **🔢 Technical Indicators**:
  - Simple Moving Averages (SMA 10, 20, 50)
  - Bollinger Bands (20-period, 2 standard deviations)
- **⏱️ Multiple Time Windows**: 6 months, 1 year, 5 years
- **🎯 Real-time Crosshairs**: Mouse tracking with data point selection
- **📋 Status Bar**: Live OHLC, volume, date, and daily % changes
- **🎨 Dark Theme**: Professional financial application styling
- **⌨️ Keyboard Shortcuts**: F11 (fullscreen), 1-3 (time windows), Ctrl+Q/W (exit)

## 🎯 Available Tickers

- **AAPL** - Apple Inc.
- **GOOG** - Alphabet Inc.
- **NVDA** - NVIDIA Corporation
- **TSLA** - Tesla Inc.

## 📝 Technical Details

### Data Format
Historical data is stored in CSV format with columns:
- Date (ISO format with timezone)
- Open, High, Low, Close (price values)
- Volume (trading volume)

### Technical Indicators
- **SMA**: Simple moving averages calculated over specified periods
- **Bollinger Bands**: Standard deviation bands around 20-period SMA
- **Daily % Change**: Percentage change from previous day's close

### Mouse Interaction
- Hover over charts to display crosshairs
- Status bar updates with current data point information
- Smooth real-time tracking with optimized redraw performance

## 🛠️ Development

The application is built with Node.js/Express on the backend and vanilla JavaScript with Chart.js on the frontend, providing easy deployment and cross-platform compatibility. 