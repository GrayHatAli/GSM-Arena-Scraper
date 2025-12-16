/**
 * Rate Limiter with Token Bucket algorithm
 * Prevents 429 errors by limiting request rate
 */

import { delay } from './ScraperUtils.js';
import { logProgress } from './ScraperUtils.js';

export class RateLimiter {
  constructor(options = {}) {
    // Tokens per second (default increased for proxy use: 2 req/s)
    this.tokensPerSecond = options.tokensPerSecond || 2.0;
    
    // Maximum bucket size (increased burst capacity)
    this.bucketSize = options.bucketSize || 5;
    
    // Current tokens in bucket
    this.tokens = this.bucketSize;
    
    // Last token refill time
    this.lastRefill = Date.now();
    
    // Minimum delay between requests (reduced due to proxy rotation)
    this.minDelay = options.minDelay || 1000;
    
    // Maximum delay between requests (reduced)
    this.maxDelay = options.maxDelay || 8000;
    
    // Current delay (adaptive)
    this.currentDelay = this.minDelay;
    
    // Circuit breaker state (more aggressive with proxies)
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: null,
      isOpen: false,
      openUntil: null,
      failureThreshold: options.failureThreshold || 2, // reduced from 3
      resetTimeout: options.resetTimeout || 30000 // reduced from 60000
    };
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      rateLimitedRequests: 0,
      successfulRequests: 0,
      failedRequests: 0
    };
  }

  /**
   * Refill tokens based on elapsed time
   */
  refillTokens() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    
    // Add tokens based on elapsed time
    const tokensToAdd = elapsed * this.tokensPerSecond;
    this.tokens = Math.min(this.bucketSize, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Check if circuit breaker should allow request
   */
  checkCircuitBreaker() {
    const now = Date.now();
    
    // If circuit is open, check if we should close it
    if (this.circuitBreaker.isOpen) {
      if (this.circuitBreaker.openUntil && now >= this.circuitBreaker.openUntil) {
        logProgress('Circuit breaker: Closing circuit, attempting to resume', 'info');
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.failures = 0;
        this.circuitBreaker.openUntil = null;
        // Reset delay to minimum when circuit closes
        this.currentDelay = this.minDelay;
        return true;
      }
      return false;
    }
    
    return true;
  }

  /**
   * Record a failure (429 error) - less aggressive with proxy rotation
   */
  recordFailure() {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();
    this.stats.failedRequests++;
    
    // Increase delay more moderately (proxy rotation helps)
    this.currentDelay = Math.min(
      this.maxDelay,
      this.currentDelay * 1.3 // reduced from 1.5
    );
    
    logProgress(`Rate limit detected. Increasing delay to ${Math.round(this.currentDelay)}ms`, 'warning');
    
    // Open circuit breaker if threshold reached (more aggressive threshold due to proxy rotation)
    if (this.circuitBreaker.failures >= this.circuitBreaker.failureThreshold) {
      this.circuitBreaker.isOpen = true;
      this.circuitBreaker.openUntil = Date.now() + this.circuitBreaker.resetTimeout;
      logProgress(
        `Circuit breaker: Opening circuit for ${this.circuitBreaker.resetTimeout / 1000}s due to ${this.circuitBreaker.failures} failures (proxy rotation will help)`,
        'warning'
      );
    }
  }

  /**
   * Record a success - faster recovery with proxy rotation
   */
  recordSuccess() {
    this.circuitBreaker.failures = Math.max(0, this.circuitBreaker.failures - 1);
    this.stats.successfulRequests++;
    
    // Decrease delay faster on success (proxy rotation helps)
    if (this.currentDelay > this.minDelay) {
      this.currentDelay = Math.max(
        this.minDelay,
        this.currentDelay * 0.8 // faster recovery from 0.9 to 0.8
      );
    }
  }

  /**
   * Wait for rate limit with reduced jitter (proxy rotation provides natural variation)
   */
  async waitForRateLimit() {
    // Reduced jitter since proxy rotation provides natural request distribution
    const jitter = Math.random() * 0.2 * this.currentDelay; // ±20% variation (reduced from 30%)
    const delayWithJitter = this.currentDelay + jitter;
    
    await delay(delayWithJitter);
  }

  /**
   * Acquire a token (wait if necessary)
   * @returns {Promise<boolean>} - True if request should proceed, false if circuit is open
   */
  async acquire() {
    // Check circuit breaker first
    if (!this.checkCircuitBreaker()) {
      const waitTime = Math.ceil((this.circuitBreaker.openUntil - Date.now()) / 1000);
      logProgress(`Circuit breaker is open. Waiting ${waitTime}s before retry...`, 'warning');
      return false;
    }

    // Refill tokens
    this.refillTokens();

    // Wait if no tokens available
    if (this.tokens < 1) {
      const waitTime = (1 - this.tokens) / this.tokensPerSecond * 1000;
      logProgress(`Rate limiter: No tokens available, waiting ${Math.round(waitTime)}ms`, 'info');
      await delay(waitTime);
      this.refillTokens();
    }

    // Consume a token
    this.tokens -= 1;
    this.stats.totalRequests++;

    // Additional delay with jitter to be extra safe
    await this.waitForRateLimit();

    return true;
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentDelay: Math.round(this.currentDelay),
      tokens: this.tokens.toFixed(2),
      circuitBreakerOpen: this.circuitBreaker.isOpen,
      circuitBreakerFailures: this.circuitBreaker.failures
    };
  }

  /**
   * Reset rate limiter state
   */
  reset() {
    this.tokens = this.bucketSize;
    this.lastRefill = Date.now();
    this.currentDelay = this.minDelay;
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: null,
      isOpen: false,
      openUntil: null,
      failureThreshold: this.circuitBreaker.failureThreshold,
      resetTimeout: this.circuitBreaker.resetTimeout
    };
    logProgress('Rate limiter reset', 'info');
  }
}

