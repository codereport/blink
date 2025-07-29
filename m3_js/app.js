// Main application state
// Performance optimizations implemented:
// 1. Cache technical indicators to avoid O(n²) recalculation on time window changes
// 2. Update charts instead of recreating them when possible  
// 3. Debounce time window changes to prevent rapid switching issues
// 4. Optimized SMA and Bollinger Bands calculations with sliding window approach
class StockApp {
    constructor() {
        this.stockData = [];
        this.filteredData = [];
        this.tradingDaysData = [];
        this.currentTicker = 'NVDA';
        this.currentTimeWindow = '6m';
        this.priceChart = null;
        this.volumeChart = null;
        this.selectedDataPoint = null;
        this.selectedTradingDayIndex = null;
        this.mousePosition = null;
        this.crosshairOverlays = {};
        this.isUpdating = false;

        // Performance optimization: cache technical indicators
        this.cachedIndicators = null;
        this.cachedTradingDaysData = null;
        this.lastDataLength = 0;

        // Debounce time window changes for better performance
        this.timeWindowChangeTimeout = null;

        // Mouse event throttling
        this.lastMouseMoveTime = 0;
        this.chartEventListeners = {};

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadData(this.currentTicker);
        this.checkDataStatus(this.currentTicker);
    }

    setupEventListeners() {
        // Ticker input and buttons
        const tickerInput = document.getElementById('ticker-input');
        const loadButton = document.getElementById('load-button');
        const updateButton = document.getElementById('update-button');

        tickerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.loadData(tickerInput.value);
                tickerInput.blur();
            }
        });

        loadButton.addEventListener('click', () => {
            this.loadData(tickerInput.value);
            tickerInput.blur();
        });

        updateButton.addEventListener('click', () => {
            this.updateData(tickerInput.value);
        });

        // Time window buttons
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.changeTimeWindow(btn.dataset.window);
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && (e.key === 'q' || e.key === 'w')) {
                e.preventDefault();
                window.close();
            } else if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.updateData(tickerInput.value);
            } else if (e.key === 'F11') {
                e.preventDefault();
                this.toggleFullscreen();
            } else if (e.key === ' ' && e.target !== tickerInput) {
                // Spacebar - focus ticker input and clear it (only if not already focused)
                e.preventDefault();
                tickerInput.value = '';
                tickerInput.focus();
            } else if (e.key >= '1' && e.key <= '3') {
                const windows = ['6m', '1y', '5y'];
                this.changeTimeWindow(windows[parseInt(e.key) - 1]);
            }
        });
    }

    async loadData(ticker) {
        if (!ticker.trim()) return;

        this.currentTicker = ticker.toUpperCase();
        document.getElementById('ticker-input').value = this.currentTicker;

        // Check data status when loading new ticker
        this.checkDataStatus(this.currentTicker);

        try {
            const response = await fetch(`/api/stock/${this.currentTicker}`);

            if (!response.ok) {
                throw new Error(`Data not found for ticker: ${this.currentTicker}`);
            }

            const data = await response.json();
            this.stockData = data;

            // Clear cache when new data is loaded
            this.clearCache();
            this.updateCharts();

        } catch (error) {
            console.error('Error loading data:', error);
            this.stockData = [];
            this.updateCharts();
            this.updateStatusBar('Error loading data: ' + error.message);
        }
    }

    changeTimeWindow(timeWindow) {
        this.currentTimeWindow = timeWindow;

        // Update button states immediately for responsiveness
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.window === timeWindow);
        });

        // Debounce chart updates to prevent rapid switching performance issues
        if (this.timeWindowChangeTimeout) {
            clearTimeout(this.timeWindowChangeTimeout);
        }

        // Immediately show loading state to prevent visual lag
        this.showLoadingState();

        this.timeWindowChangeTimeout = setTimeout(() => {
            this.updateCharts();
        }, 100); // 100ms debounce
    }

    clearCache() {
        this.cachedIndicators = null;
        this.cachedTradingDaysData = null;
        this.lastDataLength = 0;
    }

    showLoadingState() {
        // Update status bar to show loading
        const statusText = document.getElementById('status-text');
        statusText.textContent = 'Updating charts...';
    }

    updateCharts() {
        // Performance optimization: filter data first
        this.filteredData = filterDataByTimeWindow(this.stockData, this.currentTimeWindow);

        // Cache trading days data and indicators if not already cached or data changed
        if (!this.cachedTradingDaysData || this.stockData.length !== this.lastDataLength) {
            this.cachedTradingDaysData = this.stockData.filter(d => d.volume > 0);
            this.cachedIndicators = prepareIndicatorDatasets(this.cachedTradingDaysData);
            this.lastDataLength = this.stockData.length;

            console.log('Cached indicators created:', {
                totalTradingDays: this.cachedTradingDaysData.length,
                sma10Count: this.cachedIndicators.sma10.length,
                sma20Count: this.cachedIndicators.sma20.length,
                sma50Count: this.cachedIndicators.sma50.length,
                bollingerUpperCount: this.cachedIndicators.bollingerBands.upper.length
            });
        }

        // Filter cached trading days data for current time window
        const filteredTradingDays = filterDataByTimeWindow(this.cachedTradingDaysData, this.currentTimeWindow);
        this.tradingDaysData = filteredTradingDays;

        this.createPriceChart();
        this.createVolumeChart();
        this.selectedDataPoint = null;
        this.selectedTradingDayIndex = null;
        this.updateStatusBar();
    }

    getFilteredIndicators(tradingDaysData) {
        if (!this.cachedIndicators || !tradingDaysData || tradingDaysData.length === 0) {
            return {
                sma10: [],
                sma20: [],
                sma50: [],
                bollingerBands: { upper: [], middle: [], lower: [] }
            };
        }

        // Map trading days data timestamps for filtering
        const tradingDaysTimestamps = new Set(tradingDaysData.map(d => d.timestamp));

        // Filter cached indicators to match current time window
        // Keep timestamps as x values since SimpleCandlestickChart expects them
        return {
            sma10: this.cachedIndicators.sma10.filter(point =>
                tradingDaysTimestamps.has(point.x)
            ),
            sma20: this.cachedIndicators.sma20.filter(point =>
                tradingDaysTimestamps.has(point.x)
            ),
            sma50: this.cachedIndicators.sma50.filter(point =>
                tradingDaysTimestamps.has(point.x)
            ),
            bollingerBands: {
                upper: this.cachedIndicators.bollingerBands.upper.filter(point =>
                    tradingDaysTimestamps.has(point.x)
                ),
                middle: this.cachedIndicators.bollingerBands.middle.filter(point =>
                    tradingDaysTimestamps.has(point.x)
                ),
                lower: this.cachedIndicators.bollingerBands.lower.filter(point =>
                    tradingDaysTimestamps.has(point.x)
                )
            }
        };
    }

    getFilteredIndicatorsForChartJS(tradingDaysData) {
        if (!this.cachedIndicators || !tradingDaysData || tradingDaysData.length === 0) {
            return {
                sma10: [],
                sma20: [],
                sma50: [],
                bollingerBands: { upper: [], middle: [], lower: [] }
            };
        }

        // Map trading days data timestamps for filtering
        const tradingDaysTimestamps = new Set(tradingDaysData.map(d => d.timestamp));

        // Filter cached indicators and convert to index format for Chart.js
        return {
            sma10: this.cachedIndicators.sma10.filter(point =>
                tradingDaysTimestamps.has(point.x)
            ).map((point, index) => ({
                x: index,
                y: point.y
            })),
            sma20: this.cachedIndicators.sma20.filter(point =>
                tradingDaysTimestamps.has(point.x)
            ).map((point, index) => ({
                x: index,
                y: point.y
            })),
            sma50: this.cachedIndicators.sma50.filter(point =>
                tradingDaysTimestamps.has(point.x)
            ).map((point, index) => ({
                x: index,
                y: point.y
            })),
            bollingerBands: {
                upper: this.cachedIndicators.bollingerBands.upper.filter(point =>
                    tradingDaysTimestamps.has(point.x)
                ).map((point, index) => ({
                    x: index,
                    y: point.y
                })),
                middle: this.cachedIndicators.bollingerBands.middle.filter(point =>
                    tradingDaysTimestamps.has(point.x)
                ).map((point, index) => ({
                    x: index,
                    y: point.y
                })),
                lower: this.cachedIndicators.bollingerBands.lower.filter(point =>
                    tradingDaysTimestamps.has(point.x)
                ).map((point, index) => ({
                    x: index,
                    y: point.y
                }))
            }
        };
    }

    createPriceChart() {
        const ctx = document.getElementById('price-chart').getContext('2d');

        if (this.priceChart) {
            this.priceChart.destroy();
        }

        if (this.filteredData.length === 0) {
            this.priceChart = new Chart(ctx, {
                type: 'line',
                data: { datasets: [] },
                options: this.getEmptyChartOptions()
            });
            return;
        }

        console.log('Creating price chart with', this.filteredData.length, 'data points');

        // Try simple candlestick approach first
        try {
            const canvas = document.getElementById('price-chart');

            // Use pre-filtered trading days data
            const tradingDaysData = this.tradingDaysData;

            // Use cached indicators filtered for current time window
            const indicators = this.getFilteredIndicators(tradingDaysData);

            console.log('Indicators for SimpleCandlestickChart:', {
                sma10Count: indicators.sma10.length,
                sma20Count: indicators.sma20.length,
                sma50Count: indicators.sma50.length,
                bollingerUpperCount: indicators.bollingerBands.upper.length
            });

            // Update existing chart or create new one
            if (this.simpleCandlesticks && this.simpleCandlesticks.canvas === canvas) {
                this.simpleCandlesticks.updateData(tradingDaysData, indicators);
            } else {
                // Clean up old chart if it exists
                if (this.simpleCandlesticks) {
                    this.simpleCandlesticks.removeMouseEvents();
                }
                this.simpleCandlesticks = new SimpleCandlestickChart(canvas, tradingDaysData);
                this.simpleCandlesticks.draw(indicators);
            }

            // Create crosshair overlay for candlestick chart
            this.createCrosshairOverlay('price-chart');

            // Setup mouse events with proper callbacks
            this.simpleCandlesticks.setupMouseEvents(
                (dataIndex, mouseX, mouseY) => {
                    // dataIndex is now the trading day index since we filtered the data
                    this.selectedTradingDayIndex = dataIndex;

                    // Find corresponding index in full filtered data for status bar
                    const tradingDay = tradingDaysData[dataIndex];
                    this.selectedDataPoint = this.filteredData.findIndex(d => d.timestamp === tradingDay.timestamp);

                    this.updateStatusBar();

                    // Draw crosshairs on overlays instead of redrawing charts
                    this.drawCandlestickCrosshair();
                    this.drawVolumeChartCrosshair();
                },
                () => {
                    // Clear selection on mouse leave
                    this.selectedDataPoint = null;
                    this.selectedTradingDayIndex = null;
                    this.updateStatusBar();

                    // Clear crosshairs on overlays
                    this.clearCandlestickCrosshair();
                    this.clearVolumeChartCrosshair();
                }
            );

            console.log('Simple candlestick chart created successfully with technical indicators and mouse tracking');
            return;

        } catch (error) {
            console.error('Simple candlestick failed:', error);
        }

        // Fallback to Chart.js with line charts
        console.log('Falling back to Chart.js line charts');

        // Use pre-filtered trading days data
        const tradingDaysData = this.tradingDaysData;

        // Prepare close price line data as fallback - use index for x to match volume chart
        const closeData = tradingDaysData.map((d, index) => ({
            x: index,
            y: d.close
        }));

        // Prepare high/low data for better visualization
        const highData = tradingDaysData.map((d, index) => ({
            x: index,
            y: d.high
        }));

        const lowData = tradingDaysData.map((d, index) => ({
            x: index,
            y: d.low
        }));

        console.log('Sample data:', closeData[0]);

        // Use cached indicators filtered for current time window (convert to index format for Chart.js)
        const indicators = this.getFilteredIndicatorsForChartJS(tradingDaysData);

        const datasets = [
            // High-Low range visualization
            {
                label: 'Price Range',
                type: 'line',
                data: highData,
                borderColor: 'rgba(100, 100, 100, 0.3)',
                backgroundColor: 'rgba(100, 100, 100, 0.1)',
                pointRadius: 0,
                borderWidth: 1,
                fill: '+1' // Fill to next dataset (low)
            },
            {
                label: 'Low',
                type: 'line',
                data: lowData,
                borderColor: 'rgba(100, 100, 100, 0.3)',
                backgroundColor: 'rgba(100, 100, 100, 0.1)',
                pointRadius: 0,
                borderWidth: 1,
                fill: false
            },
            // Close price line
            {
                label: 'Close Price',
                type: 'line',
                data: closeData,
                borderColor: 'rgba(255, 255, 255, 0.8)',
                backgroundColor: 'transparent',
                pointRadius: 0,
                borderWidth: 2,
                fill: false
            },
            {
                label: 'SMA 10',
                type: 'line',
                data: indicators.sma10,
                borderColor: 'rgba(255, 255, 255, 0.4)',
                backgroundColor: 'transparent',
                borderWidth: 1,
                pointRadius: 0,
                fill: false
            },
            {
                label: 'SMA 20',
                type: 'line',
                data: indicators.sma20,
                borderColor: 'rgba(255, 0, 255, 0.4)',
                backgroundColor: 'transparent',
                borderWidth: 1,
                pointRadius: 0,
                fill: false
            },
            {
                label: 'SMA 50',
                type: 'line',
                data: indicators.sma50,
                borderColor: 'rgba(138, 43, 226, 0.4)',
                backgroundColor: 'transparent',
                borderWidth: 1,
                pointRadius: 0,
                fill: false
            },
            {
                label: 'Bollinger Upper',
                type: 'line',
                data: indicators.bollingerBands.upper,
                borderColor: 'rgba(255, 255, 0, 0.4)',
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            },
            {
                label: 'Bollinger Lower',
                type: 'line',
                data: indicators.bollingerBands.lower,
                borderColor: 'rgba(255, 255, 0, 0.4)',
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            }
        ];

        console.log('Creating chart with datasets:', datasets.length);

        this.priceChart = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: this.getPriceChartOptions()
        });

        console.log('Chart created successfully');

        // Clean up old event listeners
        this.cleanupChartEventListeners('price-chart');

        // Create crosshair overlay for price chart (Chart.js fallback mode)
        this.createCrosshairOverlay('price-chart');

        // Add throttled mouse move event for crosshairs
        this.addChartEventListeners('price-chart', 'price');
    }

    createVolumeChart() {
        const canvas = document.getElementById('volume-chart');

        if (this.filteredData.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        console.log('Creating volume chart with', this.tradingDaysData.length, 'trading days (filtered from', this.filteredData.length, 'total days)');

        if (this.tradingDaysData.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        // Update existing chart or create new one
        try {
            if (this.simpleVolumeChart && this.simpleVolumeChart.canvas === canvas) {
                this.simpleVolumeChart.updateData(this.tradingDaysData);
            } else {
                this.simpleVolumeChart = new SimpleVolumeChart(canvas, this.tradingDaysData);
                this.simpleVolumeChart.draw();
            }

            console.log('Simple volume chart updated successfully');

            // Clean up old event listeners
            this.cleanupChartEventListeners('volume-chart');

            // Create crosshair overlay for volume chart
            this.createCrosshairOverlay('volume-chart');

            // Add throttled mouse move event for crosshairs
            this.addChartEventListeners('volume-chart', 'volume');

        } catch (error) {
            console.error('Simple volume chart failed:', error);
            // Fallback to empty chart
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    handleMouseMove(event, chartType) {
        if (!this.tradingDaysData.length) return;

        // Throttle mouse moves for better performance
        const now = Date.now();
        if (!this.lastMouseMoveTime) this.lastMouseMoveTime = 0;
        if (now - this.lastMouseMoveTime < 16) return; // ~60fps
        this.lastMouseMoveTime = now;

        const rect = event.target.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Get the appropriate chart based on chartType
        const chart = chartType === 'price' ?
            (this.simpleCandlesticks || this.priceChart) :
            this.simpleVolumeChart;

        if (!chart || !chart.chartArea) return;

        const chartArea = chart.chartArea;
        if (x >= chartArea.left && x <= chartArea.right) {
            // Both charts now use the same trading days data with same indices
            const dataIndex = Math.round((x - chartArea.left) / (chartArea.right - chartArea.left) * Math.max(0, this.tradingDaysData.length - 1));
            const selectedTradingDayIndex = Math.max(0, Math.min(dataIndex, this.tradingDaysData.length - 1));

            // Find the corresponding index in the full filtered data for status bar
            const tradingDay = this.tradingDaysData[selectedTradingDayIndex];
            const selectedIndex = this.filteredData.findIndex(d => d.timestamp === tradingDay.timestamp);

            if (this.selectedDataPoint !== selectedIndex) {
                this.selectedDataPoint = selectedIndex;
                this.selectedTradingDayIndex = selectedTradingDayIndex;
                this.updateStatusBar();
                this.drawCrosshairs();
            }
        }
    }

    handleMouseLeave() {
        this.selectedDataPoint = null;
        this.selectedTradingDayIndex = null;
        this.updateStatusBar();

        // Clear all crosshair overlays
        this.clearCandlestickCrosshair();
        this.clearVolumeChartCrosshair();
    }

    drawCrosshairs() {
        // Draw crosshairs on overlays for better performance
        this.drawCandlestickCrosshair();
        this.drawVolumeChartCrosshair();
    }

    createCrosshairOverlay(chartId) {
        const chartCanvas = document.getElementById(chartId);
        const container = chartCanvas.parentElement;

        // Remove existing overlay if present
        const existingOverlay = container.querySelector('.crosshair-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        // Create overlay canvas
        const overlay = document.createElement('canvas');
        overlay.className = 'crosshair-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '10';

        // Match the size and scaling of the chart canvas
        const rect = chartCanvas.getBoundingClientRect();
        overlay.width = rect.width * window.devicePixelRatio;
        overlay.height = rect.height * window.devicePixelRatio;
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';

        // Scale the overlay context to match the main canvas
        const overlayCtx = overlay.getContext('2d');
        overlayCtx.scale(window.devicePixelRatio, window.devicePixelRatio);

        container.style.position = 'relative';
        container.appendChild(overlay);

        this.crosshairOverlays[chartId] = overlay;
    }

    cleanupChartEventListeners(chartId) {
        const canvas = document.getElementById(chartId);
        if (!canvas) return;

        // Store references to remove specific listeners
        if (this.chartEventListeners && this.chartEventListeners[chartId]) {
            const listeners = this.chartEventListeners[chartId];
            if (listeners.mousemove) {
                canvas.removeEventListener('mousemove', listeners.mousemove);
            }
            if (listeners.mouseleave) {
                canvas.removeEventListener('mouseleave', listeners.mouseleave);
            }
        }
    }

    addChartEventListeners(chartId, chartType) {
        const canvas = document.getElementById(chartId);
        if (!canvas) return;

        // Initialize event listeners storage
        if (!this.chartEventListeners) {
            this.chartEventListeners = {};
        }

        // Create throttled event handlers
        const mousemoveHandler = (e) => this.handleMouseMove(e, chartType);
        const mouseleaveHandler = () => this.handleMouseLeave();

        // Store references for cleanup
        this.chartEventListeners[chartId] = {
            mousemove: mousemoveHandler,
            mouseleave: mouseleaveHandler
        };

        // Add event listeners
        canvas.addEventListener('mousemove', mousemoveHandler);
        canvas.addEventListener('mouseleave', mouseleaveHandler);
    }

    drawCandlestickCrosshair() {
        if (this.selectedTradingDayIndex === null || !this.tradingDaysData.length) return;

        const overlay = this.crosshairOverlays['price-chart'];
        if (!overlay) return;

        const ctx = overlay.getContext('2d');

        // Clear previous crosshair
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        // Handle SimpleCandlestickChart
        if (this.simpleCandlesticks) {
            const chartArea = this.simpleCandlesticks.chartArea;
            const xPosition = this.simpleCandlesticks.xPosition(this.selectedTradingDayIndex);

            // Get price data for horizontal crosshair
            const dataPoint = this.tradingDaysData[this.selectedTradingDayIndex];
            if (!dataPoint) return;

            const { min, max } = this.simpleCandlesticks.getMinMax();
            const closeY = this.simpleCandlesticks.yPosition(dataPoint.close, min, max);

            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);

            // Vertical line
            ctx.beginPath();
            ctx.moveTo(xPosition, chartArea.top);
            ctx.lineTo(xPosition, chartArea.bottom);
            ctx.stroke();

            // Horizontal line at close price
            ctx.beginPath();
            ctx.moveTo(chartArea.left, closeY);
            ctx.lineTo(chartArea.right, closeY);
            ctx.stroke();

            // Draw intersection point
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.beginPath();
            ctx.arc(xPosition, closeY, 3, 0, 2 * Math.PI);
            ctx.fill();

            ctx.restore();
        }
        // Handle Chart.js fallback mode
        else if (this.priceChart && this.priceChart.chartArea) {
            const priceChartArea = this.priceChart.chartArea;

            // Calculate x position based on trading day index
            const xPosition = priceChartArea.left +
                (this.selectedTradingDayIndex / Math.max(1, this.tradingDaysData.length - 1)) *
                (priceChartArea.right - priceChartArea.left);

            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);

            // Vertical line only for Chart.js fallback
            ctx.beginPath();
            ctx.moveTo(xPosition, priceChartArea.top);
            ctx.lineTo(xPosition, priceChartArea.bottom);
            ctx.stroke();

            ctx.restore();
        }
    }

    clearCandlestickCrosshair() {
        const overlay = this.crosshairOverlays['price-chart'];
        if (!overlay) return;

        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
    }

    drawVolumeChartCrosshair() {
        if (this.selectedTradingDayIndex === null || !this.simpleVolumeChart || !this.tradingDaysData.length) return;

        const overlay = this.crosshairOverlays['volume-chart'];
        if (!overlay) return;

        const ctx = overlay.getContext('2d');
        const volumeChartArea = this.simpleVolumeChart.chartArea;

        // Clear previous crosshair
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        // Calculate x position using the same method as SimpleVolumeChart
        const xPosition = this.simpleVolumeChart.xPosition(this.selectedTradingDayIndex);

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);

        // Vertical line
        ctx.beginPath();
        ctx.moveTo(xPosition, volumeChartArea.top);
        ctx.lineTo(xPosition, volumeChartArea.bottom);
        ctx.stroke();

        ctx.restore();
    }

    clearVolumeChartCrosshair() {
        const overlay = this.crosshairOverlays['volume-chart'];
        if (!overlay) return;

        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
    }



    updateStatusBar(errorMessage = null) {
        const statusText = document.getElementById('status-text');

        if (errorMessage) {
            statusText.textContent = errorMessage;
            return;
        }

        if (this.selectedDataPoint !== null && this.filteredData[this.selectedDataPoint]) {
            const dataPoint = this.filteredData[this.selectedDataPoint];
            const dailyChanges = calculateDailyChange(this.filteredData);
            const dailyChange = dailyChanges[this.selectedDataPoint] || 0;

            const date = new Date(dataPoint.timestamp).toISOString().split('T')[0];

            // Show volume as "No Trading" if it's zero (weekend/holiday)
            const volumeDisplay = dataPoint.volume === 0 ? 'No Trading'.padStart(12) : this.formatVolumeNumber(dataPoint.volume).padStart(12);

            statusText.textContent =
                `Date: ${date.padEnd(10)} | ` +
                `Daily % Gain/Loss: ${dailyChange.toFixed(2).padStart(8)}% | ` +
                `Volume: ${volumeDisplay} | ` +
                `Open: ${dataPoint.open.toFixed(2).padStart(8)} | ` +
                `High: ${dataPoint.high.toFixed(2).padStart(8)} | ` +
                `Low: ${dataPoint.low.toFixed(2).padStart(8)} | ` +
                `Close: ${dataPoint.close.toFixed(2).padStart(8)}`;
        } else {
            statusText.textContent =
                'Date:            | Daily % Gain/Loss:         % | Volume:              | Open:         | High:         | Low:          | Close:        ';
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    getPriceChartOptions() {
        // Calculate proper Y-axis range from OHLC data
        let minPrice = Infinity;
        let maxPrice = -Infinity;

        const tradingDaysData = this.filteredData.filter(d => d.volume > 0);

        if (tradingDaysData.length > 0) {
            tradingDaysData.forEach(d => {
                minPrice = Math.min(minPrice, d.low);
                maxPrice = Math.max(maxPrice, d.high);
            });

            // Add some padding (5%)
            const padding = (maxPrice - minPrice) * 0.05;
            minPrice -= padding;
            maxPrice += padding;
        }

        return {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 60,   // Match SimpleCandlestickChart padding
                    right: 20,
                    top: 20,
                    bottom: 60
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: Math.max(0, tradingDaysData.length - 1),
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#666666',
                        maxTicksLimit: 8,
                        callback: (value) => {
                            // Convert index back to date for display
                            if (tradingDaysData && tradingDaysData[Math.floor(value)]) {
                                const date = new Date(tradingDaysData[Math.floor(value)].timestamp);
                                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            }
                            return '';
                        }
                    }
                },
                y: {
                    min: minPrice !== Infinity ? minPrice : undefined,
                    max: maxPrice !== -Infinity ? maxPrice : undefined,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#666666'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                }
            },
            elements: {
                point: {
                    radius: 0
                }
            }
        };
    }

    getVolumeChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 60,   // Match SimpleCandlestickChart padding
                    right: 20,
                    top: 20,
                    bottom: 60
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: Math.max(0, this.tradingDaysData.length - 1),
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#666666',
                        maxTicksLimit: 8,
                        callback: (value) => {
                            // Convert index back to date for display
                            if (this.tradingDaysData && this.tradingDaysData[Math.floor(value)]) {
                                const date = new Date(this.tradingDaysData[Math.floor(value)].timestamp);
                                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            }
                            return '';
                        }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#666666',
                        callback: (value) => {
                            return this.formatVolumeNumber(value);
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                }
            }
        };
    }

    formatVolumeNumber(value) {
        if (value === 0) return '0';

        const absValue = Math.abs(value);

        if (absValue >= 1e9) {
            return (value / 1e9).toFixed(1) + 'B';
        } else if (absValue >= 1e6) {
            return (value / 1e6).toFixed(1) + 'M';
        } else if (absValue >= 1e3) {
            return (value / 1e3).toFixed(1) + 'K';
        } else {
            return value.toString();
        }
    }

    getEmptyChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#666666' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#666666' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        };
    }

    async checkDataStatus(ticker) {
        if (!ticker.trim()) return;

        try {
            const response = await fetch(`/api/stock/${ticker.toUpperCase()}/status`);
            const status = await response.json();

            const updateButton = document.getElementById('update-button');

            if (status.upToDate) {
                updateButton.classList.add('disabled');
                updateButton.textContent = 'Data Up to Date';
                updateButton.disabled = true;
            } else {
                updateButton.classList.remove('disabled');
                updateButton.textContent = 'Update Data';
                updateButton.disabled = false;
            }
        } catch (error) {
            console.error('Error checking data status:', error);
            // Enable button if we can't check status
            const updateButton = document.getElementById('update-button');
            updateButton.classList.remove('disabled');
            updateButton.textContent = 'Update Data';
            updateButton.disabled = false;
        }
    }

    async updateData(ticker) {
        if (!ticker.trim() || this.isUpdating) return;

        const updateButton = document.getElementById('update-button');

        // Prevent multiple updates
        this.isUpdating = true;
        updateButton.classList.add('updating');
        updateButton.textContent = 'Updating...';
        updateButton.disabled = true;

        try {
            const response = await fetch(`/api/stock/${ticker.toUpperCase()}/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                this.updateStatusBar(`Successfully updated data for ${ticker.toUpperCase()}`);
                // Reload the data after successful update
                await this.loadData(ticker);
            } else {
                this.updateStatusBar(`Failed to update data: ${result.message}`);
            }

        } catch (error) {
            console.error('Error updating data:', error);
            this.updateStatusBar('Error updating data: ' + error.message);
        } finally {
            // Reset button state
            this.isUpdating = false;
            updateButton.classList.remove('updating');

            // Check status again to update button state
            setTimeout(() => {
                this.checkDataStatus(ticker);
            }, 1000);
        }
    }
}

// Simple Volume Chart class that matches SimpleCandlestickChart positioning
class SimpleVolumeChart {
    constructor(canvas, data, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.data = data;
        this.options = {
            padding: { top: 20, bottom: 20, left: 60, right: 20 }, // Reduced bottom padding from 60 to 20
            barWidth: 8, // Match candleWidth
            colors: {
                up: 'rgba(0, 255, 0, 0.6)',
                down: 'rgba(255, 0, 0, 0.6)',
                grid: 'rgba(255, 255, 255, 0.1)',
                text: '#666666'
            },
            ...options
        };

        this.setupCanvas();
        this.calculateDimensions();
    }

    setupCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
    }

    calculateDimensions() {
        const rect = this.canvas.getBoundingClientRect();
        this.chartArea = {
            left: this.options.padding.left,
            top: this.options.padding.top,
            right: rect.width - this.options.padding.right,
            bottom: rect.height - this.options.padding.bottom
        };

        this.chartArea.width = this.chartArea.right - this.chartArea.left;
        this.chartArea.height = this.chartArea.bottom - this.chartArea.top;
    }

    getMinMaxVolume() {
        let min = 0;
        let max = Math.max(...this.data.map(d => d.volume));

        // Add 5% padding to max
        max = max * 1.05;
        return { min, max };
    }

    xPosition(index) {
        // Use same spacing calculation as SimpleCandlestickChart
        const spacing = this.chartArea.width / (this.data.length - 1);
        return this.chartArea.left + (index * spacing);
    }

    yPosition(volume, min, max) {
        const ratio = (volume - min) / (max - min);
        return this.chartArea.bottom - (ratio * this.chartArea.height);
    }

    formatVolumeNumber(value) {
        if (value === 0) return '0';

        const absValue = Math.abs(value);

        if (absValue >= 1e9) {
            return (value / 1e9).toFixed(1) + 'B';
        } else if (absValue >= 1e6) {
            return (value / 1e6).toFixed(1) + 'M';
        } else if (absValue >= 1e3) {
            return (value / 1e3).toFixed(1) + 'K';
        } else {
            return value.toString();
        }
    }

    drawGrid(min, max) {
        this.ctx.strokeStyle = this.options.colors.grid;
        this.ctx.lineWidth = 1;

        // Horizontal grid lines
        const steps = 4;
        for (let i = 0; i <= steps; i++) {
            const volume = min + ((max - min) * i / steps);
            const y = this.yPosition(volume, min, max);

            this.ctx.beginPath();
            this.ctx.moveTo(this.chartArea.left, y);
            this.ctx.lineTo(this.chartArea.right, y);
            this.ctx.stroke();

            // Volume labels
            this.ctx.fillStyle = this.options.colors.text;
            this.ctx.font = '12px monospace';
            this.ctx.textAlign = 'right';
            this.ctx.fillText(this.formatVolumeNumber(volume), this.chartArea.left - 10, y + 4);
        }
    }

    drawVolumeBar(index, volume) {
        const isGreen = this.data[index].close >= this.data[index].open;
        const color = isGreen ? this.options.colors.up : this.options.colors.down;
        const { min, max } = this.getMinMaxVolume();

        const x = this.xPosition(index);
        const barBottom = this.yPosition(0, min, max);
        const barTop = this.yPosition(volume, min, max);
        const barHeight = barBottom - barTop;

        this.ctx.fillStyle = color;
        this.ctx.fillRect(x - this.options.barWidth / 2, barTop, this.options.barWidth, barHeight);
    }

    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.data.length === 0) return;

        const { min, max } = this.getMinMaxVolume();

        // Draw grid
        this.drawGrid(min, max);

        // Draw volume bars
        this.data.forEach((d, index) => {
            this.drawVolumeBar(index, d.volume);
        });

        console.log(`Drew ${this.data.length} volume bars`);
    }

    updateData(newData) {
        this.data = newData;
        // Recalculate dimensions in case container size changed
        this.setupCanvas();
        this.calculateDimensions();
        this.draw();
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new StockApp();
}); 