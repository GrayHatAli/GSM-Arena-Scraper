/**
 * Delay helper for rate limiting and retry logic.
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Log progress with timestamp for scraping pipeline.
 * @param {string} message - Message to log
 * @param {string} level - Log level (info, success, error, warning)
 */
export const logProgress = (message, level = 'info') => {
  const timestamp = new Date().toLocaleTimeString();
  const icons = {
    info: '📱',
    success: '✅',
    error: '❌',
    warning: '⚠️'
  };
  
  console.log(`${icons[level]} [${timestamp}] ${message}`);
};
