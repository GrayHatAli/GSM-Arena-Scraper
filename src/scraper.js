// Main GSM Arena Scraper

import puppeteer from 'puppeteer';
import { CONFIG } from './config.js';
import { 
  delay, 
  saveToFile, 
  extractYear, 
  shouldExcludeDevice, 
  extractRamStorageOptions,
  formatSpecifications,
  generateFallbackData,
  logProgress
} from './utils.js';

class GSMArenaScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  /**
   * Initialize browser and page
   */
  async init() {
    logProgress('Initializing browser...', 'info');
    this.browser = await puppeteer.launch(CONFIG.PUPPETEER_OPTIONS);
    this.page = await this.browser.newPage();
    
    await this.page.setUserAgent(CONFIG.USER_AGENT);
    logProgress('Browser initialized successfully', 'success');
  }

  /**
   * Close browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      logProgress('Browser closed', 'info');
    }
  }

  /**
   * Extract brands from GSM Arena makers page
   * @returns {Array} - Array of brand objects
   */
  async getBrands() {
    logProgress('Extracting brands from GSM Arena...', 'info');
    
    await this.page.goto(CONFIG.URLS.makers, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    const brands = await this.page.evaluate((persianNames) => {
      const brandElements = document.querySelectorAll('.st-text a');
      const brands = [];
      
      brandElements.forEach(element => {
        const brandText = element.textContent.trim();
        const brandName = brandText.replace(/\d+.*$/, '').toLowerCase().trim();
        const brandUrl = element.href;
        
        brands.push({
          name: brandName,
          url: brandUrl,
          persian_name: persianNames[brandName] || brandName
        });
      });
      
      return brands;
    }, CONFIG.PERSIAN_NAMES);

    logProgress(`Found ${brands.length} target brands`, 'success');
    return brands;
  }

  /**
   * Extract models for a specific brand
   * @param {Object} brand - Brand object
   * @returns {Array} - Array of model objects
   */
  async getBrandModels(brand) {
    logProgress(`Extracting models for ${brand.persian_name}...`, 'info');
    
    await this.page.goto(brand.url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await delay(CONFIG.DELAYS.page_load);

    const models = await this.page.evaluate((excludeKeywords, minYear) => {
      const modelElements = document.querySelectorAll('.makers a');
      const models = [];
      
      modelElements.forEach(element => {
        const modelName = element.textContent.trim();
        const modelUrl = element.href;
        
        // Check if device should be excluded
        const shouldExclude = excludeKeywords.some(keyword => 
          modelName.toLowerCase().includes(keyword)
        );
        
        if (shouldExclude) return;
        
        // Extract year
        const yearMatch = modelName.match(/(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1]) : null;
        
        // Filter by year (if minYear is specified, otherwise include all)
        if (minYear === null || !year || year >= minYear) {
          models.push({
            name: modelName,
            url: modelUrl,
            year: year,
            persian_name: modelName
          });
        }
      });
      
      return models;
    }, CONFIG.EXCLUDE_KEYWORDS, CONFIG.DEFAULT_MIN_YEAR);

    logProgress(`Found ${models.length} phone models for ${brand.persian_name}`, 'success');
    return models;
  }

  /**
   * Extract detailed information for a specific model
   * @param {Object} model - Model object
   * @returns {Object} - Detailed model information
   */
  async getModelDetails(model) {
    try {
      await this.page.goto(model.url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      await delay(CONFIG.DELAYS.between_requests);

      const details = await this.page.evaluate(() => {
        const specs = {};
        
        // Try to find specifications table
        let specTable = document.querySelector('.specs-list');
        if (!specTable) {
          const altSelectors = [
            '.specs-list table',
            '.specs-list tbody',
            '.specs-list .specs-list',
            '.specs-list .specs-list table'
          ];
          
          for (const selector of altSelectors) {
            specTable = document.querySelector(selector);
            if (specTable) break;
          }
        }
        
        if (specTable) {
          const rows = specTable.querySelectorAll('tr');
          rows.forEach(row => {
            const cells = row.querySelectorAll('td, th');
            if (cells.length >= 2) {
              const label = cells[0]?.textContent?.trim();
              const value = cells[1]?.textContent?.trim();
              
              if (label && value) {
                specs[label] = value;
              }
            }
          });
        }
        
        // Extract colors
        const colorElements = document.querySelectorAll('.color-variant, .color-variant a, .color-variant span, .color-variant div');
        const colors = Array.from(colorElements).map(el => el.textContent.trim());
        
        // Extract image
        const imageSelectors = [
          '.specs-photo-main img',
          '.specs-photo img',
          '.phone-pic img',
          '.main-pic img',
          '.device-pic img'
        ];
        
        let imageUrl = null;
        for (const selector of imageSelectors) {
          const img = document.querySelector(selector);
          if (img && (img.src || img.href)) {
            imageUrl = img.src || img.href;
            break;
          }
        }
        
        return {
          specifications: specs,
          colors: colors,
          image_url: imageUrl
        };
      });

      // Extract RAM and Storage options
      const ramStorage = extractRamStorageOptions(details.specifications);
      
      return {
        specifications: formatSpecifications(details.specifications),
        ram_options: ramStorage.ram_options,
        storage_options: ramStorage.storage_options,
        color_options: details.colors.length > 0 ? details.colors : [
          'Black',
          'White'
        ],
        image_url: details.image_url
      };

    } catch (error) {
      logProgress(`Error processing model ${model.name}: ${error.message}`, 'error');
      return generateFallbackData('unknown', model.name);
    }
  }

  /**
   * Process a single brand
   * @param {Object} brand - Brand object
   * @returns {Object} - Brand data with models
   */
  async processBrand(brand) {
    logProgress(`Processing brand: ${brand.persian_name}`, 'info');
    
    const models = await this.getBrandModels(brand);
    const brandData = {
      name: brand.name,
      persian_name: brand.persian_name,
      logo_url: `${CONFIG.URLS.base}/img/logo_${brand.name}.png`,
      is_active: true,
      models: []
    };

    // Process models (all models by default)
    const modelsToProcess = models; // Process all models by default
    
    for (const model of modelsToProcess) {
      logProgress(`  Processing model: ${model.name}`, 'info');
      
      const modelDetails = await this.getModelDetails(model);
      
      brandData.models.push({
        brand_name: brand.name,
        model_name: model.name,
        persian_name: model.persian_name,
        series: model.name.split(' ')[0],
        ram_options: modelDetails.ram_options,
        storage_options: modelDetails.storage_options,
        color_options: modelDetails.color_options,
        specifications: modelDetails.specifications,
        release_date: model.year ? `${model.year}-01-01` : '2023-01-01',
        image_url: modelDetails.image_url,
        is_active: true
      });

      await delay(CONFIG.DELAYS.between_requests);
    }

    logProgress(`Completed processing ${brand.persian_name}: ${brandData.models.length} models`, 'success');
    return brandData;
  }

  /**
   * Main scraping function
   * @returns {Object} - Complete scraped data
   */
  async scrape() {
    try {
      await this.init();
      
      const brands = await this.getBrands();
      const allData = {
        brands: [],
        scraped_at: new Date().toISOString(),
        total_brands: 0,
        total_models: 0
      };

      // Process each brand
      for (const brand of brands) {
        try {
          const brandData = await this.processBrand(brand);
          allData.brands.push(brandData);
          
          await delay(CONFIG.DELAYS.between_brands);
        } catch (error) {
          logProgress(`Error processing brand ${brand.name}: ${error.message}`, 'error');
        }
      }

      // Calculate final stats
      allData.total_brands = allData.brands.length;
      allData.total_models = allData.brands.reduce((total, brand) => total + brand.models.length, 0);

      logProgress(`Scraping completed! Brands: ${allData.total_brands}, Models: ${allData.total_models}`, 'success');
      
      return allData;

    } catch (error) {
      logProgress(`Scraping failed: ${error.message}`, 'error');
      throw error;
    } finally {
      await this.close();
    }
  }
}

// Main execution
async function main() {
  const scraper = new GSMArenaScraper();
  
  try {
    const data = await scraper.scrape();
    await saveToFile(data, CONFIG.OUTPUT_FILE);
    logProgress('Scraping completed successfully!', 'success');
  } catch (error) {
    logProgress(`Scraping failed: ${error.message}`, 'error');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default GSMArenaScraper;
