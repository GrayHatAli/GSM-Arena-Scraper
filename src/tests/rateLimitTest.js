/**
 * Test script to verify rate limiting and scraping functionality
 * Tests a small brand to ensure:
 * 1. No 429 errors are received
 * 2. Models are scraped correctly
 */

import { ScraperService } from '../services/ScraperService.js';
import { logProgress } from '../utils/ScraperUtils.js';

async function testRateLimiting() {
  console.log('🧪 Starting Rate Limiting Test...\n');
  
  const scraper = new ScraperService();
  let error429Count = 0;
  let successCount = 0;
  let totalRequests = 0;
  
  // Track 429 errors
  const originalMakeRequest = scraper.apiClient.request;
  scraper.apiClient.request = async function(config) {
    totalRequests++;
    try {
      const response = await originalMakeRequest.call(this, config);
      successCount++;
      return response;
    } catch (error) {
      if (error.response?.status === 429) {
        error429Count++;
        logProgress(`❌ 429 Error detected! Request #${totalRequests}`, 'error');
      }
      throw error;
    }
  };
  
  try {
    // Test 1: Get brands list (should not get 429)
    logProgress('Test 1: Getting brands list...', 'info');
    const brands = await scraper.getAllBrands();
    logProgress(`✅ Found ${brands.length} brands`, 'success');
    
    if (brands.length === 0) {
      console.log('⚠️  Warning: No brands found. This might indicate a problem.');
    }
    
    // Test 2: Scrape a small brand (Nothing has few models)
    logProgress('\nTest 2: Scraping a small brand (nothing)...', 'info');
    const testBrand = brands.find(b => b.name.toLowerCase() === 'nothing') || brands[0];
    
    if (!testBrand) {
      throw new Error('No brand found to test');
    }
    
    logProgress(`Testing with brand: ${testBrand.name}`, 'info');
    
    const brandData = await scraper.scrapeBrand(testBrand, {
      minYear: 2022,
      modelsPerBrand: 5 // Limit to 5 models for testing
    });
    
    logProgress(`✅ Scraped ${brandData.models.length} models for ${brandData.name}`, 'success');
    
    // Test 3: Check rate limiter stats
    logProgress('\nTest 3: Checking rate limiter statistics...', 'info');
    const status = await scraper.getStatus();
    const rateLimiterStats = status.rateLimiter;
    
    console.log('\n📊 Rate Limiter Statistics:');
    console.log(`   Total Requests: ${rateLimiterStats.totalRequests}`);
    console.log(`   Successful Requests: ${rateLimiterStats.successfulRequests}`);
    console.log(`   Rate Limited Requests: ${rateLimiterStats.rateLimitedRequests}`);
    console.log(`   Failed Requests: ${rateLimiterStats.failedRequests}`);
    console.log(`   Current Delay: ${rateLimiterStats.currentDelay}ms`);
    console.log(`   Circuit Breaker Open: ${rateLimiterStats.circuitBreakerOpen}`);
    console.log(`   Circuit Breaker Failures: ${rateLimiterStats.circuitBreakerFailures}`);
    
    // Test 4: Verify models were scraped correctly
    logProgress('\nTest 4: Verifying scraped models...', 'info');
    
    if (brandData.models.length === 0) {
      console.log('⚠️  Warning: No models were scraped. This might indicate a problem.');
    } else {
      console.log('\n📱 Sample Models:');
      brandData.models.slice(0, 3).forEach((model, index) => {
        console.log(`   ${index + 1}. ${model.model_name}`);
        console.log(`      - URL: ${model.device_url}`);
        console.log(`      - Release Year: ${model.release_year || 'N/A'}`);
        console.log(`      - Device ID: ${model.device_id || 'N/A'}`);
      });
    }
    
    // Final Results
    console.log('\n' + '='.repeat(60));
    console.log('📋 Test Results Summary:');
    console.log('='.repeat(60));
    console.log(`✅ Total Requests: ${totalRequests}`);
    console.log(`✅ Successful Requests: ${successCount}`);
    console.log(`${error429Count > 0 ? '❌' : '✅'} 429 Errors: ${error429Count}`);
    console.log(`✅ Models Scraped: ${brandData.models.length}`);
    console.log(`✅ Rate Limiter Working: ${rateLimiterStats.totalRequests > 0 ? 'Yes' : 'No'}`);
    
    if (error429Count === 0) {
      console.log('\n🎉 SUCCESS: No 429 errors detected!');
      console.log('✅ Rate limiting is working correctly.');
    } else {
      console.log(`\n⚠️  WARNING: ${error429Count} 429 error(s) detected.`);
      console.log('   Consider increasing delays in config.');
    }
    
    if (brandData.models.length > 0) {
      console.log('✅ Models are being scraped correctly.');
    } else {
      console.log('⚠️  WARNING: No models were scraped. Check scraping logic.');
    }
    
    console.log('='.repeat(60) + '\n');
    
    return {
      success: error429Count === 0 && brandData.models.length > 0,
      error429Count,
      modelsScraped: brandData.models.length,
      totalRequests,
      rateLimiterStats
    };
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    
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

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testRateLimiting()
    .then(result => {
      if (result.success) {
        console.log('✅ All tests passed!');
        process.exit(0);
      } else {
        console.log('⚠️  Some tests had issues.');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

export { testRateLimiting };

