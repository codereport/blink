// Main application state
class StockApp {
    constructor() {
        this.stockData = [];
        this.filteredData = [];
        this.currentTicker = 'NVDA';
        this.currentTimeWindow = '6m';
        this.priceChart = null;
        this.volumeChart = null;
        this.selectedDataPoint = null;
        this.mousePosition = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadData(this.currentTicker);
    }

    setupEventListeners() {
        // Ticker input and load button
        const tickerInput = document.getElementById('ticker-input');
        const loadButton = document.getElementById('load-button');

        tickerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.loadData(tickerInput.value);
            }
        });

        loadButton.addEventListener('click', () => {
            this.loadData(tickerInput.value);
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
            } else if (e.key === 'F11') {
                e.preventDefault();
                this.toggleFullscreen();
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
        this.createPriceChart();
        this.createVolumeChart();
        this.selectedDataPoint = null;
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

            // Calculate technical indicators for the candlestick chart
            const indicators = prepareIndicatorDatasets(this.filteredData);

            this.simpleCandlesticks = new SimpleCandlestickChart(canvas, this.filteredData);
            this.simpleCandlesticks.draw(indicators);

            // Setup mouse events with proper callbacks
            this.simpleCandlesticks.setupMouseEvents(
                (dataIndex, mouseX, mouseY) => {
                    // Update selected data point and status bar
                    this.selectedDataPoint = dataIndex;
                    this.updateStatusBar();
                },
                () => {
                    // Clear selection on mouse leave
                    this.selectedDataPoint = null;
                    this.updateStatusBar();
                }
            );

            console.log('Simple candlestick chart created successfully with technical indicators and mouse tracking');
            return;

        } catch (error) {
            console.error('Simple candlestick failed:', error);
        }

        // Fallback to Chart.js with line charts
        console.log('Falling back to Chart.js line charts');

        // Prepare close price line data as fallback
        const closeData = this.filteredData.map(d => ({
            x: d.timestamp,
            y: d.close
        }));

        // Prepare high/low data for better visualization
        const highData = this.filteredData.map(d => ({
            x: d.timestamp,
            y: d.high
        }));

        const lowData = this.filteredData.map(d => ({
            x: d.timestamp,
            y: d.low
        }));

        console.log('Sample data:', closeData[0]);

        // Calculate technical indicators
        const indicators = prepareIndicatorDatasets(this.filteredData);

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

        // Add mouse move event for crosshairs
        ctx.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e, 'price'));
        ctx.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    }

    createVolumeChart() {
        const ctx = document.getElementById('volume-chart').getContext('2d');

        if (this.volumeChart) {
            this.volumeChart.destroy();
        }

        if (this.filteredData.length === 0) {
            this.volumeChart = new Chart(ctx, {
                type: 'bar',
                data: { datasets: [] },
                options: this.getEmptyChartOptions()
            });
            return;
        }

        console.log('Creating volume chart with', this.filteredData.length, 'data points');

        const volumeData = this.filteredData.map(d => ({
            x: d.timestamp,
            y: d.volume
        }));

        const volumeColors = this.filteredData.map(d =>
            d.close >= d.open ? 'rgba(0, 255, 0, 0.6)' : 'rgba(255, 0, 0, 0.6)'
        );

        console.log('Sample volume data:', volumeData[0]);
        console.log('Max volume:', Math.max(...this.filteredData.map(d => d.volume)));

        this.volumeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                datasets: [{
                    label: 'Volume',
                    data: volumeData,
                    backgroundColor: volumeColors,
                    borderColor: volumeColors,
                    borderWidth: 0,
                    maxBarThickness: 8
                }]
            },
            options: this.getVolumeChartOptions()
        });

        console.log('Volume chart created successfully');
    }

    handleMouseMove(event, chartType) {
        if (chartType !== 'price' || !this.filteredData.length) return;

        const rect = event.target.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Calculate data point index based on mouse position
        const chartArea = this.priceChart.chartArea;
        if (x >= chartArea.left && x <= chartArea.right) {
            const dataIndex = Math.round((x - chartArea.left) / (chartArea.right - chartArea.left) * (this.filteredData.length - 1));
            const clampedIndex = Math.max(0, Math.min(dataIndex, this.filteredData.length - 1));

            if (this.selectedDataPoint !== clampedIndex) {
                this.selectedDataPoint = clampedIndex;
                this.updateStatusBar();
                this.drawCrosshairs();
            }
        }
    }

    handleMouseLeave() {
        this.selectedDataPoint = null;
        this.updateStatusBar();
        if (this.priceChart) {
            this.priceChart.update('none');
        }
    }

    drawCrosshairs() {
        if (!this.priceChart || this.selectedDataPoint === null) return;

        // This is a simplified crosshair implementation
        // For a more advanced implementation, you would need to use Chart.js plugins
        this.priceChart.update('none');
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

            statusText.textContent =
                `Date: ${date.padEnd(10)} | ` +
                `Daily % Gain/Loss: ${dailyChange.toFixed(2).padStart(8)}% | ` +
                `Volume: ${dataPoint.volume.toLocaleString().padStart(12)} | ` +
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

        if (this.filteredData.length > 0) {
            this.filteredData.forEach(d => {
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
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        displayFormats: {
                            day: 'MMM dd',
                            month: 'MMM yyyy'
                        }
                    },
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#666666',
                        maxTicksLimit: 10
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
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    type: 'time',
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#666666',
                        maxTicksLimit: 10
                    }
                },
                y: {
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
            }
        };
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
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new StockApp();
}); 