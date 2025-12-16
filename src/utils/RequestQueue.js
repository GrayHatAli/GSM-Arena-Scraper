/**
 * Request Queue for managing HTTP requests with rate limiting and proxy rotation
 * Supports adaptive concurrency and proxy management
 */

import { RateLimiter } from './RateLimiter.js';
import { ProxyManager } from './ProxyManager.js';
import { logProgress } from './ScraperUtils.js';

export class RequestQueue {
  constructor(options = {}) {
    this.rateLimiter = new RateLimiter({
      tokensPerSecond: options.tokensPerSecond || 2.0, // افزایش از 0.5 به 2.0
      bucketSize: options.bucketSize || 5,
      minDelay: options.minDelay || 1000, // کاهش از 2000 به 1000
      maxDelay: options.maxDelay || 8000,
      failureThreshold: options.failureThreshold || 2, // کاهش از 3 به 2
      resetTimeout: options.resetTimeout || 30000 // کاهش از 60000 به 30000
    });
    
    // اضافه کردن ProxyManager
    this.proxyManager = new ProxyManager(options.proxy || {});
    
    this.queue = [];
    this.processing = false;
    
    // تنظیمات adaptive concurrency
    this.baseMaxConcurrent = options.maxConcurrent || 10; // شروع با 10
    this.maxConcurrent = this.baseMaxConcurrent;
    this.minConcurrent = options.minConcurrent || 5;
    this.maxConcurrentLimit = options.maxConcurrentLimit || 20;
    this.adaptiveConcurrency = options.adaptiveConcurrency !== false;
    
    this.activeRequests = 0;
    
    // آمارگیری عملکرد برای adaptive concurrency
    this.performanceStats = {
      successRate: 1.0,
      avgResponseTime: 0,
      recentRequests: [],
      requestWindow: 50, // آخرین 50 درخواست
      lastAdjustment: Date.now(),
      adjustmentInterval: 30000 // 30 ثانیه
    };
    
    logProgress(`RequestQueue initialized - maxConcurrent: ${this.maxConcurrent}, proxy support: ${this.proxyManager.isEnabled()}`, 'info');
  }

