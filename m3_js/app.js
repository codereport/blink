// Main application state
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

        // Update button states
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.window === timeWindow);
        });

        this.updateCharts();
    }

    updateCharts() {
        this.filteredData = filterDataByTimeWindow(this.stockData, this.currentTimeWindow);
        this.tradingDaysData = [];  // Reset trading days data, will be set in createVolumeChart
        this.createPriceChart();
        this.createVolumeChart();
        this.selectedDataPoint = null;
        this.selectedTradingDayIndex = null;
        this.updateStatusBar();
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

            // Use trading days data for alignment with volume chart
            const tradingDaysData = this.filteredData.filter(d => d.volume > 0);

            // Calculate technical indicators for the candlestick chart
            const indicators = prepareIndicatorDatasets(tradingDaysData);

            this.simpleCandlesticks = new SimpleCandlestickChart(canvas, tradingDaysData);
            this.simpleCandlesticks.draw(indicators);

            // Setup mouse events with proper callbacks
            this.simpleCandlesticks.setupMouseEvents(
                (dataIndex, mouseX, mouseY) => {
                    // dataIndex is now the trading day index since we filtered the data
                    this.selectedTradingDayIndex = dataIndex;

                    // Find corresponding index in full filtered data for status bar
                    const tradingDay = tradingDaysData[dataIndex];
                    this.selectedDataPoint = this.filteredData.findIndex(d => d.timestamp === tradingDay.timestamp);

                    this.updateStatusBar();
                    // Draw crosshair on volume chart
                    this.drawVolumeChartCrosshair();
                },
                () => {
                    // Clear selection on mouse leave
                    this.selectedDataPoint = null;
                    this.selectedTradingDayIndex = null;
                    this.updateStatusBar();
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

        // Use trading days data for alignment with volume chart
        const tradingDaysData = this.filteredData.filter(d => d.volume > 0);

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

        // Calculate technical indicators
        const indicators = prepareIndicatorDatasets(tradingDaysData);

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

        // Create crosshair overlay for price chart (Chart.js fallback mode)
        this.createCrosshairOverlay('price-chart');

        // Add mouse move event for crosshairs
        ctx.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e, 'price'));
        ctx.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    }

    createVolumeChart() {
        const canvas = document.getElementById('volume-chart');

        if (this.filteredData.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        // Filter out days with zero volume (weekends/holidays)
        this.tradingDaysData = this.filteredData.filter(d => d.volume > 0);

        console.log('Creating volume chart with', this.tradingDaysData.length, 'trading days (filtered from', this.filteredData.length, 'total days)');

        if (this.tradingDaysData.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        // Create custom volume chart using same approach as SimpleCandlestickChart
        try {
            this.simpleVolumeChart = new SimpleVolumeChart(canvas, this.tradingDaysData);
            this.simpleVolumeChart.draw();

            console.log('Simple volume chart created successfully');

            // Create crosshair overlay for volume chart
            this.createCrosshairOverlay('volume-chart');

            // Add mouse move event for crosshairs
            canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e, 'volume'));
            canvas.addEventListener('mouseleave', () => this.handleMouseLeave());

        } catch (error) {
            console.error('Simple volume chart failed:', error);
            // Fallback to empty chart
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    handleMouseMove(event, chartType) {
        if (!this.tradingDaysData.length) return;

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

        // Clear crosshair overlays
        this.clearVolumeChartCrosshair();

        // Clear price chart crosshair overlay if using Chart.js fallback
        const priceOverlay = this.crosshairOverlays['price-chart'];
        if (priceOverlay) {
            const ctx = priceOverlay.getContext('2d');
            ctx.clearRect(0, 0, priceOverlay.width, priceOverlay.height);
        }

        if (this.priceChart) {
            this.priceChart.update('none');
        }
    }

    drawCrosshairs() {
        if (this.selectedDataPoint === null) return;

        // Update price chart to show crosshairs
        if (this.priceChart) {
            this.priceChart.update('none');
        }

        // Draw crosshair lines on both charts
        this.drawCrosshairLines();
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

        // Match the size of the chart canvas
        const rect = chartCanvas.getBoundingClientRect();
        overlay.width = rect.width;
        overlay.height = rect.height;
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';

        container.style.position = 'relative';
        container.appendChild(overlay);

        this.crosshairOverlays[chartId] = overlay;
    }

    drawVolumeChartCrosshair() {
        if (this.selectedTradingDayIndex === undefined || !this.simpleVolumeChart || !this.tradingDaysData.length) return;

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

    drawCrosshairLines() {
        if (this.selectedTradingDayIndex === null || !this.tradingDaysData.length) return;

        // For Chart.js fallback mode, draw crosshairs on overlays
        if (this.priceChart && this.crosshairOverlays['price-chart']) {
            const overlay = this.crosshairOverlays['price-chart'];
            const ctx = overlay.getContext('2d');
            const priceChartArea = this.priceChart.chartArea;

            // Clear previous crosshair
            ctx.clearRect(0, 0, overlay.width, overlay.height);

            // Calculate x position based on trading day index (both charts use same indices now)
            const xPosition = priceChartArea.left +
                (this.selectedTradingDayIndex / Math.max(1, this.tradingDaysData.length - 1)) *
                (priceChartArea.right - priceChartArea.left);

            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);

            // Vertical line
            ctx.beginPath();
            ctx.moveTo(xPosition, priceChartArea.top);
            ctx.lineTo(xPosition, priceChartArea.bottom);
            ctx.stroke();

            ctx.restore();
        }

        // Draw crosshair on volume chart
        this.drawVolumeChartCrosshair();
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
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new StockApp();
}); 