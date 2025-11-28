# Blink Technical Stock Analysis

A web-based application that provides interactive stock chart analysis with technical indicators.

## Features

- **Interactive Candlestick Charts**: Real-time price visualization with OHLC data
- **Volume Analysis**: Color-coded volume bars below price charts
- **Technical Indicators**:
  - Simple Moving Averages (SMA 10, 20, 50)
  - Bollinger Bands (20-period, 2 standard deviations)
- **Multiple Time Windows**: 6 months, 1 year, 5 years
- **Real-time Crosshairs**: Mouse tracking with data point selection
- **Status Bar**: Shows detailed OHLC data and daily percentage changes
- **Dark Theme**: Professional financial application styling
- **Keyboard Shortcuts**: Comprehensive keyboard controls

## Installation & Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Server**:
   ```bash
   npm start
   ```

3. **Open in Browser**:
   Navigate to `http://localhost:3000`

## Available Data

The application comes with historical data for these tickers:
- **AAPL** - Apple Inc.
- **GOOG** - Alphabet Inc.
- **NVDA** - NVIDIA Corporation
- **TSLA** - Tesla Inc.

## Controls

### Keyboard Shortcuts
- **F11**: Toggle fullscreen mode
- **1, 2, 3**: Switch between time windows (6M, 1Y, 5Y)
- **Ctrl+Q/W**: Close application (browser-specific)
- **Enter**: Load data after typing ticker symbol

### Mouse Controls
- **Hover**: Display crosshairs and data point information
- **Click**: Time window buttons to change chart periods

## Technical Indicators

### Simple Moving Averages (SMA)
- **SMA 10**: 10-period moving average (white line, 40% opacity)
- **SMA 20**: 20-period moving average (magenta line, 40% opacity)  
- **SMA 50**: 50-period moving average (purple line, 40% opacity)

### Bollinger Bands
- **Upper/Lower Bands**: 20-period SMA ± 2 standard deviations (yellow dashed lines, 40% opacity)
- **Middle Band**: 20-period SMA (coincides with SMA 20)

## Architecture

### Backend (Node.js/Express)
- **server.js**: Express server serving static files and API endpoints
- **API Endpoint**: `/api/stock/:ticker` - Returns CSV data as JSON

### Frontend (Vanilla JavaScript)
- **index.html**: Main interface layout
- **styles.css**: Dark theme styling
- **technical-indicators.js**: SMA, Bollinger Bands, and data filtering functions
- **app.js**: Main application logic with Chart.js integration

### Libraries Used
- **Chart.js**: Chart rendering engine
- **chartjs-chart-financial**: Candlestick chart support
- **chartjs-adapter-date-fns**: Date/time handling for charts

## Data Format

CSV files in `historical_data/` directory with columns:
- Date (ISO format with timezone)
- Open, High, Low, Close (price values)
- Volume (trading volume)
- Dividends, Stock Splits (not used in visualization)

## Development

### Adding New Tickers
1. Place CSV file in `historical_data/` directory
2. Follow naming convention: `TICKER.csv`
3. Ensure CSV has required columns: Date, Open, High, Low, Close, Volume

### Customizing Technical Indicators
Modify functions in `technical-indicators.js`:
- `calculateSMA(data, period)` - Change periods or add new SMAs
- `calculateBollingerBands(data, period, stdDev)` - Adjust parameters
- Add new indicators by creating calculation functions

### Styling Changes
Edit `styles.css` to modify:
- Color scheme (current: dark theme with blue accents)
- Layout proportions (price chart: 80%, volume chart: 20%)
- Font family (current: JetBrains Mono)

## Performance Notes

- Chart rendering optimized for datasets up to ~10,000 data points
- Mouse tracking throttled to reduce CPU usage
- Technical indicators calculated once per data load
- Responsive design adapts to different screen sizes

## Browser Compatibility

- Modern browsers with ES6+ support
- HTML5 Canvas support required
- WebGL recommended for optimal Chart.js performance 