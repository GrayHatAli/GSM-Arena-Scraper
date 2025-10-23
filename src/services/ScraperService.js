// Scraper Service - Core scraping logic

import puppeteer from 'puppeteer';
import { CONFIG } from '../config/config.js';
import { 
  delay, 
  extractYear, 
  shouldExcludeDevice, 
  extractRamStorageOptions,
  formatSpecifications,
  generateFallbackData,
  logProgress
} from '../utils/ScraperUtils.js';

export class ScraperService {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isRunning = false;
    this.currentStatus = 'idle';
  }

  /**
   * Initialize browser and page
   */
  async init() {
    if (this.browser) return;
    
    logProgress('Initializing browser...', 'info');
    this.browser = await puppeteer.launch(CONFIG.PUPPETEER_OPTIONS);
    this.page = await this.browser.newPage();
    
    await this.page.setUserAgent(CONFIG.USER_AGENT);
    this.currentStatus = 'ready';
    logProgress('Browser initialized successfully', 'success');
  }

  /**
   * Close browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.currentStatus = 'idle';
      logProgress('Browser closed', 'info');
    }
  }

  /**
   * Scrape all brands and models
   * @param {Object} options - Scraping options
   * @returns {Object} - Scraping result
   */
  async scrapeAll(options = {}) {
    this.isRunning = true;
    this.currentStatus = 'scraping_all';
    
    try {
      await this.init();
      
      const brands = await this.getAvailableBrands();
      const targetBrands = options.brands || CONFIG.TARGET_BRANDS;
      const filteredBrands = brands.filter(brand => targetBrands.includes(brand.name));
      
      const result = {
        brands: [],
        scraped_at: new Date().toISOString(),
        total_brands: 0,
        total_models: 0,
        options: options
      };

      for (const brand of filteredBrands) {
        const brandData = await this.scrapeBrand(brand, options);
        result.brands.push(brandData);
        result.total_models += brandData.models.length;
        
        await delay(CONFIG.DELAYS.between_brands);
      }

      result.total_brands = result.brands.length;
      this.currentStatus = 'completed';
      
      return result;
    } catch (error) {
      this.currentStatus = 'error';
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Scrape specific brands
   * @param {Array} brands - Array of brand names
   * @param {Object} options - Scraping options
   * @returns {Object} - Scraping result
   */
  async scrapeBrands(brands, options = {}) {
    this.isRunning = true;
    this.currentStatus = 'scraping_brands';
    
    try {
      await this.init();
      
      const allBrands = await this.getAvailableBrands();
      const targetBrands = allBrands.filter(brand => brands.includes(brand.name));
      
      const result = {
        brands: [],
        scraped_at: new Date().toISOString(),
        total_brands: 0,
        total_models: 0,
        options: options
      };

      for (const brand of targetBrands) {
        const brandData = await this.scrapeBrand(brand, options);
        result.brands.push(brandData);
        result.total_models += brandData.models.length;
        
        await delay(CONFIG.DELAYS.between_brands);
      }

      result.total_brands = result.brands.length;
      this.currentStatus = 'completed';
      
      return result;
    } catch (error) {
      this.currentStatus = 'error';
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Scrape specific brand models
   * @param {string} brandName - Brand name
   * @param {Object} options - Scraping options
   * @returns {Object} - Scraping result
   */
  async scrapeBrandModels(brandName, options = {}) {
    this.isRunning = true;
    this.currentStatus = 'scraping_models';
    
    try {
      await this.init();
      
      const allBrands = await this.getAvailableBrands();
      const brand = allBrands.find(b => b.name === brandName);
      
      if (!brand) {
        throw new Error(`Brand ${brandName} not found`);
      }

      const brandData = await this.scrapeBrand(brand, options);
      
      this.currentStatus = 'completed';
      
      return {
        brand: brandData,
        scraped_at: new Date().toISOString(),
        total_models: brandData.models.length,
        options: options
      };
    } catch (error) {
      this.currentStatus = 'error';
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get available brands from GSM Arena
   * @returns {Array} - Available brands
   */
  async getAvailableBrands() {
    try {
      await this.init();
      
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

      return brands;
    } catch (error) {
      throw new Error(`Failed to get available brands: ${error.message}`);
    }
  }

  /**
   * Test scraping with single brand
   * @param {string} brandName - Brand name to test
   * @returns {Object} - Test result
   */
  async testScraping(brandName = 'apple') {
    try {
      await this.init();
      
      const allBrands = await this.getAvailableBrands();
      const brand = allBrands.find(b => b.name === brandName);
      
      if (!brand) {
        throw new Error(`Brand ${brandName} not found`);
      }

      const options = {
        modelsPerBrand: 3,
        minYear: CONFIG.MIN_YEAR
      };

      const brandData = await this.scrapeBrand(brand, options);
      
      return {
        brand: brandData,
        scraped_at: new Date().toISOString(),
        total_models: brandData.models.length,
        test_mode: true
      };
    } catch (error) {
      throw new Error(`Test scraping failed: ${error.message}`);
    }
  }

  /**
   * Get current scraping status
   * @returns {Object} - Current status
   */
  async getStatus() {
    return {
      status: this.currentStatus,
      isRunning: this.isRunning,
      hasBrowser: !!this.browser,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Scrape a single brand
   * @param {Object} brand - Brand object
   * @param {Object} options - Scraping options
   * @returns {Object} - Brand data with models
   */
  async scrapeBrand(brand, options = {}) {
    logProgress(`Processing brand: ${brand.persian_name}`, 'info');
    
    const models = await this.getBrandModels(brand, options);
    const brandData = {
      name: brand.name,
      persian_name: brand.persian_name,
      logo_url: `${CONFIG.URLS.base}/img/logo_${brand.name}.png`,
      is_active: true,
      models: []
    };

    const modelsPerBrand = options.modelsPerBrand || CONFIG.MODELS_PER_BRAND;
    const modelsToProcess = models.slice(0, modelsPerBrand);
    
    for (const model of modelsToProcess) {
      logProgress(`  Processing model: ${model.name}`, 'info');
      
      const modelDetails = await this.getModelDetails(model, options);
      
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
   * Get models for a specific brand
   * @param {Object} brand - Brand object
   * @param {Object} options - Scraping options
   * @returns {Array} - Array of model objects
   */
  async getBrandModels(brand, options = {}) {
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
        
        // Filter by year
        if (!year || year >= minYear) {
          models.push({
            name: modelName,
            url: modelUrl,
            year: year,
            persian_name: modelName
          });
        }
      });
      
      return models;
    }, CONFIG.EXCLUDE_KEYWORDS, options.minYear || CONFIG.MIN_YEAR);

    logProgress(`Found ${models.length} phone models for ${brand.persian_name}`, 'success');
    return models;
  }

  /**
   * Get detailed information for a specific model
   * @param {Object} model - Model object
   * @param {Object} options - Scraping options
   * @returns {Object} - Detailed model information
   */
  async getModelDetails(model, options = {}) {
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
        const colors = Array.from(colorElements).map(el => ({
          en: el.textContent.trim(),
          fa: el.textContent.trim()
        }));
        
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
          { en: 'Black', fa: 'مشکی' },
          { en: 'White', fa: 'سفید' }
        ],
        image_url: details.image_url
      };

    } catch (error) {
      logProgress(`Error processing model ${model.name}: ${error.message}`, 'error');
      return generateFallbackData('unknown', model.name);
    }
  }
}