  /**
   * Add a request to the queue
   * @param {Function} requestFn - Function that returns a promise for the HTTP request
   * @param {Object} options - Request options (will include proxy settings)
   * @returns {Promise} - Request result
   */
  async enqueue(requestFn, options = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        requestFn,
        options: { ...options }, // Copy options to avoid mutation
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
        const hasQueuedWork = this.queue.length > 0;
        if (hasQueuedWork) {
          // Allow the scheduled processQueue to enter by releasing the flag first
          this.processing = false;
          setImmediate(() => this.processQueue());
        } else if (this.activeRequests === 0) {
          // No queued work and no active requests: release the flag
          this.processing = false;
        }
      });
    }

    // If loop exits with nothing processed and no active requests, clear flag.
    if (this.queue.length === 0 && this.activeRequests === 0) {
      this.processing = false;
    }
  }

  /**
   * Process a single request with proxy support
   */
  async processRequest(item) {
    const { requestFn, resolve, reject, options = {} } = item;
    const startTime = Date.now();
    let currentProxy = null;
    
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

      // Get proxy if enabled
      if (this.proxyManager.isEnabled()) {
        currentProxy = this.proxyManager.getNextProxy();
        if (!currentProxy) {
          const error = new Error('No healthy proxies available');
          error.code = 'NO_PROXY';
          reject(error);
          return;
        }
        
        // Add proxy to request options
        options.proxy = this.proxyManager.toAxiosProxy(currentProxy);
      }

      // Execute the request
      const result = await requestFn(options);
      const responseTime = Date.now() - startTime;
      
      // Record success
      this.rateLimiter.recordSuccess();
      if (currentProxy) {
        this.proxyManager.recordProxySuccess(currentProxy, responseTime);
      }
      
      // Update performance stats
      this.updatePerformanceStats(true, responseTime);
      
      // Adjust concurrency if needed
      this.adjustConcurrencyIfNeeded();
      
      resolve(result);
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Record failure in proxy manager
      if (currentProxy) {
        const errorType = error.response?.status === 429 ? 'rate_limit' : 'general';
        this.proxyManager.recordProxyFailure(currentProxy, errorType);
      }
      
      // Update performance stats
      this.updatePerformanceStats(false, responseTime);
      
      // Check if it's a rate limit error
      if (error.response?.status === 429) {
        this.rateLimiter.recordFailure();
        this.rateLimiter.stats.rateLimitedRequests++;
        
        // Log the error but let the retry logic in makeRequestWithRetry handle it
        logProgress(`429 error detected in queue (delay: ${Math.round(this.rateLimiter.currentDelay)}ms)`, 'warning');
        
        // Add proxy rotation info to error for retry logic
        if (currentProxy) {
          error.usedProxy = currentProxy;
          error.shouldRotateProxy = true;
        }
        
        // Reject so makeRequestWithRetry can handle retry logic
        reject(error);
        
      } else {
        // Other errors - reject immediately
        reject(error);
      }
    }
  }

  /**
   * Update performance statistics for adaptive concurrency
   */
  updatePerformanceStats(success, responseTime) {
    const request = {
      success,
      responseTime,
      timestamp: Date.now()
    };
    
    this.performanceStats.recentRequests.push(request);
    
    // Keep only recent requests (sliding window)
    if (this.performanceStats.recentRequests.length > this.performanceStats.requestWindow) {
      this.performanceStats.recentRequests.shift();
    }
    
    // Recalculate stats
    const recentRequests = this.performanceStats.recentRequests;
    const successCount = recentRequests.filter(r => r.success).length;
    
    this.performanceStats.successRate = recentRequests.length > 0 
      ? successCount / recentRequests.length 
      : 1.0;
      
    this.performanceStats.avgResponseTime = recentRequests.length > 0
      ? recentRequests.reduce((sum, r) => sum + r.responseTime, 0) / recentRequests.length
      : 0;
  }

  /**
   * Adjust concurrency based on performance (adaptive algorithm)
   */
  adjustConcurrencyIfNeeded() {
    if (!this.adaptiveConcurrency) return;
    
    const now = Date.now();
    const timeSinceLastAdjustment = now - this.performanceStats.lastAdjustment;
    
    // Only adjust every adjustmentInterval milliseconds
    if (timeSinceLastAdjustment < this.performanceStats.adjustmentInterval) {
      return;
    }
    
    // Need enough data points to make decisions
    if (this.performanceStats.recentRequests.length < 10) {
      return;
    }
    
    const stats = this.performanceStats;
    const oldMaxConcurrent = this.maxConcurrent;
    
    // Decision algorithm based on success rate and response time
    if (stats.successRate > 0.95 && stats.avgResponseTime < 3000) {
      // Excellent performance - increase concurrency aggressively
      this.maxConcurrent = Math.min(this.maxConcurrentLimit, this.maxConcurrent + 2);
      
    } else if (stats.successRate > 0.85 && stats.avgResponseTime < 5000) {
      // Good performance - moderate increase
      this.maxConcurrent = Math.min(this.maxConcurrentLimit, this.maxConcurrent + 1);
      
    } else if (stats.successRate < 0.70 || stats.avgResponseTime > 10000) {
      // Poor performance - decrease aggressively
      this.maxConcurrent = Math.max(this.minConcurrent, this.maxConcurrent - 2);
      
    } else if (stats.successRate < 0.80 || stats.avgResponseTime > 7000) {
      // Below average performance - moderate decrease
      this.maxConcurrent = Math.max(this.minConcurrent, this.maxConcurrent - 1);
    }
    
    // Log changes
    if (this.maxConcurrent !== oldMaxConcurrent) {
      logProgress(
        `Adaptive concurrency: ${oldMaxConcurrent} → ${this.maxConcurrent} ` +
        `(success: ${(stats.successRate * 100).toFixed(1)}%, ` +
        `avgTime: ${Math.round(stats.avgResponseTime)}ms)`, 
        'info'
      );
    }
    
    this.performanceStats.lastAdjustment = now;
  }

  /**
   * Force adjust concurrency (manual override)
   */
  adjustConcurrency(newValue) {
    const oldValue = this.maxConcurrent;
    this.maxConcurrent = Math.max(
      this.minConcurrent,
      Math.min(this.maxConcurrentLimit, newValue)
    );
    
    if (this.maxConcurrent !== oldValue) {
      logProgress(`Manual concurrency adjustment: ${oldValue} → ${this.maxConcurrent}`, 'info');
    }
  }

  /**
   * Get proxy manager instance
   */
  getProxyManager() {
    return this.proxyManager;
  }

  /**
   * Get current concurrency settings
   */
  getConcurrencyStats() {
    return {
      current: this.maxConcurrent,
      base: this.baseMaxConcurrent,
      min: this.minConcurrent,
      max: this.maxConcurrentLimit,
      active: this.activeRequests,
      adaptive: this.adaptiveConcurrency
    };
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    return {
      ...this.performanceStats,
      recentRequestsCount: this.performanceStats.recentRequests.length
    };
  }

  /**
   * Get comprehensive queue statistics
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      concurrency: this.getConcurrencyStats(),
      performance: this.getPerformanceStats(),
      rateLimiter: this.rateLimiter.getStats(),
      proxy: this.proxyManager.getStats()
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
   * Reset rate limiter and proxy stats
   */
  reset() {
    this.rateLimiter.reset();
    this.proxyManager.resetStats();
    
    // Reset performance stats
    this.performanceStats = {
      successRate: 1.0,
      avgResponseTime: 0,
      recentRequests: [],
      requestWindow: 50,
      lastAdjustment: Date.now(),
      adjustmentInterval: 30000
    };
    
    // Reset concurrency to base value
    this.maxConcurrent = this.baseMaxConcurrent;
    
    logProgress('RequestQueue reset completed', 'info');
  }
}

