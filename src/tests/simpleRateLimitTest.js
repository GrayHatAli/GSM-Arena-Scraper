/**
 * Simple test - just makes a few requests and checks for 429 errors
 */

import { ScraperService } from '../services/ScraperService.js';
import { logProgress } from '../utils/ScraperUtils.js';

async function simpleTest() {
  console.log('🧪 Simple Rate Limiting Test\n');
  
  const scraper = new ScraperService();
  let error429Count = 0;
  let requestCount = 0;
  
  // Track 429 errors
  const originalRequest = scraper.apiClient.request;
  scraper.apiClient.request = async function(config) {
    requestCount++;
    try {
      const response = await originalRequest.call(this, config);
      return response;
    } catch (error) {
      if (error.response?.status === 429) {
        error429Count++;
        logProgress(`❌ 429 Error on request #${requestCount}`, 'error');
      }
      throw error;
    }
  };
  
  try {
    // Make a few requests
    logProgress('Making test requests...', 'info');
    
    // Request 1: Get brands
    logProgress('Request 1: Getting brands...', 'info');
    const brands = await scraper.getAllBrands();
    logProgress(`✅ Got ${brands.length} brands`, 'success');
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Request 2: Get status
    logProgress('Request 2: Getting status...', 'info');
    const status1 = await scraper.getStatus();
    logProgress(`✅ Status retrieved`, 'success');
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Request 3: Try to get devices for a small brand
    if (brands.length > 0) {
      const testBrand = brands.find(b => b.name.toLowerCase() === 'nothing') || brands[0];
      logProgress(`Request 3: Searching devices for ${testBrand.name}...`, 'info');
      
      // This will make multiple requests internally
      const devices = await scraper.searchDevicesByBrand(testBrand.name, {
        minYear: 2023,
        brandUrl: testBrand.url
      });
      
      logProgress(`✅ Found ${devices.length} devices`, 'success');
    }
    
    // Final check
    const finalStatus = await scraper.getStatus();
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 Test Results:');
    console.log('='.repeat(60));
    console.log(`Total Requests Made: ${requestCount}`);
    console.log(`${error429Count > 0 ? '❌' : '✅'} 429 Errors: ${error429Count}`);
    console.log(`Rate Limiter Total Requests: ${finalStatus.rateLimiter.totalRequests}`);
    console.log(`Rate Limiter Successful: ${finalStatus.rateLimiter.successfulRequests}`);
    console.log(`Rate Limiter Rate Limited: ${finalStatus.rateLimiter.rateLimitedRequests}`);
    console.log(`Current Delay: ${finalStatus.rateLimiter.currentDelay}ms`);
    console.log(`Circuit Breaker Open: ${finalStatus.rateLimiter.circuitBreakerOpen}`);
    console.log('='.repeat(60));
    
    if (error429Count === 0 && finalStatus.rateLimiter.rateLimitedRequests === 0) {
      console.log('\n🎉 SUCCESS: No 429 errors detected!');
      console.log('✅ Rate limiting is working correctly.');
      return true;
    } else {
      console.log(`\n⚠️  WARNING: ${error429Count} direct 429 error(s) or ${finalStatus.rateLimiter.rateLimitedRequests} rate limited request(s) detected.`);
      if (finalStatus.rateLimiter.rateLimitedRequests > 0) {
        console.log('   Note: Rate limiter detected and handled some rate limits automatically.');
      }
      return false;
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    // Show rate limiter stats
    try {
      const status = await scraper.getStatus();
      console.log('\n📊 Rate Limiter Stats:');
      console.log(JSON.stringify(status.rateLimiter, null, 2));
    } catch (e) {
      // Ignore
    }
    
    throw error;
  }
}

// Run test
simpleTest()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });

