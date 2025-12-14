/**
 * Direct test to verify rate limiter is actually being used
 * This test directly calls methods that make HTTP requests
 */

import { ScraperService } from '../services/ScraperService.js';
import { logProgress } from '../utils/ScraperUtils.js';

async function directTest() {
  console.log('🧪 Direct Rate Limiter Test\n');
  
  const scraper = new ScraperService();
  
  try {
    // Get initial status
    console.log('📊 Step 1: Getting initial status...');
    const status1 = await scraper.getStatus();
    const initialRequests = status1.rateLimiter.totalRequests;
    console.log(`   Initial Total Requests: ${initialRequests}`);
    
    // Make a direct HTTP request that MUST go through requestQueue
    console.log('\n🔍 Step 2: Making direct HTTP request (getAllBrands)...');
    console.log('   This MUST go through requestQueue and rate limiter');
    
    const brands = await scraper.getAllBrands();
    
    console.log(`   ✅ Got ${brands.length} brands`);
    
    // Get status after request
    console.log('\n📊 Step 3: Getting status after request...');
    const status2 = await scraper.getStatus();
    const finalRequests = status2.rateLimiter.totalRequests;
    const successfulRequests = status2.rateLimiter.successfulRequests;
    const rateLimitedRequests = status2.rateLimiter.rateLimitedRequests;
    
    console.log(`   Final Total Requests: ${finalRequests}`);
    console.log(`   Successful Requests: ${successfulRequests}`);
    console.log(`   Rate Limited Requests: ${rateLimitedRequests}`);
    
    const requestsMade = finalRequests - initialRequests;
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 Test Results:');
    console.log('='.repeat(60));
    console.log(`Requests Made: ${requestsMade}`);
    console.log(`Successful Requests: ${successfulRequests}`);
    console.log(`Rate Limited Requests: ${rateLimitedRequests}`);
    console.log('='.repeat(60));
    
    if (requestsMade === 0) {
      console.log('\n❌ PROBLEM: No requests went through rate limiter!');
      console.log('   This means requests are NOT using requestQueue');
      console.log('   Check that makeRequestWithRetry is being called');
      return false;
    } else if (requestsMade > 0 && rateLimitedRequests === 0) {
      console.log('\n✅ SUCCESS: Requests are going through rate limiter!');
      console.log(`   ${requestsMade} request(s) were processed`);
      console.log('   No rate limit errors detected');
      return true;
    } else {
      console.log('\n⚠️  WARNING: Rate limiter detected some rate limits');
      console.log(`   ${rateLimitedRequests} request(s) were rate limited`);
      console.log('   But rate limiter handled them correctly');
      return true;
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    
    // Show final status
    try {
      const status = await scraper.getStatus();
      console.log('\n📊 Final Rate Limiter Stats:');
      console.log(JSON.stringify(status.rateLimiter, null, 2));
    } catch (e) {
      // Ignore
    }
    
    return false;
  }
}

// Run test
directTest()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });



