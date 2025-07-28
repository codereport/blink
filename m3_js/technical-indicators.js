// Technical indicator calculation functions

/**
 * Calculate Simple Moving Average (SMA)
 * @param {Array} data - Array of stock data objects
 * @param {number} period - Period for SMA calculation
 * @returns {Array} Array of SMA values (null for periods with insufficient data)
 */
function calculateSMA(data, period) {
    const smaValues = [];

    for (let i = 0; i < data.length; i++) {
        if (i + 1 < period) {
            smaValues.push(null);
        } else {
            const sum = data.slice(i + 1 - period, i + 1).reduce((acc, d) => acc + d.close, 0);
            smaValues.push(sum / period);
        }
    }

    return smaValues;
}

/**
 * Calculate Bollinger Bands
 * @param {Array} data - Array of stock data objects
 * @param {number} period - Period for calculation (typically 20)
 * @param {number} stdDev - Number of standard deviations (typically 2)
 * @returns {Array} Array of objects with {upper, middle, lower} or null
 */
function calculateBollingerBands(data, period, stdDev = 2) {
    const bbValues = [];

    for (let i = 0; i < data.length; i++) {
        if (i + 1 < period) {
            bbValues.push(null);
        } else {
            const window = data.slice(i + 1 - period, i + 1);
            const sum = window.reduce((acc, d) => acc + d.close, 0);
            const mean = sum / period;

            const variance = window.reduce((acc, d) => acc + Math.pow(d.close - mean, 2), 0) / period;
            const standardDeviation = Math.sqrt(variance);

            const upperBand = mean + (standardDeviation * stdDev);
            const lowerBand = mean - (standardDeviation * stdDev);

            bbValues.push({
                upper: upperBand,
                middle: mean,
                lower: lowerBand
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
 * @param {string} timeWindow - Time window ('6m', '1y', '5y')
 * @returns {Array} Filtered data array
 */
function filterDataByTimeWindow(data, timeWindow) {
    if (!data || data.length === 0) return [];

    const now = new Date();
    let cutoffDate;

    switch (timeWindow) {
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