// Test script for GSM Arena Scraper

import GSMArenaScraper from './scraper.js';
import { CONFIG } from './config.js';
import { saveToFile, logProgress } from './utils.js';

// Test with single brand
CONFIG.TARGET_BRANDS = ['apple'];
CONFIG.MODELS_PER_BRAND = 5;

async function testScraper() {
  logProgress('Starting test scraper...', 'info');
  
  const scraper = new GSMArenaScraper();
  
  try {
    await scraper.init();
    
    // Test brands extraction
    logProgress('Testing brands extraction...', 'info');
    const brands = await scraper.getBrands();
    console.log('Found brands:', brands.map(b => b.name));
    
    if (brands.length > 0) {
      // Test single brand processing
      const brand = brands[0];
      logProgress(`Testing brand processing: ${brand.persian_name}`, 'info');
      
      const brandData = await scraper.processBrand(brand);
      console.log(`Processed ${brandData.models.length} models for ${brand.persian_name}`);
      
      // Show sample model data
      if (brandData.models.length > 0) {
        const sampleModel = brandData.models[0];
        console.log('\nSample model data:');
        console.log(`  Name: ${sampleModel.model_name}`);
        console.log(`  RAM: ${sampleModel.ram_options.join(', ')}`);
        console.log(`  Storage: ${sampleModel.storage_options.join(', ')}`);
        console.log(`  Colors: ${sampleModel.color_options.length}`);
        console.log(`  Specifications: ${Object.keys(sampleModel.specifications).length} items`);
        console.log(`  Image: ${sampleModel.image_url ? 'Yes' : 'No'}`);
      }
      
      // Save test data
      const testData = {
        brands: [brandData],
        scraped_at: new Date().toISOString(),
        total_brands: 1,
        total_models: brandData.models.length
      };
      
      await saveToFile(testData, 'output/test-data.json');
      logProgress('Test data saved to output/test-data.json', 'success');
    }
    
  } catch (error) {
    logProgress(`Test failed: ${error.message}`, 'error');
  } finally {
    await scraper.close();
  }
}

// Run test
testScraper();
