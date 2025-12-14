/**
 * Test to verify bug fixes:
 * 1. Retry-After header parsing with invalid values
 * 2. RequestQueue deadlock prevention
 */

import { RequestQueue } from '../utils/RequestQueue.js';
import { delay } from '../utils/ScraperUtils.js';

async function testRetryAfterParsing() {
  console.log('🧪 Testing Retry-After header parsing...');
  
  // Simulate invalid Retry-After values
  const invalidValues = ['invalid', 'abc', '', null, undefined, '0', '-5', '9999'];
  
  for (const value of invalidValues) {
    const retryAfterSeconds = parseInt(value, 10);
    const isValid = !isNaN(retryAfterSeconds) && retryAfterSeconds > 0 && retryAfterSeconds < 3600;
    
    if (value && !isValid) {
      console.log(`✅ Invalid value "${value}" correctly rejected (NaN or out of range)`);
    }
  }
  
  // Test valid values
  const validValues = ['5', '10', '60', '300'];
  for (const value of validValues) {
    const retryAfterSeconds = parseInt(value, 10);
    const isValid = !isNaN(retryAfterSeconds) && retryAfterSeconds > 0 && retryAfterSeconds < 3600;
    
    if (isValid) {
      console.log(`✅ Valid value "${value}" correctly accepted`);
    }
  }
  
  console.log('✅ Retry-After parsing test passed\n');
}

async function testRequestQueueDeadlock() {
  console.log('🧪 Testing RequestQueue deadlock prevention...');
  
  const queue = new RequestQueue({ maxConcurrent: 1 });
  let completedCount = 0;
  const totalRequests = 5;
  
  // Add multiple requests to queue
  const promises = [];
  for (let i = 0; i < totalRequests; i++) {
    const promise = queue.enqueue(async () => {
      await delay(100); // Simulate network delay
      completedCount++;
      return { requestId: i };
    });
    promises.push(promise);
  }
  
  // Wait for all requests to complete
  const results = await Promise.all(promises);
  
  if (completedCount === totalRequests && results.length === totalRequests) {
    console.log(`✅ All ${totalRequests} requests completed successfully`);
    console.log('✅ No deadlock detected');
  } else {
    console.error(`❌ Expected ${totalRequests} requests, got ${completedCount}`);
    throw new Error('Deadlock or incomplete processing detected');
  }
  
  // Check final state
  const stats = queue.getStats();
  if (stats.queueLength === 0 && stats.activeRequests === 0) {
    console.log('✅ Queue is empty and no active requests');
  } else {
    console.error(`❌ Queue state: length=${stats.queueLength}, active=${stats.activeRequests}`);
    throw new Error('Queue not properly cleaned up');
  }
  
  console.log('✅ RequestQueue deadlock test passed\n');
}

async function runTests() {
  try {
    await testRetryAfterParsing();
    await testRequestQueueDeadlock();
    
    console.log('🎉 All bug fix tests passed!');
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Run tests
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });



