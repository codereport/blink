// Main application state
// Performance optimizations implemented:
// 1. Cache technical indicators to avoid O(n²) recalculation on time window changes
// 2. Update charts instead of recreating them when possible  
// 3. Debounce time window changes to prevent rapid switching issues
// 4. Optimized SMA and Bollinger Bands calculations with sliding window approach
// 5. Weekly aggregation for 5-year view to reduce ~1250 daily bars to ~260 weekly bars
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
        this.isUpdatingAll = false;

        // Available tickers will be loaded dynamically
        this.availableTickers = [];
        this.currentTickerIndex = 0;

        // Performance optimization: cache technical indicators
        this.cachedIndicators = null;
        this.cachedTradingDaysData = null;
        this.lastDataLength = 0;

        // Debounce time window changes for better performance
        this.timeWindowChangeTimeout = null;

        // Mouse event throttling
        this.lastMouseMoveTime = 0;
        this.chartEventListeners = {};

        // Technical indicators toggle
        this.showTechnicalIndicators = true;

        // Blue mode toggle (line chart vs candlesticks)
        this.blueMode = false;

        // Market overlay toggle (SPY comparison)
        this.showMarketOverlay = false;
        this.spyData = [];
        this.spyFilteredData = [];

        // Click zoom functionality
        this.isZoomSelecting = false;
        this.zoomStartIndex = null;
        this.zoomEndIndex = null;
        this.zoomStartDate = null;
        this.zoomEndDate = null;
        this.isCustomZoomActive = false;
        this.zoomOverlay = null;

        // Help popup state
        this.isHelpVisible = false;

        // DSL popup state
        this.isDslVisible = false;
        this.dslMappings = {
            'first': { symbol: '⊃', type: 'unary' },
            'last': { symbol: '⊂', type: 'unary' },
            'delta': { symbol: '△', type: 'modifier' },
            'div': { symbol: '÷', type: 'binary' },
            '*': { symbol: '×', type: 'binary' },
            '-': { symbol: '-', type: 'unary' },
            '~': { symbol: '~', type: 'combinator' }
        };

        // Expression list and results
        this.expressions = []; // Array of {id, expression, result, resultType: 'scalar'|'array', resultData}
        this.currentExpressionIndex = 0;
        this.expressionResultChart = null;

        // Stock screening state
        this.screeningResults = null;
        this.isScreeningMode = false;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupHelpPopup(); // Setup help popup event listeners
        this.setupDslPopup(); // Setup DSL popup event listeners
        await this.loadAvailableTickers(); // Load tickers dynamically first
        this.updateTickerSelection(); // Initialize ticker selection UI
        this.loadData(this.currentTicker);
        this.checkDataStatus(this.currentTicker);
        await this.loadSpyData(); // Load SPY data for market overlay
    }

    setupEventListeners() {
        // Ticker input and buttons
        const tickerInput = document.getElementById('ticker-input');
        const loadButton = document.getElementById('load-button');
        const updateButton = document.getElementById('update-button');
        const updateAllButton = document.getElementById('update-all-button');

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

        updateAllButton.addEventListener('click', () => {
            this.updateAllData();
        });

        // Time window buttons
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.changeTimeWindow(btn.dataset.window);
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Don't process shortcuts if DSL popup is visible (except Ctrl+/ to close and Ctrl+Enter)
            if (this.isDslVisible) {
                if (e.ctrlKey && e.key === '/') {
                    e.preventDefault();
                    this.hideDslPopup();
                }
                // Allow all other keys to be typed normally in DSL mode
                return;
            }

            if (e.ctrlKey && (e.key === 'q' || e.key === 'w')) {
                e.preventDefault();
                window.close();
            } else if (e.ctrlKey && e.shiftKey && e.key === 'Enter') {
                e.preventDefault();
                this.updateAllData();
                tickerInput.blur();
            } else if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.updateData(tickerInput.value);
                tickerInput.blur();
            } else if (e.key === 'F11') {
                e.preventDefault();
                this.toggleFullscreen();
            } else if (e.key === ' ' && e.target !== tickerInput) {
                // Spacebar - focus ticker input and clear it (only if not already focused)
                e.preventDefault();
                tickerInput.value = '';
                tickerInput.focus();
            } else if (e.key >= '1' && e.key <= '4') {
                const windows = ['3m', '6m', '1y', '5y'];
                this.changeTimeWindow(windows[parseInt(e.key) - 1]);
            } else if (e.key === 'ArrowUp' && e.target !== tickerInput) {
                // Navigate up in ticker list
                e.preventDefault();
                this.navigateTickers(-1);
            } else if (e.key === 'ArrowDown' && e.target !== tickerInput) {
                // Navigate down in ticker list
                e.preventDefault();
                this.navigateTickers(1);
            } else if (e.key === 'ArrowLeft' && e.target !== tickerInput) {
                // Navigate left in expression list
                e.preventDefault();
                this.navigateExpressions(-1);
            } else if (e.key === 'ArrowRight' && e.target !== tickerInput) {
                // Navigate right in expression list
                e.preventDefault();
                this.navigateExpressions(1);
            } else if (e.key === 't' && e.target !== tickerInput) {
                e.preventDefault();
                this.toggleTechnicalIndicators();
            } else if (e.key === 'b' && e.target !== tickerInput) {
                e.preventDefault();
                this.toggleBlueMode();
            } else if (e.key === 'm' && e.target !== tickerInput) {
                e.preventDefault();
                this.toggleMarketOverlay();
            } else if (e.key === 's' && e.target !== tickerInput) {
                e.preventDefault();
                this.screenStocksByExpression();
            } else if (e.key === 'r' && e.target !== tickerInput) {
                e.preventDefault();
                this.resetTickerList();
            } else if (e.key === 'd' && e.target !== tickerInput) {
                e.preventDefault();
                this.deleteCurrentExpression();
            } else if (e.key === 'h' && e.target !== tickerInput) {
                e.preventDefault();
                this.toggleHelpPopup();
            } else if (e.key === '/' && e.target !== tickerInput) {
                e.preventDefault();
                this.showDslPopup();
            } else if (e.key === 'f' && e.target !== tickerInput) {
                e.preventDefault();
                this.toggleFullscreen();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (this.isHelpVisible) {
                    // Close help popup if open
                    this.hideHelpPopup();
                } else if (this.isZoomSelecting) {
                    // Cancel zoom selection
                    this.isZoomSelecting = false;
                    this.zoomStartIndex = null;
                    this.zoomStartDate = null;
                    this.clearZoomSelection();
                    console.log('Zoom selection cancelled');
                } else if (this.isCustomZoomActive) {
                    // Reset zoom if already zoomed
                    this.resetZoom();
                }
            }
        });
    }

    setupHelpPopup() {
        // Setup close button handler
        const helpCloseBtn = document.querySelector('.help-close');
        if (helpCloseBtn) {
            helpCloseBtn.addEventListener('click', () => {
                this.hideHelpPopup();
            });
        }

        // Setup backdrop click to close
        const helpPopup = document.getElementById('help-popup');
        if (helpPopup) {
            helpPopup.addEventListener('click', (e) => {
                if (e.target === helpPopup) {
                    this.hideHelpPopup();
                }
            });
        }

        // Prevent clicks inside popup from closing it
        const helpContent = document.querySelector('.help-content');
        if (helpContent) {
            helpContent.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
    }

    toggleHelpPopup() {
        if (this.isHelpVisible) {
            this.hideHelpPopup();
        } else {
            this.showHelpPopup();
        }
    }

    showHelpPopup() {
        const helpPopup = document.getElementById('help-popup');
        if (helpPopup) {
            helpPopup.classList.remove('hidden');
            this.isHelpVisible = true;
            // Prevent body scrolling when popup is open
            document.body.style.overflow = 'hidden';
        }
    }

    hideHelpPopup() {
        const helpPopup = document.getElementById('help-popup');
        if (helpPopup) {
            helpPopup.classList.add('hidden');
            this.isHelpVisible = false;
            // Restore body scrolling
            document.body.style.overflow = '';
        }
    }

    setupDslPopup() {
        // Setup backdrop click to close
        const dslPopup = document.getElementById('dsl-popup');
        if (dslPopup) {
            dslPopup.addEventListener('click', (e) => {
                if (e.target === dslPopup) {
                    this.hideDslPopup();
                }
            });
        }

        // Setup DSL input keyboard handler
        const dslInput = document.getElementById('dsl-input');
        if (dslInput) {
            // Prevent clicks on input from closing the popup
            dslInput.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            dslInput.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'Enter') {
                    e.preventDefault();
                    this.translateDslKeywords();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    this.processDslExpression();
                }
                // All other keys pass through normally for typing
            });

            // Update colors after any input to ensure proper styling
            dslInput.addEventListener('input', () => {
                this.updateDslColors();
            });
        }
    }

    showDslPopup() {
        const dslPopup = document.getElementById('dsl-popup');
        if (dslPopup) {
            dslPopup.classList.remove('hidden');
            this.isDslVisible = true;
            // Focus the DSL input
            const dslInput = document.getElementById('dsl-input');
            if (dslInput) {
                setTimeout(() => {
                    dslInput.focus();
                    // Move cursor to end
                    const range = document.createRange();
                    const sel = window.getSelection();
                    if (dslInput.childNodes.length > 0) {
                        range.selectNodeContents(dslInput);
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }, 100);
            }
        }
    }

    hideDslPopup() {
        const dslPopup = document.getElementById('dsl-popup');
        if (dslPopup) {
            dslPopup.classList.add('hidden');
            this.isDslVisible = false;
            // Clear the input and result
            const dslInput = document.getElementById('dsl-input');
            if (dslInput) {
                dslInput.innerHTML = '';
            }
            const dslResult = document.getElementById('dsl-result');
            if (dslResult) {
                dslResult.textContent = '';
                dslResult.classList.add('hidden');
            }
        }
    }

    async processDslExpression() {
        const dslInput = document.getElementById('dsl-input');
        if (!dslInput) return;

        const expression = this.getTextContent(dslInput);
        if (!expression.trim()) {
            this.hideDslPopup();
            return;
        }

        try {
            // Calculate data length based on current filtered data
            const dataLength = this.tradingDaysData.length;

            // Call the transpile.py script with current ticker and data length
            const response = await fetch('/api/transpile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    expression: expression,
                    ticker: this.currentTicker,
                    dataLength: dataLength.toString()
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                // Parse the result to determine if it's scalar or array
                const output = result.output.trim();
                const parsed = this.parseExpressionResult(output);

                // Add to expression list with Parrot compilation status
                const expressionData = {
                    id: Date.now(),
                    expression: expression,
                    result: output,
                    resultType: parsed.type,
                    resultData: parsed.data,
                    ticker: this.currentTicker,  // Store ticker for recomputation
                    dataLength: dataLength,       // Store data length
                    parrotStatus: 'pending',      // Parrot compilation status: pending, compiling, compiled, failed
                    parrotHash: null,             // Hash for tracking compilation
                    parrotVerified: null          // Verification status: null (not verified), true (matches), false (mismatch)
                };

                this.expressions.push(expressionData);
                this.currentExpressionIndex = this.expressions.length - 1;

                // Update UI
                this.updateExpressionList();
                this.updateExpressionResultViewer();

                console.log('Expression added:', expressionData);

                // Start Parrot CUDA compilation in background
                this.startParrotCompilation(expressionData);
            } else {
                console.error('Transpile error:', result.error);
                alert(`Error: ${result.error}`);
            }

        } catch (error) {
            console.error('Error processing DSL expression:', error);
            alert(`Error: ${error.message}`);
        }

        this.hideDslPopup();
    }

    async startParrotCompilation(expressionData) {
        // Start Parrot CUDA compilation in background
        try {
            expressionData.parrotStatus = 'compiling';
            this.updateExpressionList();

            const response = await fetch('/api/parrot/compile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    expression: expressionData.expression
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            expressionData.parrotHash = result.hash;

            if (result.cached) {
                // Already compiled
                expressionData.parrotStatus = 'compiled';
                this.updateExpressionList();
                console.log(`🚀 Parrot already compiled: ${result.hash}`);

                // Verify the result against BQN
                this.verifyParrotResult(expressionData);
            } else {
                // Poll for compilation status
                this.pollParrotCompilation(expressionData);
            }

        } catch (error) {
            console.error('Error starting Parrot compilation:', error);
            expressionData.parrotStatus = 'failed';
            this.updateExpressionList();
        }
    }

    async pollParrotCompilation(expressionData) {
        // Poll for compilation status every 2 seconds
        // Use status-by-expr since hash is based on generated code, not expression
        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/parrot/status-by-expr', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        expression: expressionData.expression
                    })
                });
                const result = await response.json();

                if (result.status === 'compiled') {
                    expressionData.parrotStatus = 'compiled';
                    expressionData.parrotHash = result.hash;
                    this.updateExpressionList();
                    console.log(`✅ Parrot compilation complete: ${result.hash}`);
                    clearInterval(pollInterval);

                    // Now verify the result against BQN
                    this.verifyParrotResult(expressionData);
                } else if (result.status === 'failed') {
                    expressionData.parrotStatus = 'failed';
                    expressionData.parrotHash = result.hash;
                    this.updateExpressionList();
                    console.error(`❌ Parrot compilation failed: ${result.error}`);
                    clearInterval(pollInterval);
                }
                // If still compiling, continue polling
            } catch (error) {
                console.error('Error polling Parrot status:', error);
                clearInterval(pollInterval);
            }
        }, 2000);

        // Stop polling after 5 minutes
        setTimeout(() => {
            clearInterval(pollInterval);
            if (expressionData.parrotStatus === 'compiling') {
                expressionData.parrotStatus = 'failed';
                this.updateExpressionList();
                console.error('Parrot compilation timed out');
            }
        }, 5 * 60 * 1000);
    }

    async verifyParrotResult(expressionData) {
        // Verify Parrot CUDA result against BQN result
        try {
            const response = await fetch('/api/parrot/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    expression: expressionData.expression,
                    ticker: expressionData.ticker,
                    dataLength: expressionData.dataLength,
                    bqnResult: expressionData.resultData
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                expressionData.parrotVerified = result.verified;
                console.log(`${result.verified ? '✅' : '❌'} Parrot verification: ${result.verified ? 'MATCH' : 'MISMATCH'}`);
                console.log(`   BQN: ${result.bqnResult}, Parrot: ${result.parrotResult}`);
            } else {
                expressionData.parrotVerified = false;
                console.error(`❌ Parrot verification failed: ${result.error}`);
            }

            this.updateExpressionList();

        } catch (error) {
            console.error('Error verifying Parrot result:', error);
            expressionData.parrotVerified = false;
            this.updateExpressionList();
        }
    }

    parseExpressionResult(output) {
        // Try to parse the output as array or scalar
        // BQN array output looks like: ⟨ 1.2 3.4 5.6 ⟩ or just a number
        // BQN uses ¯ (U+00AF) for negative numbers, not regular minus -
        const trimmed = output.trim();

        // Replace BQN's negative sign ¯ with regular minus -
        const normalized = trimmed.replace(/¯/g, '-');

        // Check if it's an array (starts with ⟨ or [ and contains spaces/newlines)
        if (normalized.startsWith('⟨') || (normalized.includes(' ') && !normalized.includes('\n'))) {
            // Parse as array
            const arrayMatch = normalized.match(/⟨([^⟩]+)⟩/);
            let values;

            if (arrayMatch) {
                values = arrayMatch[1].trim().split(/\s+/).map(v => parseFloat(v));
            } else {
                // Try splitting by spaces
                values = normalized.split(/\s+/).map(v => parseFloat(v)).filter(v => !isNaN(v));
            }

            if (values.length > 1) {
                return { type: 'array', data: values };
            }
        }

        // Try to parse as single number
        const num = parseFloat(normalized);
        if (!isNaN(num)) {
            return { type: 'scalar', data: num };
        }

        // Default to scalar string representation
        return { type: 'scalar', data: trimmed };
    }

    getTextContent(element) {
        // Get plain text from contenteditable, preserving actual text content
        return element.textContent || '';
    }

    getCursorPosition(element) {
        const sel = window.getSelection();
        if (sel.rangeCount === 0) return 0;

        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(element);
        preCaretRange.setEnd(range.endContainer, range.endOffset);

        return preCaretRange.toString().length;
    }

    setCursorPosition(element, position) {
        const range = document.createRange();
        const sel = window.getSelection();

        let currentPos = 0;
        let targetNode = null;
        let targetOffset = 0;

        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            const nodeLength = node.textContent.length;

            if (currentPos + nodeLength >= position) {
                targetNode = node;
                targetOffset = position - currentPos;
                break;
            }

            currentPos += nodeLength;
        }

        if (targetNode) {
            range.setStart(targetNode, Math.min(targetOffset, targetNode.textContent.length));
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        } else if (element.childNodes.length > 0) {
            // If no text node found, position at end
            range.selectNodeContents(element);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }

    translateDslKeywords() {
        const dslInput = document.getElementById('dsl-input');
        if (!dslInput) return;

        let text = this.getTextContent(dslInput);

        // Save cursor position before update
        const cursorPos = this.getCursorPosition(dslInput);

        // Sort keywords by length (longest first) to avoid partial matches
        // e.g., "first" should be matched before "fir" if both were keywords
        const sortedMappings = Object.entries(this.dslMappings).sort((a, b) => {
            return b[0].length - a[0].length;
        });

        // Replace each keyword with its Unicode symbol
        // Remove word boundary for single-character keywords to allow non-delimited conversion
        for (const [keyword, data] of sortedMappings) {
            if (keyword.length === 1) {
                // For single-char keywords like '*' and '-', replace all occurrences
                const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                text = text.replace(regex, data.symbol);
            } else {
                // For multi-char keywords, match them anywhere (not just word boundaries)
                // This allows "firstdelta" to become "⊃△"
                const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedKeyword, 'g');
                text = text.replace(regex, data.symbol);
            }
        }

        // Set the new content and update colors
        this.setColoredContent(dslInput, text);

        // Restore cursor position (might be shifted due to replacements)
        this.setCursorPosition(dslInput, cursorPos);
    }

    setColoredContent(element, text) {
        // Build HTML with colored symbols and white text
        let html = '';
        let currentGroup = '';
        let isSymbol = false;
        let symbolType = '';

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            let charIsSymbol = false;
            let charSymbolType = '';

            // Check if this character is a DSL symbol
            for (const [keyword, data] of Object.entries(this.dslMappings)) {
                if (char === data.symbol) {
                    charIsSymbol = true;
                    charSymbolType = data.type;
                    break;
                }
            }

            // If switching from text to symbol or vice versa, flush current group
            if (charIsSymbol !== isSymbol || (charIsSymbol && charSymbolType !== symbolType)) {
                if (currentGroup) {
                    if (isSymbol) {
                        html += `<span class="dsl-${symbolType}">${currentGroup}</span>`;
                    } else {
                        html += `<span class="dsl-text">${currentGroup}</span>`;
                    }
                    currentGroup = '';
                }
            }

            currentGroup += char;
            isSymbol = charIsSymbol;
            symbolType = charSymbolType;
        }

        // Flush remaining group
        if (currentGroup) {
            if (isSymbol) {
                html += `<span class="dsl-${symbolType}">${currentGroup}</span>`;
            } else {
                html += `<span class="dsl-text">${currentGroup}</span>`;
            }
        }

        element.innerHTML = html || '';
    }

    updateDslColors() {
        const dslInput = document.getElementById('dsl-input');
        if (!dslInput) return;

        const text = this.getTextContent(dslInput);
        if (!text) return;

        // Save cursor position
        const cursorPos = this.getCursorPosition(dslInput);

        // Update content with colors
        this.setColoredContent(dslInput, text);

        // Restore cursor position
        this.setCursorPosition(dslInput, cursorPos);
    }

    async loadData(ticker) {
        if (!ticker.trim()) return;

        this.currentTicker = ticker.toUpperCase();
        document.getElementById('ticker-input').value = this.currentTicker;

        // Reset any active zoom when changing tickers
        if (this.isCustomZoomActive || this.isZoomSelecting) {
            this.resetZoom();
        }

        // Update ticker selection in sidebar
        this.updateTickerSelection();

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

            // Recompute expressions for new ticker
            await this.recomputeExpressions();

        } catch (error) {
            console.error('Error loading data:', error);
            this.stockData = [];
            this.updateCharts();
            this.updateStatusBar('Error loading data: ' + error.message);
        }
    }

    async loadSpyData() {
        try {
            const response = await fetch('/api/stock/SPY');
            if (!response.ok) {
                throw new Error('SPY data not found');
            }
            const data = await response.json();
            this.spyData = data;
            this.filterSpyData();
        } catch (error) {
            console.error('Error loading SPY data:', error);
            this.spyData = [];
            this.spyFilteredData = [];
        }
    }

    filterSpyData() {
        if (!this.spyData.length) return;

        // Apply the same filtering logic as the main stock data
        if (this.isCustomZoomActive && this.zoomStartDate && this.zoomEndDate) {
            // Use custom zoom range for SPY data too
            this.spyFilteredData = filterDataByDateRange(this.spyData, this.zoomStartDate, this.zoomEndDate);
        } else {
            // Use standard time window for SPY data
            this.spyFilteredData = filterDataByTimeWindow(this.spyData, this.currentTimeWindow);
        }
    }

    selectTicker(ticker) {
        // Update current ticker index
        const tickerIndex = this.availableTickers.indexOf(ticker.toUpperCase());
        if (tickerIndex !== -1) {
            this.currentTickerIndex = tickerIndex;
        }

        // Load the ticker data
        this.loadData(ticker);
    }

    navigateTickers(direction) {
        // Use screening results if in screening mode, otherwise use availableTickers
        const tickerList = this.isScreeningMode && this.screeningResults
            ? this.screeningResults.map(r => r.ticker)
            : this.availableTickers;

        // Find current ticker position in the displayed list
        const currentIndex = tickerList.indexOf(this.currentTicker);

        // Calculate new index with wrapping
        const newIndex = (currentIndex + direction + tickerList.length) % tickerList.length;

        // Update currentTickerIndex to match the original availableTickers array
        const newTicker = tickerList[newIndex];
        this.currentTickerIndex = this.availableTickers.indexOf(newTicker);

        // Select the new ticker
        this.selectTicker(newTicker);
    }

    navigateExpressions(direction) {
        if (this.expressions.length === 0) return;

        // Calculate new index with wrapping
        this.currentExpressionIndex = (this.currentExpressionIndex + direction + this.expressions.length) % this.expressions.length;

        // Update UI
        this.updateExpressionList();
        this.updateExpressionResultViewer();
    }

    deleteCurrentExpression() {
        if (this.expressions.length === 0) return;

        // Remove the current expression
        this.expressions.splice(this.currentExpressionIndex, 1);

        // Adjust current index if needed
        if (this.expressions.length === 0) {
            this.currentExpressionIndex = 0;
            // Hide expression sidebar when no expressions left
            const expressionSidebar = document.querySelector('.expression-sidebar');
            if (expressionSidebar) {
                expressionSidebar.classList.remove('visible');
            }
        } else if (this.currentExpressionIndex >= this.expressions.length) {
            this.currentExpressionIndex = this.expressions.length - 1;
        }

        // Update UI
        this.updateExpressionList();
        this.updateExpressionResultViewer();
    }

    async loadAvailableTickers() {
        try {
            const response = await fetch('/api/tickers');
            if (!response.ok) {
                throw new Error('Failed to load ticker list');
            }

            this.availableTickers = await response.json();
            console.log('Loaded available tickers:', this.availableTickers);

            // Set NVDA as default if available, otherwise use first ticker
            if (this.availableTickers.length > 0) {
                this.currentTicker = this.availableTickers.includes('NVDA') ? 'NVDA' : this.availableTickers[0];
                this.currentTickerIndex = this.availableTickers.indexOf(this.currentTicker);
                document.getElementById('ticker-input').value = this.currentTicker;
            }

            // Generate ticker list HTML
            await this.generateTickerList();
            this.updateTickerSelection();

        } catch (error) {
            console.error('Error loading available tickers:', error);
            // Fallback to hardcoded curated list if API fails
            this.availableTickers = ['NVDA', 'AAPL', 'AMZN', 'CRWV', 'GOOGL', 'META', 'MSFT', 'NFLX', 'PLTR', 'SPY', 'TSLA'];
            await this.generateTickerList();
            this.updateTickerSelection();
        }
    }

    async generateTickerList() {
        const tickerListContainer = document.querySelector('.ticker-list');
        tickerListContainer.innerHTML = '';

        // Process all tickers in parallel for better performance
        const tickerPromises = this.availableTickers.map(async (ticker) => {
            const tickerItem = document.createElement('div');
            tickerItem.className = 'ticker-item';
            tickerItem.dataset.ticker = ticker;

            // Add click handler
            tickerItem.addEventListener('click', () => {
                this.selectTicker(ticker);
            });

            // Get ticker display data including percentage for up-to-date stocks
            const displayData = await this.getTickerDisplayData(ticker);

            // Create ticker name span
            const tickerNameSpan = document.createElement('span');
            tickerNameSpan.className = 'ticker-name';
            tickerNameSpan.textContent = displayData.tickerText;

            // Create percentage span if there's percentage data
            const percentageSpan = document.createElement('span');
            percentageSpan.className = 'ticker-percentage';

            if (displayData.percentageText) {
                percentageSpan.textContent = ` (${displayData.percentageText})`;
                percentageSpan.style.color = displayData.percentageColor;
            }

            // Clear existing content and add spans
            tickerItem.innerHTML = '';
            tickerItem.appendChild(tickerNameSpan);
            tickerItem.appendChild(percentageSpan);

            // Apply border color for up-to-date stocks
            if (displayData.borderColor) {
                tickerItem.style.borderColor = displayData.borderColor;
                tickerItem.style.borderWidth = '2px';
            } else {
                // Reset border for outdated stocks
                tickerItem.style.borderColor = '#2a2a2a';
                tickerItem.style.borderWidth = '1px';
            }

            return tickerItem;
        });

        // Wait for all ticker items to be processed
        const tickerItems = await Promise.all(tickerPromises);

        // Append all ticker items to the container
        tickerItems.forEach(item => {
            tickerListContainer.appendChild(item);
        });
    }

    async getTickerDisplayData(ticker) {
        try {
            // Check if data is up to date first
            const statusResponse = await fetch(`/api/stock/${ticker.toUpperCase()}/status`);
            const status = await statusResponse.json();

            // If data is not up to date, return just the ticker name
            if (!status.upToDate) {
                return {
                    tickerText: ticker,
                    percentageText: null,
                    borderColor: null,
                    percentageColor: null,
                    isUpToDate: false
                };
            }

            // Get the latest stock data
            const dataResponse = await fetch(`/api/stock/${ticker.toUpperCase()}`);
            if (!dataResponse.ok) {
                return {
                    tickerText: ticker,
                    percentageText: null,
                    borderColor: null,
                    percentageColor: null,
                    isUpToDate: false
                };
            }

            const data = await dataResponse.json();
            if (!data || data.length === 0) {
                return {
                    tickerText: ticker,
                    percentageText: null,
                    borderColor: null,
                    percentageColor: null,
                    isUpToDate: false
                };
            }

            // Calculate daily change for the most recent data point
            const dailyChanges = calculateDailyChange(data);
            const latestChange = dailyChanges[dailyChanges.length - 1] || 0;

            // Format the percentage change
            const changeSign = latestChange >= 0 ? '+' : '';
            const changeText = `${changeSign}${latestChange.toFixed(2)}%`;

            // Use blue colors in blue mode, otherwise red/green
            const negativeColor = this.blueMode ? '#007acc' : '#ff0000';
            const positiveColor = this.blueMode ? '#007acc' : '#00ff00';

            return {
                tickerText: ticker,
                percentageText: changeText,
                borderColor: latestChange < 0 ? negativeColor : positiveColor,
                percentageColor: latestChange < 0 ? negativeColor : positiveColor,
                isUpToDate: true
            };

        } catch (error) {
            console.error(`Error getting display data for ticker ${ticker}:`, error);
            return {
                tickerText: ticker,
                percentageText: null,
                borderColor: null,
                percentageColor: null,
                isUpToDate: false
            };
        }
    }

    async getTickerColor(ticker) {
        try {
            // Check if data is up to date first
            const statusResponse = await fetch(`/api/stock/${ticker.toUpperCase()}/status`);
            const status = await statusResponse.json();

            // If data is not up to date, return null to leave unchanged
            if (!status.upToDate) {
                return null; // No coloring for outdated data
            }

            // Get the latest stock data
            const dataResponse = await fetch(`/api/stock/${ticker.toUpperCase()}`);
            if (!dataResponse.ok) {
                return null; // No coloring if no data available
            }

            const data = await dataResponse.json();
            if (!data || data.length === 0) {
                return null; // No coloring if no data
            }

            // Calculate daily change for the most recent data point
            const dailyChanges = calculateDailyChange(data);
            const latestChange = dailyChanges[dailyChanges.length - 1] || 0;

            // Return appropriate color for negative/positive change, considering blue mode
            const negativeColor = this.blueMode ? '#007acc' : '#ff0000';
            const positiveColor = this.blueMode ? '#007acc' : '#00ff00';
            return latestChange < 0 ? negativeColor : positiveColor;

        } catch (error) {
            console.error(`Error getting color for ticker ${ticker}:`, error);
            return null; // No coloring on error
        }
    }

    async refreshTickerColors() {
        // Update display text and background colors for all ticker items without regenerating the entire list
        const tickerItems = document.querySelectorAll('.ticker-item');
        const updatePromises = Array.from(tickerItems).map(async (item) => {
            const ticker = item.dataset.ticker;
            const displayData = await this.getTickerDisplayData(ticker);

            // Update ticker structure with new data
            const tickerNameSpan = item.querySelector('.ticker-name') || document.createElement('span');
            const percentageSpan = item.querySelector('.ticker-percentage') || document.createElement('span');

            // Update ticker name
            tickerNameSpan.className = 'ticker-name';
            tickerNameSpan.textContent = displayData.tickerText;

            // Update percentage
            percentageSpan.className = 'ticker-percentage';
            if (displayData.percentageText) {
                percentageSpan.textContent = ` (${displayData.percentageText})`;
                percentageSpan.style.color = displayData.percentageColor;
            } else {
                percentageSpan.textContent = '';
                percentageSpan.style.color = '';
            }

            // Rebuild the item content if spans don't exist
            if (!item.querySelector('.ticker-name')) {
                item.innerHTML = '';
                item.appendChild(tickerNameSpan);
                item.appendChild(percentageSpan);
            }

            // Apply border styling
            if (displayData.borderColor) {
                item.style.borderColor = displayData.borderColor;
                item.style.borderWidth = '2px';
            } else {
                // Reset border for outdated stocks
                item.style.borderColor = '#2a2a2a';
                item.style.borderWidth = '1px';
            }
        });

        await Promise.all(updatePromises);

        // Update ticker selection to maintain active ticker styling
        this.updateTickerSelection();
    }

    updateTickerSelection() {
        // Update the ticker index if current ticker changed externally
        const tickerIndex = this.availableTickers.indexOf(this.currentTicker);
        if (tickerIndex !== -1) {
            this.currentTickerIndex = tickerIndex;
        }

        // Update UI to show current selection
        document.querySelectorAll('.ticker-item').forEach(item => {
            item.classList.remove('active');
            const tickerNameSpan = item.querySelector('.ticker-name');

            if (item.dataset.ticker === this.currentTicker) {
                item.classList.add('active');
                // Make current ticker text white
                if (tickerNameSpan) {
                    tickerNameSpan.style.color = 'white';
                }
            } else {
                // Reset ticker text color to default gray
                if (tickerNameSpan) {
                    tickerNameSpan.style.color = '#b3b3b3';
                }
            }
        });
    }

    changeTimeWindow(timeWindow) {
        this.currentTimeWindow = timeWindow;

        // Reset any active zoom when changing time windows
        if (this.isCustomZoomActive || this.isZoomSelecting) {
            this.isCustomZoomActive = false;
            this.isZoomSelecting = false;
            this.zoomStartIndex = null;
            this.zoomEndIndex = null;
            this.zoomStartDate = null;
            this.zoomEndDate = null;
            this.clearZoomSelection();
        }

        // Update button states immediately for responsiveness
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.window === timeWindow) {
                btn.classList.add('active');
            }
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

    updateExpressionList() {
        const expressionList = document.querySelector('.expression-list');
        const expressionSidebar = document.querySelector('.expression-sidebar');
        if (!expressionList) return;

        // Show sidebar if we have expressions
        if (this.expressions.length > 0 && expressionSidebar) {
            expressionSidebar.classList.add('visible');
        }

        expressionList.innerHTML = '';

        this.expressions.forEach((expr, index) => {
            const item = document.createElement('div');
            item.className = 'expression-item';
            if (index === this.currentExpressionIndex) {
                item.classList.add('active');
            }
            item.dataset.index = index;

            // Parrot status container in top-right corner (compilation + verification)
            const parrotStatus = document.createElement('div');
            parrotStatus.className = 'parrot-status';

            // First emoji: compilation status
            let compilationEmoji = '';
            let compilationTitle = '';
            switch (expr.parrotStatus) {
                case 'compiling':
                    compilationEmoji = '🟡';
                    compilationTitle = 'Compiling CUDA...';
                    break;
                case 'compiled':
                    compilationEmoji = '✅';
                    compilationTitle = 'CUDA compiled';
                    break;
                case 'failed':
                    compilationEmoji = '❌';
                    compilationTitle = 'CUDA compilation failed';
                    break;
                default:
                    compilationEmoji = '';
                    break;
            }

            // Second emoji: verification status (only shown after compilation)
            let verificationEmoji = '';
            let verificationTitle = '';
            if (expr.parrotStatus === 'compiled') {
                if (expr.parrotVerified === true) {
                    verificationEmoji = '✅';
                    verificationTitle = 'Results match BQN';
                } else if (expr.parrotVerified === false) {
                    verificationEmoji = '❌';
                    verificationTitle = 'Results DO NOT match BQN';
                } else {
                    verificationEmoji = '⏳';
                    verificationTitle = 'Verifying...';
                }
            }

            parrotStatus.textContent = compilationEmoji + verificationEmoji;
            parrotStatus.title = [compilationTitle, verificationTitle].filter(t => t).join(' | ');
            item.appendChild(parrotStatus);

            const exprText = document.createElement('div');
            exprText.className = 'expr-text';

            // Apply color coding to the expression text
            this.setColoredContent(exprText, expr.expression);

            // Auto-size font based on character count
            // 6 characters or less = full size (42px)
            // More than 6 = reduce proportionally
            const charCount = expr.expression.length;
            let fontSize = 42;

            if (charCount > 6) {
                // Reduce font size proportionally
                fontSize = Math.max(12, Math.floor(42 * 6 / charCount));
            }

            exprText.style.fontSize = fontSize + 'px';

            item.appendChild(exprText);

            const resultText = document.createElement('div');
            resultText.className = 'expr-result';
            if (expr.resultType === 'scalar') {
                resultText.textContent = `= ${expr.resultData}`;
            } else {
                resultText.textContent = `[${expr.resultData.length} values]`;
            }

            item.appendChild(resultText);

            item.addEventListener('click', () => {
                this.currentExpressionIndex = index;
                this.updateExpressionList();
                this.updateExpressionResultViewer();
            });

            expressionList.appendChild(item);
        });
    }

    updateExpressionResultViewer() {
        const wrapper = document.querySelector('.expression-result-wrapper');
        if (!wrapper) return;

        if (this.expressions.length === 0) {
            wrapper.classList.remove('visible');
            return;
        }

        const currentExpr = this.expressions[this.currentExpressionIndex];
        if (!currentExpr) return;

        wrapper.classList.add('visible');

        if (currentExpr.resultType === 'scalar') {
            // Display scalar result
            this.displayScalarResult(currentExpr);
        } else {
            // Display array result as line chart
            this.displayArrayResult(currentExpr);
        }
    }

    displayScalarResult(expr) {
        const canvas = document.getElementById('expression-result-chart');
        if (!canvas) return;

        // Destroy existing chart
        if (this.expressionResultChart) {
            this.expressionResultChart = null;
        }

        // Create a simple visualization showing the scalar value
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();

        // Setup canvas
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';

        // Clear canvas
        ctx.clearRect(0, 0, rect.width, rect.height);

        // Draw centered text
        ctx.fillStyle = '#0080ff'; // Blue mode blue
        ctx.font = 'bold 36px Uiua386, JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const displayValue = typeof expr.resultData === 'number' ?
            expr.resultData.toFixed(4) : expr.resultData;

        ctx.fillText(`${displayValue}`, rect.width / 2, rect.height / 2);

        // Draw expression label above
        ctx.fillStyle = '#666666';
        ctx.font = '14px Uiua386, JetBrains Mono, monospace';
        ctx.fillText(expr.expression, rect.width / 2, rect.height / 2 - 40);
    }

    displayArrayResult(expr) {
        const canvas = document.getElementById('expression-result-chart');
        if (!canvas) return;

        // Destroy existing chart
        if (this.expressionResultChart) {
            this.expressionResultChart = null;
        }

        // Use SimpleLineChart similar to SimpleVolumeChart
        const lineData = expr.resultData.map((value, index) => {
            // Try to align with trading days
            const tradingDay = this.tradingDaysData[this.tradingDaysData.length - expr.resultData.length + index];
            return {
                value: value,
                date: tradingDay ? tradingDay.date : `Point ${index}`,
                timestamp: tradingDay ? tradingDay.timestamp : null
            };
        });

        const colors = {
            line: '#0080ff', // Blue mode blue
            grid: 'rgba(255, 255, 255, 0.1)',
            text: '#666666'
        };

        this.expressionResultChart = new SimpleExpressionChart(canvas, lineData, { colors: colors, label: expr.expression });
        this.expressionResultChart.draw();

        // Setup mouse events for crosshair
        this.setupExpressionChartEvents();
    }

    setupExpressionChartEvents() {
        // Expression values are now shown in the main status bar via updateStatusBar
        // This method is kept for potential future enhancements
    }

    async recomputeExpressions() {
        if (this.expressions.length === 0) return;

        console.log('Recomputing expressions for ticker:', this.currentTicker);

        // Get current data length
        const dataLength = this.tradingDaysData.length;

        // Recompute each expression
        for (let i = 0; i < this.expressions.length; i++) {
            const expr = this.expressions[i];

            try {
                const response = await fetch('/api/transpile', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        expression: expr.expression,
                        ticker: this.currentTicker,
                        dataLength: dataLength.toString()
                    })
                });

                if (!response.ok) {
                    console.error(`Failed to recompute expression: ${expr.expression}`);
                    continue;
                }

                const result = await response.json();

                if (result.success) {
                    const output = result.output.trim();
                    const parsed = this.parseExpressionResult(output);

                    // Update the expression with new data
                    this.expressions[i].result = output;
                    this.expressions[i].resultType = parsed.type;
                    this.expressions[i].resultData = parsed.data;
                    this.expressions[i].ticker = this.currentTicker;
                    this.expressions[i].dataLength = dataLength;
                }
            } catch (error) {
                console.error(`Error recomputing expression ${expr.expression}:`, error);
            }
        }

        // Update UI
        this.updateExpressionList();
        this.updateExpressionResultViewer();

        console.log('All expressions recomputed');
    }

    async screenStocksByExpression() {
        // Check if we have expressions and current expression is scalar
        if (this.expressions.length === 0) {
            alert('No expressions to screen with. Create an expression first.');
            return;
        }

        const currentExpr = this.expressions[this.currentExpressionIndex];
        if (!currentExpr) {
            alert('No expression selected.');
            return;
        }

        if (currentExpr.resultType !== 'scalar') {
            alert('Screening only works with scalar (single value) expressions.\nThe current expression returns an array.');
            return;
        }

        console.log('Screening stocks with expression:', currentExpr.expression);

        // Show loading indicator
        const statusText = document.getElementById('status-text');
        const originalStatus = statusText.textContent;

        try {
            // Load full ticker list for screening
            statusText.textContent = 'Loading full ticker list for screening...';
            const response = await fetch('/api/tickers?full=true');
            if (!response.ok) {
                throw new Error('Failed to load full ticker list');
            }
            const allTickers = await response.json();

            statusText.textContent = `Screening ${allTickers.length} stocks with expression: ${currentExpr.expression}...`;

            // Calculate data length to use (current view's length)
            const dataLength = this.tradingDaysData.length;

            // Compute expression for all tickers
            const results = [];
            for (const ticker of allTickers) {
                try {
                    const response = await fetch('/api/transpile', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            expression: currentExpr.expression,
                            ticker: ticker,
                            dataLength: dataLength.toString()
                        })
                    });

                    if (!response.ok) {
                        console.error(`Failed to compute for ${ticker}`);
                        continue;
                    }

                    const result = await response.json();

                    if (result.success) {
                        const output = result.output.trim();
                        const parsed = this.parseExpressionResult(output);

                        if (parsed.type === 'scalar' && !isNaN(parsed.data)) {
                            results.push({
                                ticker: ticker,
                                value: parsed.data
                            });
                        }
                    }

                    // Update progress
                    statusText.textContent = `Screening... ${results.length}/${allTickers.length} complete`;

                } catch (error) {
                    console.error(`Error screening ${ticker}:`, error);
                }
            }

            // Sort results by value (highest to lowest)
            results.sort((a, b) => b.value - a.value);

            // Store screening results
            this.screeningResults = results;
            this.isScreeningMode = true;

            // Update ticker list with sorted results
            this.updateTickerListWithScreening(results);

            // Select the top ranked stock
            if (results.length > 0) {
                this.selectTicker(results[0].ticker);
            }

            // Restore status
            statusText.textContent = `Screened ${results.length} stocks. Sorted by: ${currentExpr.expression}`;

            console.log('Screening complete:', results);

        } catch (error) {
            console.error('Error during screening:', error);
            alert(`Screening failed: ${error.message}`);
            statusText.textContent = originalStatus;
        }
    }

    updateTickerListWithScreening(results) {
        const tickerList = document.querySelector('.ticker-list');
        if (!tickerList) return;

        // Clear existing list
        tickerList.innerHTML = '';

        // Create ticker items from screening results
        results.forEach(result => {
            const tickerItem = document.createElement('div');
            tickerItem.className = 'ticker-item';
            tickerItem.dataset.ticker = result.ticker;

            // Highlight current ticker
            if (result.ticker === this.currentTicker) {
                tickerItem.classList.add('active');
            }

            // Create ticker name span
            const tickerNameSpan = document.createElement('span');
            tickerNameSpan.className = 'ticker-name';
            tickerNameSpan.textContent = result.ticker;

            // Set color based on current ticker
            if (result.ticker === this.currentTicker) {
                tickerNameSpan.style.color = 'white';
            }

            // Create value span showing the screening result
            const valueSpan = document.createElement('span');
            valueSpan.className = 'ticker-percentage';
            valueSpan.textContent = ` (${result.value.toFixed(2)})`;

            // Color based on value (positive = green/blue, negative = red/blue)
            if (this.blueMode) {
                valueSpan.style.color = '#0080ff';
            } else {
                valueSpan.style.color = result.value >= 0 ? '#00ff00' : '#ff0000';
            }

            tickerItem.appendChild(tickerNameSpan);
            tickerItem.appendChild(valueSpan);

            // Add click handler
            tickerItem.addEventListener('click', () => {
                this.selectTicker(result.ticker);
            });

            tickerList.appendChild(tickerItem);
        });
    }

    async resetTickerList() {
        // Exit screening mode and restore normal ticker list
        this.isScreeningMode = false;
        this.screeningResults = null;

        // Regenerate ticker list with normal percentage display
        await this.loadAvailableTickers();
        this.updateTickerSelection();

        // Clear expressions and hide expression list
        this.expressions = [];
        this.currentExpressionIndex = 0;
        this.updateExpressionList();
        this.updateExpressionResultViewer();

        // Hide expression sidebar
        const expressionSidebar = document.querySelector('.expression-sidebar');
        if (expressionSidebar) {
            expressionSidebar.classList.remove('visible');
        }

        // Restore status bar
        this.updateStatusBar();

        console.log('Ticker list reset to normal mode');
    }

    async updateCharts() {
        // Performance optimization: filter data first
        if (this.isCustomZoomActive && this.zoomStartDate && this.zoomEndDate) {
            // Use custom zoom range
            this.filteredData = filterDataByDateRange(this.stockData, this.zoomStartDate, this.zoomEndDate);
        } else {
            // Use standard time window
            this.filteredData = filterDataByTimeWindow(this.stockData, this.currentTimeWindow);
        }

        // Also filter SPY data for market overlay
        this.filterSpyData();

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

        // Filter cached trading days data for current time window or custom zoom range
        let filteredTradingDays;
        if (this.isCustomZoomActive && this.zoomStartDate && this.zoomEndDate) {
            // Use custom zoom range for trading days too
            filteredTradingDays = filterDataByDateRange(this.cachedTradingDaysData, this.zoomStartDate, this.zoomEndDate);
        } else {
            // Use standard time window
            filteredTradingDays = filterDataByTimeWindow(this.cachedTradingDaysData, this.currentTimeWindow);
        }

        // For 5-year view, aggregate to weekly data for better performance
        if (this.currentTimeWindow === '5y' && !this.isCustomZoomActive) {
            filteredTradingDays = aggregateToWeeklyData(filteredTradingDays);
            this.filteredData = aggregateToWeeklyData(this.filteredData);
            console.log('Applied weekly aggregation for 5-year view to improve performance');
        }

        this.tradingDaysData = filteredTradingDays;

        this.createPriceChart();
        this.createVolumeChart();
        this.selectedDataPoint = null;
        this.selectedTradingDayIndex = null;
        this.updateStatusBar();

        // Recompute expressions when time window changes (affects data length)
        await this.recomputeExpressions();
    }

    getFilteredIndicators(tradingDaysData) {
        if (!this.showTechnicalIndicators || !tradingDaysData || tradingDaysData.length === 0) {
            return {
                sma10: [],
                sma20: [],
                sma50: [],
                bollingerBands: { upper: [], middle: [], lower: [] }
            };
        }

        // For 5-year view with weekly data, recalculate indicators from weekly data
        if (this.currentTimeWindow === '5y' && !this.isCustomZoomActive) {
            console.log('Calculating technical indicators for weekly aggregated data');
            return prepareIndicatorDatasets(tradingDaysData);
        }

        // For other time windows, use cached indicators filtered by timestamps
        if (!this.cachedIndicators) {
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
        if (!this.showTechnicalIndicators || !this.cachedIndicators || !tradingDaysData || tradingDaysData.length === 0) {
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

        // Check if blue mode is enabled - create simple blue line chart
        if (this.blueMode) {
            return this.createBlueLineChart(ctx);
        }

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

            // Prepare SPY overlay data if enabled
            let spyOverlayData = null;
            if (this.showMarketOverlay && this.spyFilteredData.length > 0) {
                spyOverlayData = this.prepareSPYOverlayData(tradingDaysData, this.spyFilteredData);
            }

            // Update existing chart or create new one
            if (this.simpleCandlesticks && this.simpleCandlesticks.canvas === canvas) {
                this.simpleCandlesticks.updateData(tradingDaysData, indicators, spyOverlayData);
            } else {
                // Clean up old chart if it exists
                if (this.simpleCandlesticks) {
                    this.simpleCandlesticks.removeMouseEvents();
                }

                // Clean up zoom click handler
                this.removeZoomClickHandler();
                this.simpleCandlesticks = new SimpleCandlestickChart(canvas, tradingDaysData);
                this.simpleCandlesticks.draw(indicators, spyOverlayData);
            }

            // Create crosshair overlay for candlestick chart
            this.createCrosshairOverlay('price-chart');

            // Create zoom overlay for candlestick chart
            this.createZoomOverlay('price-chart');

            // Setup mouse events with proper callbacks
            this.simpleCandlesticks.setupMouseEvents(
                (dataIndex, mouseX, mouseY) => {
                    // dataIndex is now the trading day index since we filtered the data
                    this.selectedTradingDayIndex = dataIndex;

                    // Find corresponding index in full filtered data for status bar
                    const tradingDay = tradingDaysData[dataIndex];
                    this.selectedDataPoint = this.filteredData.findIndex(d => d.timestamp === tradingDay.timestamp);

                    this.updateStatusBar();

                    // Handle zoom selection visual feedback
                    if (this.isZoomSelecting) {
                        this.drawZoomSelection(mouseX);
                    }

                    // Ensure crosshairs are cleared before drawing new ones
                    this.clearCandlestickCrosshair();
                    this.clearVolumeChartCrosshair();

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

            // Add click handler for zoom functionality
            this.addZoomClickHandler('price-chart');

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

        // Add SPY market overlay if enabled
        if (this.showMarketOverlay && this.spyFilteredData.length > 0) {
            const spyOverlayData = this.prepareSPYOverlayData(tradingDaysData, this.spyFilteredData);
            if (spyOverlayData) {
                datasets.push({
                    label: 'SPY (Market)',
                    type: 'line',
                    data: spyOverlayData,
                    borderColor: 'rgba(255, 255, 255, 0.8)', // White color
                    backgroundColor: 'transparent',
                    pointRadius: 0,
                    borderWidth: 2,
                    // Solid line (no borderDash)
                    fill: false
                });
            }
        }

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

    createBlueLineChart(ctx) {
        // Clean up existing candlestick chart if it exists
        if (this.simpleCandlesticks) {
            this.simpleCandlesticks.removeMouseEvents();
            this.simpleCandlesticks = null;
        }

        // Clean up existing Chart.js chart if it exists
        if (this.priceChart) {
            this.priceChart.destroy();
            this.priceChart = null;
        }

        // Clean up zoom click handler
        this.removeZoomClickHandler();

        // Use pre-filtered trading days data for the line chart
        const tradingDaysData = this.tradingDaysData;

        console.log('Creating simple blue line chart with', tradingDaysData.length, 'data points');

        const canvas = document.getElementById('price-chart');

        // Get technical indicators if enabled
        const indicators = this.getFilteredIndicators(tradingDaysData);

        // Prepare SPY overlay data if enabled
        let spyOverlayData = null;
        if (this.showMarketOverlay && this.spyFilteredData.length > 0) {
            spyOverlayData = this.prepareSPYOverlayData(tradingDaysData, this.spyFilteredData);
        }

        // Update existing chart or create new one
        if (this.simpleLineChart && this.simpleLineChart.canvas === canvas) {
            this.simpleLineChart.updateData(tradingDaysData, indicators, spyOverlayData);
        } else {
            // Clean up old chart if it exists
            if (this.simpleLineChart) {
                this.simpleLineChart.removeMouseEvents();
            }
            this.simpleLineChart = new SimpleLineChart(canvas, tradingDaysData);
            this.simpleLineChart.draw(indicators, spyOverlayData);
        }

        // Create crosshair overlay for line chart
        this.createCrosshairOverlay('price-chart');

        // Create zoom overlay for line chart
        this.createZoomOverlay('price-chart');

        // Setup mouse events with proper callbacks
        this.simpleLineChart.setupMouseEvents(
            (dataIndex, mouseX, mouseY) => {
                // dataIndex is now the trading day index since we filtered the data
                this.selectedTradingDayIndex = dataIndex;

                // Find corresponding index in full filtered data for status bar
                const tradingDay = tradingDaysData[dataIndex];
                this.selectedDataPoint = this.filteredData.findIndex(d => d.timestamp === tradingDay.timestamp);

                this.updateStatusBar();

                // Handle zoom selection visual feedback
                if (this.isZoomSelecting) {
                    this.drawZoomSelection(mouseX);
                }

                // Ensure crosshairs are cleared before drawing new ones
                this.clearCandlestickCrosshair();
                this.clearVolumeChartCrosshair();

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

        // Add click handler for zoom functionality
        this.addZoomClickHandler('price-chart');

        console.log('Simple blue line chart created successfully with technical indicators and mouse tracking');
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
            // Define colors based on blue mode
            const volumeColors = this.blueMode ? {
                up: '#0080ff',
                down: '#0080ff',
                grid: 'rgba(255, 255, 255, 0.1)',
                text: '#666666'
            } : {
                up: '#00ff00',
                down: '#ff0000',
                grid: 'rgba(255, 255, 255, 0.1)',
                text: '#666666'
            };

            if (this.simpleVolumeChart && this.simpleVolumeChart.canvas === canvas) {
                // Update colors when blue mode changes
                this.simpleVolumeChart.options.colors = volumeColors;
                this.simpleVolumeChart.updateData(this.tradingDaysData);
            } else {
                this.simpleVolumeChart = new SimpleVolumeChart(canvas, this.tradingDaysData, { colors: volumeColors });
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

    createZoomOverlay(chartId) {
        const chartCanvas = document.getElementById(chartId);
        const container = chartCanvas.parentElement;

        // Remove existing zoom overlay if present
        const existingOverlay = container.querySelector('.zoom-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        // Create overlay canvas for zoom selection
        const overlay = document.createElement('canvas');
        overlay.className = 'zoom-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '11'; // Above crosshair overlay

        // Match the size and scaling of the chart canvas
        const rect = chartCanvas.getBoundingClientRect();
        overlay.width = chartCanvas.width;
        overlay.height = chartCanvas.height;
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';

        container.appendChild(overlay);
        this.zoomOverlay = overlay;

        return overlay;
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

        // Ensure canvas is completely cleared before drawing
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.restore();

        // Handle SimpleCandlestickChart or SimpleLineChart
        if (this.simpleCandlesticks || this.simpleLineChart) {
            const chart = this.simpleCandlesticks || this.simpleLineChart;
            const chartArea = chart.chartArea;
            const xPosition = chart.xPosition(this.selectedTradingDayIndex);

            // Get price data for horizontal crosshair
            const dataPoint = this.tradingDaysData[this.selectedTradingDayIndex];
            if (!dataPoint) return;

            const { min, max } = chart.getMinMax();
            const closeY = chart.yPosition(dataPoint.close, min, max);

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

            // Draw price label on the right side
            const priceText = dataPoint.close.toFixed(2);
            ctx.font = '12px monospace';
            ctx.textAlign = 'left';
            const textMetrics = ctx.measureText(priceText);
            const labelPadding = 6;
            const labelWidth = textMetrics.width + (labelPadding * 2);
            const labelHeight = 16;
            const labelX = chartArea.right - labelWidth - 5; // Position inside chart area
            const labelY = closeY - (labelHeight / 2);

            // Draw label background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

            // Draw label border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.strokeRect(labelX, labelY, labelWidth, labelHeight);

            // Draw price text
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillText(priceText, labelX + labelPadding, labelY + 12);

            // Reset line dash for intersection point
            ctx.setLineDash([2, 2]);

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
            const dataPoint = this.tradingDaysData[this.selectedTradingDayIndex];
            if (!dataPoint) return;

            // Calculate x position based on trading day index
            const xPosition = priceChartArea.left +
                (this.selectedTradingDayIndex / Math.max(1, this.tradingDaysData.length - 1)) *
                (priceChartArea.right - priceChartArea.left);

            // Calculate y position for close price
            const priceRange = this.priceChart.scales.y.max - this.priceChart.scales.y.min;
            const closeY = priceChartArea.bottom -
                ((dataPoint.close - this.priceChart.scales.y.min) / priceRange) *
                (priceChartArea.bottom - priceChartArea.top);

            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);

            // Vertical line
            ctx.beginPath();
            ctx.moveTo(xPosition, priceChartArea.top);
            ctx.lineTo(xPosition, priceChartArea.bottom);
            ctx.stroke();

            // Horizontal line at close price
            ctx.beginPath();
            ctx.moveTo(priceChartArea.left, closeY);
            ctx.lineTo(priceChartArea.right, closeY);
            ctx.stroke();

            // Draw price label on the right side
            const priceText = dataPoint.close.toFixed(2);
            ctx.font = '12px monospace';
            ctx.textAlign = 'left';
            const textMetrics = ctx.measureText(priceText);
            const labelPadding = 6;
            const labelWidth = textMetrics.width + (labelPadding * 2);
            const labelHeight = 16;
            const labelX = priceChartArea.right - labelWidth - 5; // Position inside chart area
            const labelY = closeY - (labelHeight / 2);

            // Draw label background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

            // Draw label border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.strokeRect(labelX, labelY, labelWidth, labelHeight);

            // Draw price text
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillText(priceText, labelX + labelPadding, labelY + 12);

            // Reset line dash for intersection point
            ctx.setLineDash([2, 2]);

            // Draw intersection point
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.beginPath();
            ctx.arc(xPosition, closeY, 3, 0, 2 * Math.PI);
            ctx.fill();

            ctx.restore();
        }
    }

    clearCandlestickCrosshair() {
        const overlay = this.crosshairOverlays['price-chart'];
        if (!overlay) return;

        const ctx = overlay.getContext('2d');

        // Use robust clearing that resets transformations
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.restore();
    }

    drawVolumeChartCrosshair() {
        if (this.selectedTradingDayIndex === null || !this.simpleVolumeChart || !this.tradingDaysData.length) return;

        const overlay = this.crosshairOverlays['volume-chart'];
        if (!overlay) return;

        const ctx = overlay.getContext('2d');
        const volumeChartArea = this.simpleVolumeChart.chartArea;

        // Ensure canvas is completely cleared before drawing
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.restore();

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

        // Use robust clearing that resets transformations
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.restore();
    }

    drawZoomSelection(mouseX) {
        if (!this.isZoomSelecting || !this.zoomOverlay) return;

        const ctx = this.zoomOverlay.getContext('2d');

        // Clear previous selection
        ctx.clearRect(0, 0, this.zoomOverlay.width, this.zoomOverlay.height);

        // Get chart area bounds
        const chart = this.simpleCandlesticks || this.simpleLineChart;
        if (!chart || !chart.chartArea) return;

        const chartArea = chart.chartArea;
        const startX = chart.xPosition(this.zoomStartIndex);

        // Clamp mouse position to chart area
        const endX = Math.max(chartArea.left, Math.min(mouseX, chartArea.right));

        const rectLeft = Math.min(startX, endX);
        const rectWidth = Math.abs(endX - startX);

        // Draw transparent blue selection rectangle
        ctx.fillStyle = 'rgba(0, 123, 255, 0.2)'; // Semi-transparent blue
        ctx.fillRect(rectLeft, chartArea.top, rectWidth, chartArea.bottom - chartArea.top);

        // Draw selection border
        ctx.strokeStyle = 'rgba(0, 123, 255, 0.8)'; // More opaque blue border
        ctx.lineWidth = 1;
        ctx.strokeRect(rectLeft, chartArea.top, rectWidth, chartArea.bottom - chartArea.top);
    }

    clearZoomSelection() {
        if (this.zoomOverlay) {
            const ctx = this.zoomOverlay.getContext('2d');
            ctx.clearRect(0, 0, this.zoomOverlay.width, this.zoomOverlay.height);
        }
    }

    resetZoom() {
        this.isCustomZoomActive = false;
        this.isZoomSelecting = false;
        this.zoomStartIndex = null;
        this.zoomEndIndex = null;
        this.zoomStartDate = null;
        this.zoomEndDate = null;
        this.clearZoomSelection();

        // Remove any custom zoom indicators from UI (no longer needed)
        // Time buttons will stay gray when zoomed

        // Highlight the current time window button
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-window="${this.currentTimeWindow}"]`)?.classList.add('active');

        // Update charts with original time window
        this.updateCharts();
    }

    addZoomClickHandler(chartId) {
        const canvas = document.getElementById(chartId);

        // Remove existing click handler if any
        if (this.zoomClickHandler) {
            canvas.removeEventListener('click', this.zoomClickHandler);
        }

        this.zoomClickHandler = (event) => {
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            const chart = this.simpleCandlesticks || this.simpleLineChart;
            if (!chart || !chart.chartArea) return;

            const chartArea = chart.chartArea;

            // Check if click is within chart area
            if (x >= chartArea.left && x <= chartArea.right &&
                y >= chartArea.top && y <= chartArea.bottom) {

                // Calculate which data point was clicked
                const relativeX = x - chartArea.left;
                const dataIndex = Math.round((relativeX / chartArea.width) * (this.tradingDaysData.length - 1));
                const clampedIndex = Math.max(0, Math.min(dataIndex, this.tradingDaysData.length - 1));

                if (!this.isZoomSelecting) {
                    // Start zoom selection
                    this.isZoomSelecting = true;
                    this.zoomStartIndex = clampedIndex;
                    this.zoomStartDate = new Date(this.tradingDaysData[clampedIndex].timestamp);
                    console.log('Zoom selection started at index:', clampedIndex);
                } else {
                    // End zoom selection and apply zoom
                    this.zoomEndIndex = clampedIndex;
                    this.zoomEndDate = new Date(this.tradingDaysData[clampedIndex].timestamp);

                    // Ensure start date is before end date
                    if (this.zoomStartDate > this.zoomEndDate) {
                        const tempDate = this.zoomStartDate;
                        const tempIndex = this.zoomStartIndex;
                        this.zoomStartDate = this.zoomEndDate;
                        this.zoomStartIndex = this.zoomEndIndex;
                        this.zoomEndDate = tempDate;
                        this.zoomEndIndex = tempIndex;
                    }

                    this.isZoomSelecting = false;
                    this.isCustomZoomActive = true;
                    this.clearZoomSelection();

                    // Update UI to show zoom is active - keep buttons gray
                    document.querySelectorAll('.time-btn').forEach(btn => {
                        btn.classList.remove('active');
                    });

                    console.log('Zoom applied from', this.zoomStartDate, 'to', this.zoomEndDate);

                    // Update charts with new zoom range
                    this.updateCharts();
                }
            }
        };

        canvas.addEventListener('click', this.zoomClickHandler);
    }

    removeZoomClickHandler() {
        if (this.zoomClickHandler) {
            const canvas = document.getElementById('price-chart');
            if (canvas) {
                canvas.removeEventListener('click', this.zoomClickHandler);
            }
            this.zoomClickHandler = null;
        }
    }



    updateStatusBar(errorMessage = null) {
        const statusText = document.getElementById('status-text');

        if (errorMessage) {
            statusText.textContent = errorMessage;
            return;
        }

        // Determine which data point to display
        let dataPoint = null;
        let dataIndex = null;
        let isDimmed = false;

        if (this.selectedDataPoint !== null && this.filteredData[this.selectedDataPoint]) {
            // Show selected data point when hovering
            dataPoint = this.filteredData[this.selectedDataPoint];
            dataIndex = this.selectedDataPoint;
            isDimmed = false;
        } else if (this.filteredData && this.filteredData.length > 0) {
            // Show most recent trading day when not hovering
            dataPoint = this.filteredData[this.filteredData.length - 1];
            for (let i = this.filteredData.length - 1; i >= 0; i--) {
                if (this.filteredData[i].volume > 0) {
                    dataPoint = this.filteredData[i];
                    break;
                }
            }
            dataIndex = this.filteredData.indexOf(dataPoint);
            isDimmed = true;
        }

        if (dataPoint) {
            // Format and display the data point
            const dailyChanges = calculateDailyChange(this.filteredData);
            const dailyChange = dailyChanges[dataIndex] || 0;
            const date = new Date(dataPoint.timestamp).toISOString().split('T')[0];

            // Format daily change with sign for consistency and determine color
            const changeSign = dailyChange >= 0 ? '+' : '';
            const changeText = `${changeSign}${dailyChange.toFixed(2)}%`;

            // Use blue colors in blue mode, otherwise red/green
            const positiveStatusColor = this.blueMode ? '#007acc' : '#00ff00';
            const negativeStatusColor = this.blueMode ? '#007acc' : '#ff0000';

            const changeColor = dailyChange >= 0 ? positiveStatusColor : negativeStatusColor;
            const closeColor = dailyChange >= 0 ? positiveStatusColor : negativeStatusColor;

            // Calculate time window percentage gain/loss
            const timeWindowChange = this.calculateTimeWindowChange();
            const timeWindowSign = timeWindowChange >= 0 ? '+' : '';
            const timeWindowText = `${timeWindowSign}${timeWindowChange.toFixed(2)}%`;
            const timeWindowColor = timeWindowChange >= 0 ? positiveStatusColor : negativeStatusColor;

            // Show volume as "No Trading" if it's zero (weekend/holiday)
            const volumeDisplay = dataPoint.volume === 0 ? 'No Trading' : this.formatVolumeNumber(dataPoint.volume);

            // Get expression value if there's an active expression with array data
            let expressionDisplay = '';
            if (this.expressions.length > 0 && this.selectedTradingDayIndex !== null) {
                const currentExpr = this.expressions[this.currentExpressionIndex];
                if (currentExpr && currentExpr.resultType === 'array') {
                    // Map selected trading day index to expression data index
                    const exprDataLength = currentExpr.resultData.length;
                    const tradingDaysLength = this.tradingDaysData.length;

                    // Expression data is aligned with the last N trading days
                    if (this.selectedTradingDayIndex >= tradingDaysLength - exprDataLength) {
                        const exprIndex = this.selectedTradingDayIndex - (tradingDaysLength - exprDataLength);
                        if (exprIndex >= 0 && exprIndex < exprDataLength) {
                            const exprValue = currentExpr.resultData[exprIndex];
                            expressionDisplay = ` | Expr: <span style="color: #0080ff; font-weight: bold">${exprValue.toFixed(4).padStart(8)}</span>`;
                        }
                    }
                }
            }

            // Apply dimmed styling if showing most recent data
            statusText.classList.toggle('status-dimmed', isDimmed);

            statusText.innerHTML =
                `Date: ${date} | ` +
                `Daily % Gain/Loss: <span style="color: ${changeColor}; font-weight: bold">${changeText.padStart(7)}</span> | ` +
                `${this.getTimeWindowLabel()} Total: <span style="color: ${timeWindowColor}; font-weight: bold">${timeWindowText.padStart(7)}</span> | ` +
                `Volume: ${volumeDisplay.padStart(6)} | ` +
                `Open: ${dataPoint.open.toFixed(2).padStart(6)} | ` +
                `High: ${dataPoint.high.toFixed(2).padStart(6)} | ` +
                `Low: ${dataPoint.low.toFixed(2).padStart(6)} | ` +
                `Close: <span style="color: ${closeColor}; font-weight: bold">${dataPoint.close.toFixed(2).padStart(6)}</span>` +
                expressionDisplay;
        } else {
            // No data available - show placeholder
            statusText.classList.remove('status-dimmed');
            statusText.textContent = 'no info';
        }
    }

    calculateTimeWindowChange() {
        if (!this.filteredData || this.filteredData.length < 2) {
            return 0;
        }

        const firstPrice = this.filteredData[0].close;
        const lastPrice = this.filteredData[this.filteredData.length - 1].close;

        return ((lastPrice - firstPrice) / firstPrice) * 100;
    }

    getTimeWindowLabel() {
        const labels = {
            '3m': '3M',
            '6m': '6M',
            '1y': '1Y',
            '5y': '5Y'
        };
        return labels[this.currentTimeWindow] || this.currentTimeWindow.toUpperCase();
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

    getBlueLineChartOptions(priceRange) {
        // Use the pre-calculated price range from SimpleCandlestickChart method
        const minPrice = priceRange ? priceRange.min : undefined;
        const maxPrice = priceRange ? priceRange.max : undefined;
        const tradingDaysData = this.tradingDaysData;

        return {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 10,   // Reduced padding to remove extra space
                    right: 20,
                    top: 20,
                    bottom: 10
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
                        display: false
                    }
                },
                y: {
                    min: minPrice,
                    max: maxPrice,
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
            },
            animation: {
                duration: 0
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
        if (!ticker.trim() || this.isUpdating || this.isUpdatingAll) return;

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

            // Check status again to update button state and refresh ticker colors
            setTimeout(async () => {
                this.checkDataStatus(ticker);
                await this.refreshTickerColors();
            }, 1000);
        }
    }

    async updateAllData() {
        if (this.isUpdatingAll || this.isUpdating) return;

        const updateAllButton = document.getElementById('update-all-button');
        const updateButton = document.getElementById('update-button');

        // Prevent multiple updates
        this.isUpdatingAll = true;
        updateAllButton.classList.add('updating');
        updateAllButton.textContent = 'Updating All...';
        updateAllButton.disabled = true;

        // Also disable the regular update button during update all
        updateButton.disabled = true;

        this.updateStatusBar('Starting update for all tickers...');

        let successCount = 0;
        let errorCount = 0;
        const totalTickers = this.availableTickers.length;

        try {
            // Process tickers sequentially to avoid overwhelming the server
            for (let i = 0; i < this.availableTickers.length; i++) {
                const ticker = this.availableTickers[i];

                // Update progress in button text
                updateAllButton.textContent = `Updating ${i + 1}/${totalTickers}...`;
                this.updateStatusBar(`Updating ${ticker} (${i + 1}/${totalTickers})...`);

                try {
                    const response = await fetch(`/api/stock/${ticker.toUpperCase()}/update`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    const result = await response.json();

                    if (result.success) {
                        successCount++;
                    } else {
                        errorCount++;
                        console.error(`Failed to update ${ticker}: ${result.message}`);
                    }

                } catch (error) {
                    errorCount++;
                    console.error(`Error updating ${ticker}:`, error);
                }

                // Small delay between requests to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Update status with final results
            const statusMessage = `Update complete: ${successCount} successful, ${errorCount} failed`;
            this.updateStatusBar(statusMessage);

            // Reload current ticker's data if it was successfully updated
            if (this.availableTickers.includes(this.currentTicker)) {
                await this.loadData(this.currentTicker);
            }

        } catch (error) {
            console.error('Error during update all:', error);
            this.updateStatusBar('Error during update all: ' + error.message);
        } finally {
            // Reset button states
            this.isUpdatingAll = false;
            updateAllButton.classList.remove('updating');
            updateAllButton.textContent = 'Update All';
            updateAllButton.disabled = false;
            updateButton.disabled = false;

            // Refresh ticker colors and status after a brief delay
            setTimeout(async () => {
                this.checkDataStatus(this.currentTicker);
                await this.refreshTickerColors();
            }, 1000);
        }
    }

    toggleTechnicalIndicators() {
        this.showTechnicalIndicators = !this.showTechnicalIndicators;
        this.updateCharts();
    }

    toggleBlueMode() {
        this.blueMode = !this.blueMode;
        this.updateCharts();

        // Instantly update ticker colors for blue mode without async operations
        this.updateTickerColorsForBlueMode();
    }

    toggleMarketOverlay() {
        this.showMarketOverlay = !this.showMarketOverlay;
        this.updateCharts();
    }

    prepareSPYOverlayData(stockData, spyData) {
        if (!stockData.length || !spyData.length) return null;

        // Get the initial prices (first data point in the time window)
        const stockInitialPrice = stockData[0].close;
        const spyInitialPrice = spyData[0].close;

        // Normalize SPY data to stock's initial price for comparison
        const normalizedSpyData = spyData.map((spyPoint, index) => {
            const spyPercentChange = (spyPoint.close - spyInitialPrice) / spyInitialPrice;
            const normalizedPrice = stockInitialPrice * (1 + spyPercentChange);

            return {
                x: index,
                y: normalizedPrice
            };
        });

        return normalizedSpyData;
    }

    updateTickerColorsForBlueMode() {
        // Synchronously update ticker colors for blue mode - no API calls needed
        const tickerItems = document.querySelectorAll('.ticker-item');

        tickerItems.forEach(item => {
            const percentageSpan = item.querySelector('.ticker-percentage');

            if (percentageSpan && percentageSpan.textContent) {
                // Check if this ticker has percentage data (indicating it's up to date)
                const hasPercentage = percentageSpan.textContent.includes('%');

                if (hasPercentage) {
                    // Extract the percentage text to determine if positive or negative
                    const percentageText = percentageSpan.textContent;
                    const isNegative = percentageText.includes('-');

                    // Apply blue mode colors
                    const negativeColor = this.blueMode ? '#007acc' : '#ff0000';
                    const positiveColor = this.blueMode ? '#007acc' : '#00ff00';
                    const borderColor = isNegative ? negativeColor : positiveColor;

                    // Update percentage color
                    percentageSpan.style.color = borderColor;

                    // Update border color
                    item.style.borderColor = borderColor;
                    item.style.borderWidth = '2px';
                }
            }
        });
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
            barWidth: 8, // Will be calculated based on data
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
        this.calculateBarWidth();
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

    calculateBarWidth() {
        if (this.data.length <= 1) {
            this.options.barWidth = 8;
            return;
        }

        // Calculate spacing between bars (same as candlesticks)
        const spacing = this.chartArea.width / (this.data.length - 1);

        // Make bar width proportional to spacing, with time-period aware scaling
        // For 3m (~65 trading days): use much thicker bars
        // For 6m+ (~130+ trading days): use 0.7 multiplier
        let calculatedWidth;
        if (this.data.length < 100) {
            // For short periods (3m), make them much thicker
            calculatedWidth = Math.max(6, Math.min(12, spacing * 1.2));
            console.log(`Volume 3-month period detected: ${this.data.length} data points, width: ${calculatedWidth}`);
        } else {
            calculatedWidth = Math.max(0.5, Math.min(8, spacing * 0.7));
            console.log(`Volume longer period: ${this.data.length} data points, width: ${calculatedWidth}`);
        }

        // Round to nearest 0.5 for crisp rendering
        this.options.barWidth = Math.round(calculatedWidth * 2) / 2;
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
        this.calculateBarWidth();
        this.draw();
    }
}

// Simple Line Chart class that matches SimpleCandlestickChart positioning
class SimpleLineChart {
    constructor(canvas, data, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.data = data;
        this.options = {
            padding: { top: 20, bottom: 60, left: 60, right: 20 },
            colors: {
                line: '#0080ff',
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

    getMinMax(spyOverlayData = null) {
        let min = Infinity;
        let max = -Infinity;

        this.data.forEach(d => {
            min = Math.min(min, d.low);
            max = Math.max(max, d.high);
        });

        // Include SPY overlay data in min/max calculation
        if (spyOverlayData) {
            spyOverlayData.forEach(point => {
                min = Math.min(min, point.y);
                max = Math.max(max, point.y);
            });
        }

        // Add 5% padding (same as SimpleCandlestickChart)
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

        // Horizontal grid lines (match SimpleCandlestickChart exactly)
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

    drawLine() {
        if (this.data.length < 2) return;

        const { min, max } = this.getMinMax();

        this.ctx.strokeStyle = this.options.colors.line;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();

        // Start the line at the first data point
        const firstX = this.xPosition(0);
        const firstY = this.yPosition(this.data[0].close, min, max);
        this.ctx.moveTo(firstX, firstY);

        // Draw line to each subsequent point
        for (let i = 1; i < this.data.length; i++) {
            const x = this.xPosition(i);
            const y = this.yPosition(this.data[i].close, min, max);
            this.ctx.lineTo(x, y);
        }

        this.ctx.stroke();
    }

    drawTechnicalIndicators(indicators) {
        if (!indicators) return;

        const { min, max } = this.getMinMax();

        // Draw SMA lines
        this.drawIndicatorLine(indicators.sma10, 'rgba(255, 255, 255, 0.4)', 1, min, max);
        this.drawIndicatorLine(indicators.sma20, 'rgba(255, 0, 255, 0.4)', 1, min, max);
        this.drawIndicatorLine(indicators.sma50, 'rgba(138, 43, 226, 0.4)', 1, min, max);

        // Draw Bollinger Bands
        this.drawIndicatorLine(indicators.bollingerBands.upper, 'rgba(255, 255, 0, 0.4)', 1, min, max, [5, 5]);
        this.drawIndicatorLine(indicators.bollingerBands.lower, 'rgba(255, 255, 0, 0.4)', 1, min, max, [5, 5]);
    }

    drawIndicatorLine(points, color, lineWidth, min, max, dash = []) {
        if (!points || points.length < 2) return;

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.setLineDash(dash);

        this.ctx.beginPath();

        // Find the first valid point
        let startIndex = -1;
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const dataIndex = this.data.findIndex(d => d.timestamp === point.x);
            if (dataIndex !== -1) {
                const x = this.xPosition(dataIndex);
                const y = this.yPosition(point.y, min, max);
                this.ctx.moveTo(x, y);
                startIndex = i + 1;
                break;
            }
        }

        // Draw lines to subsequent points
        for (let i = startIndex; i < points.length; i++) {
            const point = points[i];
            const dataIndex = this.data.findIndex(d => d.timestamp === point.x);
            if (dataIndex !== -1) {
                const x = this.xPosition(dataIndex);
                const y = this.yPosition(point.y, min, max);
                this.ctx.lineTo(x, y);
            }
        }

        this.ctx.stroke();
        this.ctx.setLineDash([]); // Reset dash
    }

    drawSpyOverlay(spyOverlayData, min, max) {
        if (!spyOverlayData || spyOverlayData.length === 0) return;

        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; // White color
        this.ctx.lineWidth = 2;
        // Solid line (no setLineDash)

        spyOverlayData.forEach((point, index) => {
            const x = this.xPosition(point.x);
            const y = this.yPosition(point.y, min, max);

            if (index === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        });

        this.ctx.stroke();
    }

    draw(indicators, spyOverlayData = null) {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.data.length === 0) return;

        const { min, max } = this.getMinMax(spyOverlayData);

        // Draw grid
        this.drawGrid(min, max);

        // Draw technical indicators first (behind the main line)
        if (indicators) {
            this.drawTechnicalIndicators(indicators);
        }

        // Draw SPY overlay line if provided
        if (spyOverlayData) {
            this.drawSpyOverlay(spyOverlayData, min, max);
        }

        // Draw main blue line
        this.drawLine();

        console.log(`Drew blue line with ${this.data.length} data points`);
    }

    updateData(newData, indicators, spyOverlayData = null) {
        this.data = newData;
        this.setupCanvas();
        this.calculateDimensions();
        this.draw(indicators, spyOverlayData);
    }

    setupMouseEvents(onHover, onLeave) {
        this.onHover = onHover;
        this.onLeave = onLeave;

        this.mouseEventHandlers = {
            mousemove: (e) => this.handleMouseMove(e),
            mouseleave: (e) => this.handleMouseLeave(e)
        };

        this.canvas.addEventListener('mousemove', this.mouseEventHandlers.mousemove);
        this.canvas.addEventListener('mouseleave', this.mouseEventHandlers.mouseleave);
    }

    removeMouseEvents() {
        if (this.mouseEventHandlers) {
            this.canvas.removeEventListener('mousemove', this.mouseEventHandlers.mousemove);
            this.canvas.removeEventListener('mouseleave', this.mouseEventHandlers.mouseleave);
        }
    }

    handleMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        if (x >= this.chartArea.left && x <= this.chartArea.right &&
            y >= this.chartArea.top && y <= this.chartArea.bottom) {

            // Calculate which data point we're closest to
            const relativeX = x - this.chartArea.left;
            const dataIndex = Math.round((relativeX / this.chartArea.width) * (this.data.length - 1));
            const clampedIndex = Math.max(0, Math.min(dataIndex, this.data.length - 1));

            if (this.onHover) {
                this.onHover(clampedIndex, x, y);
            }
        }
    }

    handleMouseLeave(event) {
        if (this.onLeave) {
            this.onLeave();
        }
    }
}

// Simple Expression Chart for DSL Results
class SimpleExpressionChart {
    constructor(canvas, data, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.data = data; // Array of {value, date, timestamp}
        this.options = {
            padding: { top: 20, bottom: 20, left: 60, right: 20 },
            colors: {
                line: '#0080ff',
                grid: 'rgba(255, 255, 255, 0.1)',
                text: '#666666'
            },
            label: '',
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

    getMinMax() {
        const values = this.data.map(d => d.value).filter(v => !isNaN(v) && isFinite(v));

        if (values.length === 0) {
            return { min: 0, max: 1 };
        }

        let min = Math.min(...values);
        let max = Math.max(...values);

        // Add 5% padding
        const padding = (max - min) * 0.05 || 0.1;
        return { min: min - padding, max: max + padding };
    }

    xPosition(index) {
        if (this.data.length === 1) {
            return this.chartArea.left + this.chartArea.width / 2;
        }
        const spacing = this.chartArea.width / (this.data.length - 1);
        return this.chartArea.left + (index * spacing);
    }

    yPosition(value, min, max) {
        const ratio = (value - min) / (max - min);
        return this.chartArea.bottom - (ratio * this.chartArea.height);
    }

    formatNumber(value) {
        if (Math.abs(value) >= 1000) {
            return value.toFixed(0);
        } else if (Math.abs(value) >= 1) {
            return value.toFixed(2);
        } else {
            return value.toFixed(4);
        }
    }

    drawGrid(min, max) {
        this.ctx.strokeStyle = this.options.colors.grid;
        this.ctx.lineWidth = 1;

        // Horizontal grid lines
        const steps = 5;
        for (let i = 0; i <= steps; i++) {
            const value = min + ((max - min) * i / steps);
            const y = this.yPosition(value, min, max);

            this.ctx.beginPath();
            this.ctx.moveTo(this.chartArea.left, y);
            this.ctx.lineTo(this.chartArea.right, y);
            this.ctx.stroke();

            // Value labels
            this.ctx.fillStyle = this.options.colors.text;
            this.ctx.font = '12px monospace';
            this.ctx.textAlign = 'right';
            this.ctx.fillText(this.formatNumber(value), this.chartArea.left - 10, y + 4);
        }
    }

    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.data.length === 0) return;

        const { min, max } = this.getMinMax();

        // Draw grid
        this.drawGrid(min, max);

        // Draw line
        this.ctx.strokeStyle = this.options.colors.line;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();

        let firstValidPoint = true;
        this.data.forEach((point, index) => {
            // Skip NaN or invalid values
            if (isNaN(point.value) || !isFinite(point.value)) {
                return;
            }

            const x = this.xPosition(index);
            const y = this.yPosition(point.value, min, max);

            if (firstValidPoint) {
                this.ctx.moveTo(x, y);
                firstValidPoint = false;
            } else {
                this.ctx.lineTo(x, y);
            }
        });

        this.ctx.stroke();

        // Draw label if provided
        if (this.options.label) {
            this.ctx.fillStyle = this.options.colors.text;
            this.ctx.font = '14px Uiua386, JetBrains Mono, monospace';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(this.options.label, this.chartArea.left, this.chartArea.top - 5);
        }
    }

    updateData(newData) {
        this.data = newData;
        this.draw();
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new StockApp();
});