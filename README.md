# M3 Technical Stock Analysis

A comprehensive technical stock analysis application available in both **Rust** and **JavaScript** implementations.

## 📊 Project Structure

```
3m/
├── m3/                    # Rust implementation (original)
│   ├── src/main.rs       # Rust source code
│   └── Cargo.toml        # Rust dependencies
├── m3_js/                # JavaScript implementation (web version)
│   ├── server.js         # Express server
│   ├── index.html        # Web interface
│   ├── app.js           # Main application logic
│   └── package.json     # JavaScript dependencies
├── historical_data/      # Shared stock data (CSV files)
│   ├── AAPL.csv         # Apple Inc.
│   ├── GOOG.csv         # Alphabet Inc.
│   ├── NVDA.csv         # NVIDIA Corporation
│   └── TSLA.csv         # Tesla Inc.
└── README.md            # This file
```

## 🚀 Quick Start

### JavaScript Web Version (Recommended for quick testing)
```bash
cd m3_js
npm install
npm start
# Open http://localhost:3000 in your browser
```

### Rust Native Version
```bash
cd m3
cargo run
```

## ✨ Features (Both Versions)

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

## 🔧 Implementation Comparison

| Feature          | Rust Version      | JavaScript Version       |
| ---------------- | ----------------- | ------------------------ |
| **Performance**  | Native, very fast | Web-optimized, fast      |
| **Deployment**   | Single executable | Web server + browser     |
| **UI Framework** | Iced GUI          | Custom Canvas + Chart.js |
| **Platform**     | Desktop native    | Cross-platform web       |
| **Dependencies** | Minimal           | Node.js + browser        |
| **Development**  | Rust ecosystem    | Web standards            |

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

Both implementations share the same core functionality and visual design. The JavaScript version provides easier deployment and cross-platform compatibility, while the Rust version offers superior native performance.

Choose the implementation that best fits your deployment needs and development preferences! 