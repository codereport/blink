// Technical indicator calculation functions

/**
 * Calculate Simple Moving Average (SMA) - Optimized version
 * @param {Array} data - Array of stock data objects
 * @param {number} period - Period for SMA calculation
 * @returns {Array} Array of SMA values (null for periods with insufficient data)
 */
function calculateSMA(data, period) {
    const smaValues = [];

    if (data.length === 0) return smaValues;

    let sum = 0;

    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            // Not enough data points yet
            sum += data[i].close;
            smaValues.push(null);
        } else if (i === period - 1) {
            // First SMA calculation
            sum += data[i].close;
            smaValues.push(sum / period);
        } else {
            // Sliding window: remove oldest, add newest
            sum = sum - data[i - period].close + data[i].close;
            smaValues.push(sum / period);
        }
    }

    return smaValues;
}

/**
 * Calculate Bollinger Bands - Optimized version
 * @param {Array} data - Array of stock data objects
 * @param {number} period - Period for calculation (typically 20)
 * @param {number} stdDev - Number of standard deviations (typically 2)
 * @returns {Array} Array of objects with {upper, middle, lower} or null
 */
function calculateBollingerBands(data, period, stdDev = 2) {
    const bbValues = [];

    if (data.length === 0) return bbValues;

    let sum = 0;
    let sumSquares = 0;

    for (let i = 0; i < data.length; i++) {
        const price = data[i].close;

        if (i < period - 1) {
            // Not enough data points yet
            sum += price;
            sumSquares += price * price;
            bbValues.push(null);
        } else if (i === period - 1) {
            // First calculation
            sum += price;
            sumSquares += price * price;

            const mean = sum / period;
            const variance = (sumSquares / period) - (mean * mean);
            const standardDeviation = Math.sqrt(Math.max(0, variance)); // Ensure non-negative

            bbValues.push({
                upper: mean + (standardDeviation * stdDev),
                middle: mean,
                lower: mean - (standardDeviation * stdDev)
            });
        } else {
            // Sliding window calculation
            const oldPrice = data[i - period].close;
            sum = sum - oldPrice + price;
            sumSquares = sumSquares - (oldPrice * oldPrice) + (price * price);

            const mean = sum / period;
            const variance = (sumSquares / period) - (mean * mean);
            const standardDeviation = Math.sqrt(Math.max(0, variance)); // Ensure non-negative

            bbValues.push({
                upper: mean + (standardDeviation * stdDev),
                middle: mean,
                lower: mean - (standardDeviation * stdDev)
            });
        }
    }

    return bbValues;
}

/**
 * Calculate daily percentage change
 * @param {Array} data - Array of stock data objects
 * @returns {Array} Array of daily percentage changes
 */
function calculateDailyChange(data) {
    const changes = [];

    for (let i = 0; i < data.length; i++) {
        if (i === 0) {
            changes.push(0);
        } else {
            const prevClose = data[i - 1].close;
            const currentClose = data[i].close;
            const change = ((currentClose - prevClose) / prevClose) * 100;
            changes.push(change);
        }
    }

    return changes;
}

/**
 * Filter data by time window
 * @param {Array} data - Array of stock data objects
 * @param {string} timeWindow - Time window ('3m', '6m', '1y', '5y')
 * @returns {Array} Filtered data array
 */
function filterDataByTimeWindow(data, timeWindow) {
    if (!data || data.length === 0) return [];

    const now = new Date();
    let cutoffDate;

    switch (timeWindow) {
        case '3m':
            cutoffDate = new Date(now.getTime() - (3 * 30 * 24 * 60 * 60 * 1000)); // 3 months
            break;
        case '6m':
            cutoffDate = new Date(now.getTime() - (6 * 30 * 24 * 60 * 60 * 1000)); // 6 months
            break;
        case '1y':
            cutoffDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000)); // 1 year
            break;
        case '5y':
            cutoffDate = new Date(now.getTime() - (5 * 365 * 24 * 60 * 60 * 1000)); // 5 years
            break;
        default:
            return data;
    }

    return data.filter(d => new Date(d.timestamp) >= cutoffDate);
}

