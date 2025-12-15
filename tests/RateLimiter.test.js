import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../src/utils/RateLimiter.js';

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      tokensPerSecond: 100,
      bucketSize: 2,
      minDelay: 1,
      maxDelay: 5,
      failureThreshold: 2,
      resetTimeout: 50
    });
  });

  it('acquires tokens without waiting when capacity exists', async () => {
    const beforeTokens = limiter.tokens;
    const canProceed = await limiter.acquire();
    const afterTokens = limiter.tokens;

    assert.equal(canProceed, true);
    assert.ok(afterTokens < beforeTokens, 'token should be consumed');
    assert.equal(limiter.stats.totalRequests, 1);
    assert.equal(limiter.stats.successfulRequests, 0);
  });

  it('opens circuit after repeated failures', () => {
    limiter.recordFailure();
    limiter.recordFailure();

    assert.equal(limiter.circuitBreaker.isOpen, true);
    assert.ok(limiter.circuitBreaker.openUntil > Date.now());
    assert.equal(limiter.stats.failedRequests, 2);
    assert.ok(limiter.currentDelay >= limiter.minDelay);
  });

  it('resets state to defaults', () => {
    limiter.recordFailure();
    limiter.tokens = 0;

    limiter.reset();
    const stats = limiter.getStats();

    assert.equal(limiter.tokens, limiter.bucketSize);
    assert.equal(limiter.circuitBreaker.isOpen, false);
    assert.equal(limiter.circuitBreaker.failures, 0);
    assert.equal(stats.failedRequests, 1); // prior failure recorded
  });
});