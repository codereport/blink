// Simple Candlestick Chart Implementation
// This creates candlesticks using direct Canvas API calls

class SimpleCandlestickChart {
    constructor(canvas, data, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.data = data;
        this.options = {
            padding: { top: 20, bottom: 60, left: 60, right: 20 },
            candleWidth: 8,
            colors: {
                up: '#00ff00',
                down: '#ff0000',
                grid: 'rgba(255, 255, 255, 0.1)',
                text: '#666666'
            },
            ...options
        };

        this.setupCanvas();
        this.calculateDimensions();
    }

    setupCanvas() {
        // Set canvas size to match container
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

    getMinMax() {
        let min = Infinity;
        let max = -Infinity;

        this.data.forEach(d => {
            min = Math.min(min, d.low);
            max = Math.max(max, d.high);
        });

        // Add 5% padding
        const padding = (max - min) * 0.05;
        return { min: min - padding, max: max + padding };
    }

    xPosition(index) {
        const spacing = this.chartArea.width / (this.data.length - 1);
        return this.chartArea.left + (index * spacing);
    }

    yPosition(price, min, max) {
        const ratio = (price - min) / (max - min);
        return this.chartArea.bottom - (ratio * this.chartArea.height);
    }

    drawGrid(min, max) {
        this.ctx.strokeStyle = this.options.colors.grid;
        this.ctx.lineWidth = 1;

        // Horizontal grid lines
        const steps = 5;
        for (let i = 0; i <= steps; i++) {
            const price = min + ((max - min) * i / steps);
            const y = this.yPosition(price, min, max);

            this.ctx.beginPath();
            this.ctx.moveTo(this.chartArea.left, y);
            this.ctx.lineTo(this.chartArea.right, y);
            this.ctx.stroke();

            // Price labels
            this.ctx.fillStyle = this.options.colors.text;
            this.ctx.font = '12px monospace';
            this.ctx.textAlign = 'right';
            this.ctx.fillText(price.toFixed(2), this.chartArea.left - 10, y + 4);
        }
    }

    drawCandlestick(x, open, high, low, close) {
        const isGreen = close >= open;
        const color = isGreen ? this.options.colors.up : this.options.colors.down;
        const { min, max } = this.getMinMax();

        const xPos = x;
        const openY = this.yPosition(open, min, max);
        const highY = this.yPosition(high, min, max);
        const lowY = this.yPosition(low, min, max);
        const closeY = this.yPosition(close, min, max);

        // Draw wick (high-low line)
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(xPos, highY);
        this.ctx.lineTo(xPos, lowY);
        this.ctx.stroke();

        // Draw body
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.abs(closeY - openY);
        const bodyWidth = this.options.candleWidth;

        if (bodyHeight < 1) {
            // Doji - draw as horizontal line
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(xPos - bodyWidth / 2, openY);
            this.ctx.lineTo(xPos + bodyWidth / 2, openY);
            this.ctx.stroke();
        } else {
            // Fill both green and red candles (green was previously hollow)
            this.ctx.fillStyle = color;
            this.ctx.fillRect(xPos - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);

            // Add border for better definition
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(xPos - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
        }
    }

    drawTechnicalIndicators(indicators) {
        if (!indicators) return;

        const { min, max } = this.getMinMax();

        // Draw SMAs
        this.drawLine(indicators.sma10, 'rgba(255, 255, 255, 0.6)', 1, min, max);
        this.drawLine(indicators.sma20, 'rgba(255, 0, 255, 0.6)', 1, min, max);
        this.drawLine(indicators.sma50, 'rgba(138, 43, 226, 0.6)', 1, min, max);

        // Draw Bollinger Bands
        this.drawLine(indicators.bollingerBands.upper, 'rgba(255, 255, 0, 0.6)', 1, min, max, [5, 5]);
        this.drawLine(indicators.bollingerBands.lower, 'rgba(255, 255, 0, 0.6)', 1, min, max, [5, 5]);
    }

    drawLine(dataPoints, color, lineWidth, min, max, dashPattern = null) {
        if (!dataPoints || dataPoints.length === 0) return;

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;

        if (dashPattern) {
            this.ctx.setLineDash(dashPattern);
        } else {
            this.ctx.setLineDash([]);
        }

        this.ctx.beginPath();
        let hasStarted = false;

        // Map indicator data points to actual candlestick positions
        dataPoints.forEach((point, indicatorIndex) => {
            if (point && point.y !== null && point.y !== undefined) {
                // Find the corresponding data index by timestamp
                const pointTimestamp = new Date(point.x).getTime();
                const dataIndex = this.data.findIndex(d =>
                    new Date(d.timestamp).getTime() === pointTimestamp
                );

                if (dataIndex >= 0) {
                    const x = this.xPosition(dataIndex);
                    const y = this.yPosition(point.y, min, max);

                    if (!hasStarted) {
                        this.ctx.moveTo(x, y);
                        hasStarted = true;
                    } else {
                        this.ctx.lineTo(x, y);
                    }
                }
            }
        });

        this.ctx.stroke();
        this.ctx.setLineDash([]); // Reset dash pattern
    }

    setupMouseEvents(onMouseMove, onMouseLeave) {
        // Remove existing event listeners to prevent duplicates
        this.removeMouseEvents();

        // Throttle mouse moves for better performance  
        let lastMouseMoveTime = 0;
        const mouseMoveThrottle = 16; // ~60fps

        this.mouseMoveHandler = (e) => {
            const now = Date.now();
            if (now - lastMouseMoveTime < mouseMoveThrottle) return;
            lastMouseMoveTime = now;

            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Check if mouse is within chart area
            if (x >= this.chartArea.left && x <= this.chartArea.right &&
                y >= this.chartArea.top && y <= this.chartArea.bottom) {

                // Calculate which data point the mouse is over
                const relativeX = x - this.chartArea.left;
                const dataIndex = Math.round((relativeX / this.chartArea.width) * (this.data.length - 1));
                const clampedIndex = Math.max(0, Math.min(dataIndex, this.data.length - 1));

                // Store crosshair info for external overlay drawing
                this.crosshairInfo = {
                    dataIndex: clampedIndex,
                    mouseX: x,
                    mouseY: y
                };

                if (onMouseMove) {
                    onMouseMove(clampedIndex, x, y);
                }

                // Don't redraw the entire chart - let external overlay handle crosshairs
            }
        };

        this.mouseLeaveHandler = () => {
            // Clear crosshair info
            this.crosshairInfo = null;

            if (onMouseLeave) {
                onMouseLeave();
            }
            // Don't redraw the entire chart - let external overlay handle crosshairs
        };

        this.canvas.addEventListener('mousemove', this.mouseMoveHandler);
        this.canvas.addEventListener('mouseleave', this.mouseLeaveHandler);
    }

    removeMouseEvents() {
        if (this.mouseMoveHandler) {
            this.canvas.removeEventListener('mousemove', this.mouseMoveHandler);
        }
        if (this.mouseLeaveHandler) {
            this.canvas.removeEventListener('mouseleave', this.mouseLeaveHandler);
        }
    }



    draw(indicators = null) {
        // Store indicators for redrawing
        this.lastIndicators = indicators;

        // Clear canvas completely
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.data.length === 0) return;

        const { min, max } = this.getMinMax();

        // Draw grid
        this.drawGrid(min, max);

        // Draw technical indicators first (behind candlesticks)
        if (indicators) {
            this.drawTechnicalIndicators(indicators);
        }

        // Draw candlesticks on top
        this.data.forEach((d, index) => {
            const x = this.xPosition(index);
            this.drawCandlestick(x, d.open, d.high, d.low, d.close);
        });

        // Crosshairs are now drawn on external overlays for better performance

        console.log(`Drew ${this.data.length} candlesticks with technical indicators`);
    }

    updateData(newData, indicators = null) {
        this.data = newData;
        this.draw(indicators);
    }
} 