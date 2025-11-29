import { ScraperAPI } from './api/server.js';
import { ScraperAPIClient } from './api/client.js';
import { ScraperController } from './controllers/ScraperController.js';
import { CONFIG } from './config/config.js';
import { runInitialScrapeInBackground } from './database/initialScrape.js';
import { startJobQueue } from './jobs/index.js';

async function startServer() {
  try {
    console.log('🚀 Starting GSM Arena Scraper API Server...');
    const api = new ScraperAPI();
    api.start();
    console.log('📊 Starting initial database population in background...');
    runInitialScrapeInBackground();
    startJobQueue();
  } catch (error) {
    console.error('❌ Failed to start API server:', error.message);
    process.exit(1);
  }
}

async function runCLI() {
  try {
    console.log('🚀 Starting GSM Arena Scraper CLI...');
    const controller = new ScraperController();
    const result = await controller.scrapeAll();
    
    if (result.success) {
      console.log('\n✅ Scraping completed successfully!');
      console.log(`📊 Final Statistics:`);
      console.log(`   - Brands: ${result.data.total_brands}`);
      console.log(`   - Models: ${result.data.total_models}`);
      console.log(`💾 Data saved to: ${CONFIG.OUTPUT_FILE}`);
    } else {
      console.error('❌ Scraping failed:', result.message);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Scraping failed:', error.message);
    process.exit(1);
  }
}

async function testAPI() {
  try {
    console.log('🧪 Testing API Client...');
    const client = new ScraperAPIClient();
    await client.waitForServer();
    
    const health = await client.healthCheck();
    console.log('✅ Health check:', health.message);
    
    const status = await client.getStatus();
    console.log('✅ Status:', status.data);
    
    const searchResult = await client.searchDevices({ brand_name: 'apple' });
    console.log(`✅ Device search: Found ${searchResult.data?.devices?.length || 0} devices`);
    console.log('🎉 API Client test completed successfully!');
  } catch (error) {
    console.error('❌ API Client test failed:', error.message);
    process.exit(1);
  }
}
const command = process.argv[2] || 'cli';

switch (command) {
  case 'server':
    startServer();
    break;
  case 'cli':
    runCLI();
    break;
  case 'test':
    testAPI();
    break;
  default:
    console.log('Usage:');
    console.log('  node src/index.js server  - Start API server');
    console.log('  node src/index.js cli     - Run CLI scraping');
    console.log('  node src/index.js test    - Test API client');
    break;
}