/**
 * Request Queue for managing HTTP requests with rate limiting
 * Ensures requests are processed sequentially with proper spacing
 */

import { RateLimiter } from './RateLimiter.js';
import { logProgress } from './ScraperUtils.js';

export class RequestQueue {
  constructor(options = {}) {
    this.rateLimiter = new RateLimiter({
      tokensPerSecond: options.tokensPerSecond || 0.5, // 1 request per 2 seconds
      bucketSize: options.bucketSize || 2,
      minDelay: options.minDelay || 2000,
      maxDelay: options.maxDelay || 10000,
      failureThreshold: options.failureThreshold || 3,
      resetTimeout: options.resetTimeout || 60000
    });
    
    this.queue = [];
    this.processing = false;
    this.maxConcurrent = options.maxConcurrent || 1; // Sequential by default
    this.activeRequests = 0;
  }

  /**
   * Add a request to the queue
   * @param {Function} requestFn - Function that returns a promise for the HTTP request
   * @param {Object} options - Request options
   * @returns {Promise} - Request result
   */
  async enqueue(requestFn, options = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        requestFn,
        options,
        resolve,
        reject,
        timestamp: Date.now()
      });
      
      this.processQueue();
    });
  }

  /**
   * Process the queue
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const item = this.queue.shift();
      this.activeRequests++;

      // Process request asynchronously
      this.processRequest(item).finally(() => {
        this.activeRequests--;
        // Continue processing queue
        if (this.queue.length > 0) {
          this.processQueue();
        } else {
          this.processing = false;
        }
      });
    }

    if (this.queue.length === 0) {
      this.processing = false;
    }
  }

  /**
   * Process a single request
   */
  async processRequest(item) {
    const { requestFn, resolve, reject } = item;
    
    try {
      // Wait for rate limiter
      const canProceed = await this.rateLimiter.acquire();
      
      if (!canProceed) {
        // Circuit breaker is open, reject with special error
        const error = new Error('Circuit breaker is open. Too many rate limit errors.');
        error.code = 'CIRCUIT_OPEN';
        reject(error);
        return;
      }

      // Execute the request
      const result = await requestFn();
      
      // Record success
      this.rateLimiter.recordSuccess();
      resolve(result);
      
    } catch (error) {
      // Check if it's a rate limit error
      if (error.response?.status === 429) {
        this.rateLimiter.recordFailure();
        this.rateLimiter.stats.rateLimitedRequests++;
        
        // Log the error but let the retry logic in makeRequestWithRetry handle it
        logProgress(`429 error detected in queue (delay: ${Math.round(this.rateLimiter.currentDelay)}ms)`, 'warning');
        
        // Reject so makeRequestWithRetry can handle retry logic
        reject(error);
        
      } else {
        // Other errors - reject immediately
        reject(error);
      }
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      rateLimiter: this.rateLimiter.getStats()
    };
  }

  /**
   * Clear the queue
   */
  clear() {
    this.queue = [];
    logProgress('Request queue cleared', 'info');
  }

  /**
   * Reset rate limiter
   */
  reset() {
    this.rateLimiter.reset();
  }
}

