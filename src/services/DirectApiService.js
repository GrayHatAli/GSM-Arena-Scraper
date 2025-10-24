/**
 * DirectApiService.js
 * A service that uses direct API requests to GSM Arena instead of browser scraping
 */

import axios from 'axios';
import { logProgress } from '../utils.js';
import { CONFIG } from '../config/config.js';

export class DirectApiService {
  constructor() {
    this.baseUrl = 'https://www.gsmarena.com';
    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent': CONFIG.USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
        'Referer': 'https://www.gsmarena.com/'
      }
    });
  }

  /**
   * Helper function to add delay between requests
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after the delay
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get all available brands from GSM Arena
   * @returns {Promise<Array>} - Array of brand objects
   */
  async getAllBrands() {
    try {
      logProgress('Getting available brands...', 'info');
      
      const response = await this.apiClient.get('/makers.php3');
      
      // Extract brands from HTML response
      const html = response.data;
      
      // Use regex to extract brand data
      const brandRegex = /<a href="([^"]+)"[^>]*><img src="([^"]+)"[^>]*><br>([^<]+)<\/a>/g;
      const brands = [];
      let match;
      
      while ((match = brandRegex.exec(html)) !== null) {
        const url = this.baseUrl + '/' + match[1];
        const logoUrl = this.baseUrl + '/' + match[2];
        const name = match[3].trim();
        
        brands.push({
          name,
          url,
          logo_url: logoUrl,
          persian_name: name,
          is_active: true
        });
      }
      
      logProgress(`Found ${brands.length} brands`, 'success');
      return brands;
    } catch (error) {
      logProgress(`Error getting available brands: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Search for devices by brand name
   * @param {string} brandName - Brand name to search for
   * @param {Object} options - Search options
   * @returns {Promise<Array>} - Array of device objects
   */
  async searchDevicesByBrand(brandName, options = {}) {
    try {
      logProgress(`Searching for devices by brand: ${brandName}`, 'info');
      
      // Add random delay to avoid detection
      const randomDelay = Math.floor(Math.random() * 2000) + 1000;
      await this.delay(randomDelay);
      
      // Use the search API
      const searchUrl = `/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(brandName)}`;
      const response = await this.apiClient.get(searchUrl);
      
      // Extract devices from HTML response
      const html = response.data;
      
      // Log the response for debugging
      logProgress(`Search response length: ${html.length}`, 'debug');
      
      // Use regex to extract device data
      const deviceRegex = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
      const devices = [];
      let match;
      
      while ((match = deviceRegex.exec(html)) !== null) {
        const url = match[1].startsWith('http') ? match[1] : this.baseUrl + '/' + match[1];
        const name = match[2].trim();
        
        // Skip non-device links
        if (!url.includes('php') || url.includes('glossary') || url.includes('makers')) {
          continue;
        }
        
        // Extract year if available
        const yearMatch = name.match(/\b(20\d{2})\b/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
        
        // Apply minYear filter if specified
        if (options.minYear && year && year < options.minYear) {
          continue;
        }
        
        // Apply keyword exclusion if specified
        if (options.excludeKeywords && options.excludeKeywords.length > 0) {
          const shouldExclude = options.excludeKeywords.some(keyword => 
            name.toLowerCase().includes(keyword.toLowerCase())
          );
          
          if (shouldExclude) {
            continue;
          }
        }
        
        devices.push({
          name,
          url,
          year,
          persian_name: name
        });
      }
      
      logProgress(`Found ${devices.length} devices for brand ${brandName}`, 'success');
      return devices;
    } catch (error) {
      logProgress(`Error searching devices by brand: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Get device specifications
   * @param {Object} device - Device object with URL
   * @returns {Promise<Object>} - Device specifications
   */
  async getDeviceSpecifications(device) {
    try {
      logProgress(`Getting specifications for device: ${device.name}`, 'info');
      
      // Add random delay to avoid detection
      const randomDelay = Math.floor(Math.random() * 2000) + 1000;
      await this.delay(randomDelay);
      
      // Get the device page
      const deviceUrl = device.url.startsWith('http') ? device.url : this.baseUrl + '/' + device.url;
      const response = await this.apiClient.get(deviceUrl);
      
      // Extract specifications from HTML response
      const html = response.data;
      
      // Extract image URL
      const imageMatch = html.match(/<img src="([^"]+)" alt="[^"]+" class="specs-photo-main"/);
      const imageUrl = imageMatch ? (imageMatch[1].startsWith('http') ? imageMatch[1] : this.baseUrl + '/' + imageMatch[1]) : null;
      
      // Extract specifications
      const specSections = {};
      
      // Use regex to extract specification sections
      const sectionRegex = /<th rowspan="\d+"[^>]*>([^<]+)<\/th>[\s\S]+?<td class="ttl">([^<]+)<\/td>[\s\S]+?<td class="nfo">([^<]+)<\/td>/g;
      let sectionMatch;
      
      while ((sectionMatch = sectionRegex.exec(html)) !== null) {
        const sectionName = sectionMatch[1].trim();
        const specName = sectionMatch[2].trim();
        const specValue = sectionMatch[3].trim();
        
        if (!specSections[sectionName]) {
          specSections[sectionName] = {};
        }
        
        specSections[sectionName][specName] = specValue;
      }
      
      // Extract RAM, storage, and color options
      const ramOptions = [];
      const storageOptions = [];
      const colorOptions = [];
      
      // Look for RAM in the specifications
      if (specSections.Memory && specSections.Memory.RAM) {
        const ramText = specSections.Memory.RAM;
        const ramMatches = ramText.match(/\b\d+GB\b/g);
        
        if (ramMatches) {
          ramMatches.forEach(ram => {
            if (!ramOptions.includes(ram)) {
              ramOptions.push(ram);
            }
          });
        }
      }
      
      // Look for storage in the specifications
      if (specSections.Memory && specSections.Memory.Internal) {
        const storageText = specSections.Memory.Internal;
        const storageMatches = storageText.match(/\b\d+GB\b|\b\d+TB\b/g);
        
        if (storageMatches) {
          storageMatches.forEach(storage => {
            if (!storageOptions.includes(storage)) {
              storageOptions.push(storage);
            }
          });
        }
      }
      
      // Look for colors in the specifications
      if (specSections.Misc && specSections.Misc.Colors) {
        const colorText = specSections.Misc.Colors;
        const colors = colorText.split(',').map(color => color.trim());
        
        colors.forEach(color => {
          if (!colorOptions.includes(color)) {
            colorOptions.push(color);
          }
        });
      }
      
      return {
        specifications: specSections,
        image_url: imageUrl,
        ram_options: ramOptions,
        storage_options: storageOptions,
        color_options: colorOptions
      };
    } catch (error) {
      logProgress(`Error getting device specifications: ${error.message}`, 'error');
      return {
        specifications: {},
        image_url: null,
        ram_options: [],
        storage_options: [],
        color_options: []
      };
    }
  }

  /**
   * Scrape a specific brand
   * @param {Object} brand - Brand object
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} - Brand data with models
   */
  async scrapeBrand(brand, options = {}) {
    try {
      logProgress(`Scraping brand: ${brand.name}`, 'info');
      
      // Get devices for the brand
      const models = await this.searchDevicesByBrand(brand.name, {
        minYear: options.minYear,
        excludeKeywords: CONFIG.EXCLUDE_KEYWORDS
      });
      
      return {
        ...brand,
        models,
        is_active: true
      };
    } catch (error) {
      logProgress(`Error scraping brand ${brand.name}: ${error.message}`, 'error');
      return {
        ...brand,
        models: [],
        is_active: false,
        error: error.message
      };
    }
  }

  /**
   * Scrape multiple brands
   * @param {Array} brands - Array of brand objects
   * @param {Object} options - Scraping options
   * @returns {Promise<Array>} - Array of brand data with models
   */
  async scrapeBrands(brands, options = {}) {
    const results = [];
    
    for (const brand of brands) {
      const brandData = await this.scrapeBrand(brand, options);
      results.push(brandData);
      
      // Add delay between brand scraping
      await this.delay(CONFIG.DELAYS.between_brands || 5000);
    }
    
    return results;
  }
}

// Export is handled by the ES module syntax at the top of the file