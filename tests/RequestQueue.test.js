import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RequestQueue } from '../src/utils/RequestQueue.js';

const fastLimiterOptions = {
  tokensPerSecond: 100,
  bucketSize: 10,
  minDelay: 1,
  maxDelay: 1,
  failureThreshold: 2,
  resetTimeout: 50
};

describe('RequestQueue', () => {
  it('processes enqueued requests sequentially', async () => {
    const queue = new RequestQueue({ ...fastLimiterOptions, maxConcurrent: 1 });
    const order = [];

    const tasks = [1, 2, 3].map((n) =>
      queue.enqueue(async () => {
        order.push(n);
        return n;
      })
    );

    const results = await Promise.all(tasks);

    assert.deepEqual(results, [1, 2, 3]);
    assert.deepEqual(order, [1, 2, 3]);
    const stats = queue.getStats();
    assert.equal(stats.queueLength, 0);
    assert.equal(stats.rateLimiter.successfulRequests, 3);
  });

  it('tracks rate limit failures on 429 responses', async () => {
    const queue = new RequestQueue({ ...fastLimiterOptions, maxConcurrent: 1 });

    await assert.rejects(
      queue.enqueue(async () => {
        const error = new Error('Too many requests');
        error.response = { status: 429 };
        throw error;
      }),
      /Too many requests/
    );

    const stats = queue.getStats();
    assert.equal(stats.queueLength, 0);
    assert.equal(stats.rateLimiter.rateLimitedRequests, 1);
    assert.equal(stats.rateLimiter.circuitBreakerFailures, 1);
  });
});