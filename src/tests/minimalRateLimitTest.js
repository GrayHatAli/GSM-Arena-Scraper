/**
 * Minimal test - just makes 3 requests and checks for 429 errors
 * No device scraping, just basic requests
 */

import { ScraperService } from '../services/ScraperService.js';
import { logProgress } from '../utils/ScraperUtils.js';

async function minimalTest() {
  console.log('🧪 Minimal Rate Limiting Test\n');
  
  const scraper = new ScraperService();
  let error429Count = 0;
  let requestCount = 0;
  
  // Track 429 errors
  const originalRequest = scraper.apiClient.request;
  scraper.apiClient.request = async function(config) {
    requestCount++;
    const url = config.url || config;
    logProgress(`Request #${requestCount}: ${url}`, 'info');
    
    try {
      const response = await originalRequest.call(this, config);
      logProgress(`✅ Request #${requestCount} successful`, 'success');
      return response;
    } catch (error) {
      if (error.response?.status === 429) {
        error429Count++;
        logProgress(`❌ 429 Error on request #${requestCount}`, 'error');
      } else {
        logProgress(`⚠️  Error on request #${requestCount}: ${error.message}`, 'warning');
      }
      throw error;
    }
  };
  
  try {
    // Request 1: Get brands
    logProgress('Making 3 test requests with delays...', 'info');
    logProgress('\n--- Request 1: Getting brands ---', 'info');
    const brands = await scraper.getAllBrands();
    logProgress(`✅ Got ${brands.length} brands\n`, 'success');
    
    // Check stats after first request
    const status1 = await scraper.getStatus();
    console.log('📊 Stats after request 1:');
    console.log(`   Total: ${status1.rateLimiter.totalRequests}`);
    console.log(`   Successful: ${status1.rateLimiter.successfulRequests}`);
    console.log(`   Rate Limited: ${status1.rateLimiter.rateLimitedRequests}`);
    console.log(`   Current Delay: ${status1.rateLimiter.currentDelay}ms\n`);
    
    // Wait for rate limiter
    logProgress('Waiting 5 seconds for rate limiter...', 'info');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Request 2: Get status (lightweight)
    logProgress('--- Request 2: Getting status ---', 'info');
    const status2 = await scraper.getStatus();
    logProgress(`✅ Status retrieved\n`, 'success');
    
    console.log('📊 Stats after request 2:');
    console.log(`   Total: ${status2.rateLimiter.totalRequests}`);
    console.log(`   Successful: ${status2.rateLimiter.successfulRequests}`);
    console.log(`   Rate Limited: ${status2.rateLimiter.rateLimitedRequests}`);
    console.log(`   Current Delay: ${status2.rateLimiter.currentDelay}ms\n`);
    
    // Wait for rate limiter
    logProgress('Waiting 5 seconds for rate limiter...', 'info');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Request 3: Try to get a single device page (if we have brands)
    if (brands.length > 0) {
      const testBrand = brands.find(b => b.name.toLowerCase() === 'nothing') || brands[0];
      logProgress(`--- Request 3: Getting devices for ${testBrand.name} ---`, 'info');
      
      // Just get devices list, don't scrape details
      const devices = await scraper.searchDevicesByBrand(testBrand.name, {
        minYear: 2023,
        brandUrl: testBrand.url
      });
      
      logProgress(`✅ Found ${devices.length} devices\n`, 'success');
    }
    
    // Final check
    const finalStatus = await scraper.getStatus();
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 Final Test Results:');
    console.log('='.repeat(60));
    console.log(`Total HTTP Requests Made: ${requestCount}`);
    console.log(`${error429Count > 0 ? '❌' : '✅'} Direct 429 Errors: ${error429Count}`);
    console.log(`Rate Limiter Total Requests: ${finalStatus.rateLimiter.totalRequests}`);
    console.log(`Rate Limiter Successful: ${finalStatus.rateLimiter.successfulRequests}`);
    console.log(`Rate Limiter Rate Limited: ${finalStatus.rateLimiter.rateLimitedRequests}`);
    console.log(`Rate Limiter Failed: ${finalStatus.rateLimiter.failedRequests}`);
    console.log(`Current Delay: ${finalStatus.rateLimiter.currentDelay}ms`);
    console.log(`Circuit Breaker Open: ${finalStatus.rateLimiter.circuitBreakerOpen}`);
    console.log(`Circuit Breaker Failures: ${finalStatus.rateLimiter.circuitBreakerFailures}`);
    console.log('='.repeat(60));
    
    const has429Errors = error429Count > 0 || finalStatus.rateLimiter.rateLimitedRequests > 0;
    
    if (!has429Errors) {
      console.log('\n🎉 SUCCESS: No 429 errors detected!');
      console.log('✅ Rate limiting is working correctly.');
      console.log('✅ All requests were successful.');
      return true;
    } else {
      console.log(`\n⚠️  WARNING:`);
      if (error429Count > 0) {
        console.log(`   - ${error429Count} direct 429 error(s) detected.`);
      }
      if (finalStatus.rateLimiter.rateLimitedRequests > 0) {
        console.log(`   - ${finalStatus.rateLimiter.rateLimitedRequests} rate limited request(s) were handled by rate limiter.`);
        console.log('   - This is actually good - the rate limiter caught and handled them!');
      }
      return false;
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    
    // Show rate limiter stats
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
minimalTest()
  .then(success => {
    console.log('\n' + (success ? '✅' : '⚠️') + ' Test completed.');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Test error:', error.message);
    process.exit(1);
  });