/**
 * Filter data by custom date range
 * @param {Array} data - Array of stock data objects
 * @param {Date} startDate - Start date for the range
 * @param {Date} endDate - End date for the range
 * @returns {Array} Filtered data array
 */
function filterDataByDateRange(data, startDate, endDate) {
    if (!data || data.length === 0) return [];
    if (!startDate || !endDate) return data;

    return data.filter(d => {
        const date = new Date(d.timestamp);
        return date >= startDate && date <= endDate;
    });
}

/**
 * Prepare chart datasets for technical indicators
 * @param {Array} data - Filtered stock data
 * @returns {Object} Object containing all datasets for charting
 */
function prepareIndicatorDatasets(data) {
    if (!data || data.length === 0) {
        return {
            sma10: [],
            sma20: [],
            sma50: [],
            bollingerBands: { upper: [], middle: [], lower: [] }
        };
    }

    const sma10 = calculateSMA(data, 10);
    const sma20 = calculateSMA(data, 20);
    const sma50 = calculateSMA(data, 50);
    const bollingerBands = calculateBollingerBands(data, 20, 2);

    return {
        sma10: sma10.map((value, index) => ({
            x: data[index].timestamp,
            y: value
        })).filter(point => point.y !== null),

        sma20: sma20.map((value, index) => ({
            x: data[index].timestamp,
            y: value
        })).filter(point => point.y !== null),

        sma50: sma50.map((value, index) => ({
            x: data[index].timestamp,
            y: value
        })).filter(point => point.y !== null),

        bollingerBands: {
            upper: bollingerBands.map((value, index) => ({
                x: data[index].timestamp,
                y: value ? value.upper : null
            })).filter(point => point.y !== null),

            middle: bollingerBands.map((value, index) => ({
                x: data[index].timestamp,
                y: value ? value.middle : null
            })).filter(point => point.y !== null),

            lower: bollingerBands.map((value, index) => ({
                x: data[index].timestamp,
                y: value ? value.lower : null
            })).filter(point => point.y !== null)
        }
    };
}

/**
 * Aggregate daily OHLC data into weekly data
 * @param {Array} data - Array of daily stock data objects
 * @returns {Array} Array of weekly aggregated data
 */
function aggregateToWeeklyData(data) {
    if (!data || data.length === 0) return [];

    // Group data by week (Monday to Friday)
    const weeklyGroups = new Map();
    
    data.forEach(day => {
        const date = new Date(day.timestamp);
        
        // Find the Monday of this week (week start)
        const monday = new Date(date);
        const dayOfWeek = monday.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sunday, go back 6 days
        monday.setDate(monday.getDate() + daysToMonday);
        monday.setHours(0, 0, 0, 0);
        
        const weekKey = monday.toISOString();
        
        if (!weeklyGroups.has(weekKey)) {
            weeklyGroups.set(weekKey, []);
        }
        weeklyGroups.get(weekKey).push(day);
    });

    // Convert groups to weekly OHLC data
    const weeklyData = [];
    
    for (const [weekStart, weekDays] of weeklyGroups.entries()) {
        if (weekDays.length === 0) continue;
        
        // Sort days by date to ensure proper order
        weekDays.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        const firstDay = weekDays[0];
        const lastDay = weekDays[weekDays.length - 1];
        
        // Weekly OHLC calculation:
        // Open: first day's open
        // High: highest high of the week
        // Low: lowest low of the week
        // Close: last day's close
        // Volume: sum of all volumes
        // Timestamp: use Friday's date (or last trading day of week)
        
        const weeklyBar = {
            timestamp: lastDay.timestamp, // Use last trading day of week
            open: firstDay.open,
            high: Math.max(...weekDays.map(d => d.high)),
            low: Math.min(...weekDays.map(d => d.low)),
            close: lastDay.close,
            volume: weekDays.reduce((sum, d) => sum + d.volume, 0)
        };
        
        weeklyData.push(weeklyBar);
    }
    
    // Sort by timestamp to ensure chronological order
    weeklyData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    console.log(`Aggregated ${data.length} daily bars into ${weeklyData.length} weekly bars`);
    
    return weeklyData;
} 