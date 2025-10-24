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
   * Get all available brands from GSM Arena
   * @returns {Promise<Array>} - List of all brands
   */
  async getAllBrands() {
    try {
      await this.init();
      this.currentStatus = 'fetching_brands';
      
      await this.page.goto('https://www.gsmarena.com/makers.php3', { waitUntil: 'networkidle2' });
      
      // Extract all brands
      const brands = await this.page.evaluate(() => {
        const brandElements = document.querySelectorAll('table td a');
        return Array.from(brandElements).map(el => {
          const href = el.getAttribute('href');
          const brandName = href.split('-')[0];
          const deviceCount = el.querySelector('span')?.innerText.replace(/[()]/g, '') || '0';
          
          return {
            name: brandName,
            display_name: el.innerText.replace(/\(\d+\)/, '').trim(),
            device_count: parseInt(deviceCount, 10),
            url: href
          };
        });
      });
      
      this.currentStatus = 'ready';
      return brands;
    } catch (error) {
      this.currentStatus = 'error';
      throw new Error(`Failed to get brands: ${error.message}`);
    }
  }

  /**
   * Get devices by brand name
   * @param {string} brandName - Brand name
   * @returns {Promise<Array>} - List of devices for the brand
   */
  async getDevicesByBrand(brandName) {
    try {
      await this.init();
      this.currentStatus = 'fetching_devices';
      
      await this.page.goto(`https://www.gsmarena.com/${brandName}-phones-f-0-0-p1.php`, { waitUntil: 'networkidle2' });
      
      // Extract all devices for the brand
      const devices = await this.page.evaluate(() => {
        const deviceElements = document.querySelectorAll('.makers ul li');
        return Array.from(deviceElements).map(el => {
          const link = el.querySelector('a');
          const img = el.querySelector('img');
          
          return {
            name: link.innerText.trim(),
            url: link.getAttribute('href'),
            image: img ? img.getAttribute('src') : null,
            id: link.getAttribute('href').split('-')[1].replace('.php', '')
          };
        });
      });
      
      this.currentStatus = 'ready';
      return devices;
    } catch (error) {
      this.currentStatus = 'error';
      throw new Error(`Failed to get devices for brand ${brandName}: ${error.message}`);
    }
  }

  /**
   * Get device specifications by device ID
   * @param {string} deviceId - Device ID
   * @returns {Promise<Object>} - Device specifications
   */
  async getDeviceSpecifications(deviceId) {
    try {
      await this.init();
      this.currentStatus = 'fetching_specifications';
      
      await this.page.goto(`https://www.gsmarena.com/device-${deviceId}.php`, { waitUntil: 'networkidle2' });
      
      // Extract device specifications
      const specifications = await this.page.evaluate(() => {
        const specs = {};
        const specTables = document.querySelectorAll('table');
        
        specTables.forEach(table => {
          const category = table.querySelector('th')?.innerText.trim();
          if (!category) return;
          
          specs[category] = {};
          const rows = table.querySelectorAll('tr:not(:first-child)');
          
          rows.forEach(row => {
            const key = row.querySelector('td.ttl')?.innerText.trim();
            const value = row.querySelector('td.nfo')?.innerText.trim();
            if (key && value) {
              specs[category][key] = value;
            }
          });
        });
        
        // Get device name and image
        const deviceName = document.querySelector('h1.specs-phone-name')?.innerText.trim();
        const deviceImage = document.querySelector('.specs-photo-main img')?.getAttribute('src');
        
        return {
          name: deviceName,
          image: deviceImage,
          specifications: specs
        };
      });
      
      this.currentStatus = 'ready';
      return specifications;
    } catch (error) {
      this.currentStatus = 'error';
      throw new Error(`Failed to get specifications for device ${deviceId}: ${error.message}`);
    }
  }

  /**
   * Find devices by keyword
   * @param {string} keyword - Search keyword
   * @returns {Promise<Array>} - List of matching devices
   */
  async findDevicesByKeyword(keyword) {
    try {
      await this.init();
      this.currentStatus = 'searching_devices';
      
      await this.page.goto(`https://www.gsmarena.com/results.php3?sQuickSearch=${encodeURIComponent(keyword)}`, { waitUntil: 'networkidle2' });
      
      // Extract search results
      const searchResults = await this.page.evaluate(() => {
        const resultElements = document.querySelectorAll('.makers ul li');
        
        if (resultElements.length === 0) {
          return [];
        }
        
        return Array.from(resultElements).map(el => {
          const link = el.querySelector('a');
          const img = el.querySelector('img');
          
          return {
            name: link.innerText.trim(),
            url: link.getAttribute('href'),
            image: img ? img.getAttribute('src') : null,
            id: link.getAttribute('href').split('-')[1].replace('.php', '')
          };
        });
      });
      
      this.currentStatus = 'ready';
      return searchResults;
    } catch (error) {
      this.currentStatus = 'error';
      throw new Error(`Failed to search devices with keyword ${keyword}: ${error.message}`);
    }
  }

  /**
   * Scrape specific brands (or all brands if none specified)
   * @param {Array} brands - Array of brand names (optional - if empty, scrape all)
   * @param {Object} options - Scraping options
   * @returns {Object} - Scraping result
   */
  async scrapeBrands(brands, options = {}) {
    this.isRunning = true;
    this.currentStatus = 'scraping_brands';
    
    try {
      await this.init();
      
      const allBrands = await this.getAvailableBrands();
      
      // If no brands specified or empty array, scrape all available brands
      let brandsToScrape = [];
      
      if (!brands || brands.length === 0) {
        // Scrape all brands
        brandsToScrape = allBrands;
      } else {
        // Find matching brands
        for (const brandName of brands) {
          const brand = allBrands.find(b => b.name === brandName);
          if (brand) {
            brandsToScrape.push(brand);
          }
        }
      }
      
      if (brandsToScrape.length === 0) {
        this.currentStatus = 'error';
        throw new Error(`No brands found matching: ${brands ? brands.join(', ') : 'none'}`);
      }
      
      logProgress(`Found ${brandsToScrape.length} brands to scrape`, 'info');
      logProgress(`Brands: ${brandsToScrape.map(b => b.name).join(', ')}`, 'info');
      
      const result = {
        brands: [],
        scraped_at: new Date().toISOString(),
        total_brands: 0,
        total_models: 0,
        options: options
      };

      for (const brand of brandsToScrape) {
        logProgress(`About to scrape brand: ${brand.name} (${brand.persian_name})`, 'info');
        const brandData = await this.scrapeBrand(brand, options);
        result.brands.push(brandData);
        result.total_models += brandData.models.length;
        
        await delay(CONFIG.DELAYS.between_brands);
      }

      result.total_brands = result.brands.length;
      
      // Check if any models were scraped
      if (result.total_models === 0) {
        this.currentStatus = 'error';
        throw new Error('No models found for the specified brands and filters');
      }
      
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
            persian_name: persianNames[brandName] || brandName.charAt(0).toUpperCase() + brandName.slice(1)
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
        minYear: undefined // No year filtering for test
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
    if (!brand || !brand.name) {
      logProgress(`Invalid brand object: ${JSON.stringify(brand)}`, 'error');
      throw new Error('Invalid brand object provided');
    }
    
    const brandName = brand.persian_name || brand.name || 'Unknown';
    logProgress(`Processing brand: ${brandName}`, 'info');
    
    const models = await this.getBrandModels(brand, options);
    const brandData = {
      name: brand.name,
      persian_name: brand.persian_name || brand.name.charAt(0).toUpperCase() + brand.name.slice(1),
      logo_url: `${CONFIG.URLS.base}/img/logo_${brand.name}.png`,
      is_active: true,
      models: []
    };

    const modelsPerBrand = options.modelsPerBrand || models.length; // If not specified, scrape all models
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
    
    try {
      await this.page.goto(brand.url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      await delay(CONFIG.DELAYS.page_load);

      const models = await this.page.evaluate((excludeKeywords, minYear) => {
        const modelElements = document.querySelectorAll('.makers a');
        const models = [];
        
        modelElements.forEach(element => {
          const modelName = element.textContent.trim();
          const modelUrl = element.href;
          
          // Validate URL
          if (!modelUrl || !modelUrl.startsWith('http')) {
            return;
          }
          
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
      }, CONFIG.EXCLUDE_KEYWORDS, options.minYear !== undefined ? options.minYear : null);

      logProgress(`Found ${models.length} phone models for ${brand.persian_name}`, 'success');
      return models;
    } catch (error) {
      logProgress(`Error getting models for ${brand.persian_name}: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Get detailed information for a specific model
   * @param {Object} model - Model object
   * @param {Object} options - Scraping options
   * @returns {Object} - Detailed model information
   */
  async getModelDetails(model, options = {}) {
    try {
      // Validate URL before navigation
      if (!model.url || !model.url.startsWith('http')) {
        logProgress(`Invalid URL for model ${model.name}: ${model.url}`, 'error');
        return generateFallbackData('unknown', model.name);
      }

      await this.page.goto(model.url, {
        waitUntil: 'networkidle2',
        timeout: 60000
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
