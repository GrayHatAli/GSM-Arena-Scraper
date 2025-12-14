/**
 * Quick test to verify rate limiting is working
 * Makes a few requests and checks for 429 errors
 */

import { ScraperService } from '../services/ScraperService.js';
import { logProgress } from '../utils/ScraperUtils.js';

async function quickTest() {
  console.log('🧪 Quick Rate Limiting Test\n');
  
  const scraper = new ScraperService();
  let error429Count = 0;
  let successCount = 0;
  
  // Track 429 errors by intercepting axios requests
  const originalRequest = scraper.apiClient.request;
  scraper.apiClient.request = async function(config) {
    try {
      const response = await originalRequest.call(this, config);
      successCount++;
      return response;
    } catch (error) {
      if (error.response?.status === 429) {
        error429Count++;
        logProgress(`❌ 429 Error detected!`, 'error');
      }
      throw error;
    }
  };
  
  try {
    // Test 1: Get brands (1 request)
    logProgress('Test 1: Getting brands list (1 request)...', 'info');
    const brands = await scraper.getAllBrands();
    logProgress(`✅ Found ${brands.length} brands`, 'success');
    
    // Test 2: Get status to see rate limiter stats
    logProgress('\nTest 2: Checking rate limiter stats...', 'info');
    const status = await scraper.getStatus();
    console.log('\n📊 Rate Limiter Stats:');
    console.log(`   Total Requests: ${status.rateLimiter.totalRequests}`);
    console.log(`   Successful: ${status.rateLimiter.successfulRequests}`);
    console.log(`   Rate Limited: ${status.rateLimiter.rateLimitedRequests}`);
    console.log(`   Current Delay: ${status.rateLimiter.currentDelay}ms`);
    console.log(`   Circuit Breaker Open: ${status.rateLimiter.circuitBreakerOpen}`);
    
    // Test 3: Make a few more requests to test rate limiting
    logProgress('\nTest 3: Making additional requests to test rate limiting...', 'info');
    
    if (brands.length > 0) {
      // Try to get devices for first brand (will make multiple requests)
      const testBrand = brands[0];
      logProgress(`Testing with brand: ${testBrand.name}`, 'info');
      
      // This will make several requests (brand page, device pages, etc.)
      const devices = await scraper.searchDevicesByBrand(testBrand.name, {
        minYear: 2023,
        brandUrl: testBrand.url
      });
      
      logProgress(`✅ Found ${devices.length} devices`, 'success');
      
      // Check stats again
      const status2 = await scraper.getStatus();
      console.log('\n📊 Rate Limiter Stats (after device search):');
      console.log(`   Total Requests: ${status2.rateLimiter.totalRequests}`);
      console.log(`   Successful: ${status2.rateLimiter.successfulRequests}`);
      console.log(`   Rate Limited: ${status2.rateLimiter.rateLimitedRequests}`);
      console.log(`   Failed: ${status2.rateLimiter.failedRequests}`);
      console.log(`   Current Delay: ${status2.rateLimiter.currentDelay}ms`);
    }
    
    // Final Results
    console.log('\n' + '='.repeat(60));
    console.log('📋 Test Results:');
    console.log('='.repeat(60));
    console.log(`✅ Successful Requests: ${successCount}`);
    console.log(`${error429Count > 0 ? '❌' : '✅'} 429 Errors: ${error429Count}`);
    console.log(`✅ Rate Limiter Active: ${status.rateLimiter.totalRequests > 0 ? 'Yes' : 'No'}`);
    
    if (error429Count === 0) {
      console.log('\n🎉 SUCCESS: No 429 errors detected!');
      console.log('✅ Rate limiting is working correctly.');
      return true;
    } else {
      console.log(`\n⚠️  WARNING: ${error429Count} 429 error(s) detected.`);
      console.log('   Consider increasing delays in config.');
      return false;
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    // Show rate limiter stats even on error
    try {
      const status = await scraper.getStatus();
      console.log('\n📊 Rate Limiter Stats (at error):');
      console.log(JSON.stringify(status.rateLimiter, null, 2));
    } catch (e) {
      // Ignore
    }
    
    throw error;
  }
}

// Run test
quickTest()
  .then(success => {
    if (success) {
      console.log('\n✅ Quick test passed!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Quick test had issues.');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ Quick test failed:', error.message);
    process.exit(1);
  });

