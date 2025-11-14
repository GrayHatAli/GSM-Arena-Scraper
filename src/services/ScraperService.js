/**
 * ScraperService.js
 * A service that uses direct HTTP requests to scrape GSM Arena data
 */

import axios from 'axios';
import { logProgress } from '../utils.js';
import { CONFIG } from '../config/config.js';

export class ScraperService {
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
   * Extract year from "Announced" field
   * @param {string} announced - Announced field value
   * @returns {number|null} - Extracted year or null
   */
  extractYearFromAnnounced(announced) {
    if (!announced) return null;
    
    // Look for 4-digit year patterns
    const yearMatch = announced.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      return parseInt(yearMatch[1], 10);
    }
    
    return null;
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
      
      const brands = [];
      const seenUrls = new Set();
      
      // Pattern 1: Extract from table structure (current GSM Arena format)
      // Matches: <td><a href="brand-phones-N.php">BrandName<br><span>N devices</span></a></td>
      const tablePattern = /<td><a[^>]*href="([^"]*-phones-\d+\.php)"[^>]*>([^<]+)<br>/gi;
      let tableMatch;
      
      while ((tableMatch = tablePattern.exec(html)) !== null) {
        const href = tableMatch[1];
        let name = tableMatch[2] ? tableMatch[2].trim() : '';
        
        // Skip if already processed
        if (seenUrls.has(href)) {
          continue;
        }
        
        // Validate URL pattern
        const brandUrlMatch = href.match(/([a-z0-9]+)-phones-\d+\.php/i);
        if (!brandUrlMatch || !brandUrlMatch[1]) {
          continue;
        }
        
        // Extract brand name from URL as fallback
        const brandNameFromUrl = brandUrlMatch[1].toLowerCase();
        
        // Clean up the name
        if (name) {
          name = name.replace(/\s+/g, ' ').trim();
          name = name.replace(/<[^>]+>/g, '').trim(); // Remove any HTML tags
          name = name.replace(/&[a-z]+;/gi, '').trim(); // Remove HTML entities
        }
        
        // Use URL-based name if extracted name is invalid
        if (!name || name.length < 2) {
          name = brandNameFromUrl;
        } else {
          // Use the extracted name but normalize it
          name = name.toLowerCase();
        }
        
        // Skip invalid names
        const invalidNames = ['object', 'function', 'undefined', 'null', 'true', 'false', 'this', 'var', 'let', 'const'];
        if (invalidNames.includes(name) || name.length < 2) {
          continue;
        }
        
        // Format URL
        let url = href.startsWith('http') ? href : this.baseUrl + '/' + href.replace(/^\/+/, '');
        url = url.replace(/([^:]\/)\/+/g, '$1'); // Fix double slashes
        
        if (!url || url === this.baseUrl + '/' || url.endsWith('//')) {
          continue;
        }
        
        brands.push({
          name: name.toLowerCase(),
          url,
          logo_url: '', // No logo in table structure
          is_active: true
        });
        
        seenUrls.add(href);
      }
      
      // Pattern 2: Fallback - extract all brand URLs from the page
      if (brands.length === 0) {
        logProgress('No brands found in table structure, trying direct URL extraction...', 'info');
        const urlPattern = /href="([^"]*-phones-\d+\.php)"/gi;
        let urlMatch;
        
        while ((urlMatch = urlPattern.exec(html)) !== null) {
          const href = urlMatch[1];
          
          if (seenUrls.has(href)) {
            continue;
          }
          
          const brandMatch = href.match(/([a-z0-9]+)-phones-\d+\.php/i);
          if (!brandMatch || !brandMatch[1]) {
            continue;
          }
          
          const brandName = brandMatch[1].toLowerCase();
          
          // Skip invalid names
          const invalidNames = ['object', 'function', 'undefined', 'null', 'true', 'false', 'this', 'var', 'let', 'const'];
          if (invalidNames.includes(brandName) || brandName.length < 2) {
            continue;
          }
          
          // Skip non-brand links
          if (href.includes('glossary') || 
              href.includes('news') || 
              href.includes('reviews') ||
              href.includes('videos') ||
              href.includes('deals') ||
              href.includes('contact') ||
              href.includes('coverage') ||
              href.includes('search') ||
              href.includes('phone-finder') ||
              href.includes('network-bands') ||
              href === '/' ||
              href === '') {
            continue;
          }
          
          // Format URL
          let url = href.startsWith('http') ? href : this.baseUrl + '/' + href.replace(/^\/+/, '');
          url = url.replace(/([^:]\/)\/+/g, '$1');
          
          if (!url || url === this.baseUrl + '/' || url.endsWith('//')) {
            continue;
          }
          
          brands.push({
            name: brandName,
            url,
            logo_url: '', // No logo available
            is_active: true
          });
          
          seenUrls.add(href);
        }
      }
      
      // Remove duplicates based on URL
      const uniqueBrands = [];
      const seenBrandUrls = new Set();
      
      for (const brand of brands) {
        if (!seenBrandUrls.has(brand.url)) {
          seenBrandUrls.add(brand.url);
          uniqueBrands.push(brand);
        }
      }
      
      logProgress(`Found ${uniqueBrands.length} brands`, 'success');
      return uniqueBrands;
    } catch (error) {
      logProgress(`Error getting available brands: ${error.message}`, 'error');
      console.error('Full error:', error);
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
      
      // Try multiple search approaches
      const searchUrls = [
        `/${brandName}-phones-48.php`,  // Direct brand page (most reliable)
        `/${brandName}-phones-f-0-0-p1.php`,  // Alternative format
        `/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(brandName)}`,
        `/results.php3?sQuickSearch=${encodeURIComponent(brandName)}`
      ];
      
      let devices = [];
      
      for (const searchUrl of searchUrls) {
        try {
          logProgress(`Trying search URL: ${searchUrl}`, 'info');
          const response = await this.apiClient.get(searchUrl);
          const html = response.data;
          
          // Log the response for debugging
          logProgress(`Search response length: ${html.length}`, 'info');
          
          // Try multiple regex patterns to extract device data
          const devicePatterns = [
            // Pattern 1: Device links with images (most specific for GSM Arena)
            /<a href="([^"]+)"[^>]*><img[^>]*><strong><span>([^<]+)<\/span><\/strong><\/a>/g,
            // Pattern 2: Device links in li elements
            /<li><a href="([^"]+)"[^>]*><img[^>]*><strong><span>([^<]+)<\/span><\/strong><\/a><\/li>/g,
            // Pattern 3: General device links with images
            /<a href="([^"]+)"[^>]*><img[^>]*><br>([^<]+)<\/a>/g,
            // Pattern 4: Links in makers section
            /<a href="([^"]+)"[^>]*class="[^"]*makers[^"]*"[^>]*>([^<]+)<\/a>/g,
            // Pattern 5: Device links in specific containers
            /<a href="([^"]+)"[^>]*class="[^"]*phone[^"]*"[^>]*>([^<]+)<\/a>/g
          ];
          
          for (const pattern of devicePatterns) {
            let match;
            const tempDevices = [];
            
            while ((match = pattern.exec(html)) !== null) {
              const url = match[1].startsWith('http') ? match[1] : this.baseUrl + '/' + match[1];
              const name = match[2].trim();
              
              // Skip non-device links
              if (!url.includes('.php') || 
                  url.includes('glossary') || 
                  url.includes('makers') ||
                  url.includes('news') ||
                  url.includes('reviews') ||
                  url.includes('videos') ||
                  url.includes('deals') ||
                  url.includes('contact') ||
                  url.includes('coverage') ||
                  url.includes('search') ||
                  url.includes('phone-finder') ||
                  url.includes('network-bands') ||
                  name.length < 3 ||
                  name.toLowerCase().includes('videos') ||
                  name.toLowerCase().includes('deals') ||
                  name.toLowerCase().includes('contact') ||
                  name.toLowerCase().includes('coverage') ||
                  name.toLowerCase().includes('phone finder') ||
                  name.toLowerCase().includes('search')) {
                continue;
              }
              
              // Extract year if available (look for patterns like "2025", "2024", etc.)
              const yearMatch = name.match(/\b(20\d{2})\b/);
              const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
              
              // Also try to extract year from URL if not found in name
              let extractedYear = year;
              if (!extractedYear) {
                const urlYearMatch = url.match(/\b(20\d{2})\b/);
                extractedYear = urlYearMatch ? parseInt(urlYearMatch[1], 10) : null;
              }
              
              // For iPhone models without explicit year, infer from model number
              if (!extractedYear && name.toLowerCase().includes('iphone')) {
                const iphoneMatch = name.match(/iPhone\s+(\d+)/i);
                if (iphoneMatch) {
                  const iphoneNumber = parseInt(iphoneMatch[1]);
                  // iPhone 17 = 2025, iPhone 16 = 2024, iPhone 15 = 2023, etc.
                  extractedYear = 2007 + iphoneNumber;
                }
              }
              
              // Note: minYear filter will be applied later after getting specifications
              
              // Apply keyword exclusion if specified
              if (options.excludeKeywords && options.excludeKeywords.length > 0) {
                const shouldExclude = options.excludeKeywords.some(keyword => 
                  name.toLowerCase().includes(keyword.toLowerCase())
                );
                
                if (shouldExclude) {
                  continue;
                }
              }
              
              // Filter out non-phone devices (tablets, watches, accessories, etc.)
              const nameLower = name.toLowerCase();
              const nonPhoneKeywords = [
                'ipad',
                'watch',
                'airpods',
                'mac',
                'macbook',
                'imac',
                'mac mini',
                'mac pro',
                'apple tv',
                'homepod',
                'airtag',
                'tablet',
                'smartwatch',
                'smart watch',
                'earbuds',
                'headphones',
                'speaker',
                'accessory',
                'charger',
                'case',
                'cover'
              ];
              
              const isNonPhone = nonPhoneKeywords.some(keyword => nameLower.includes(keyword));
              if (isNonPhone) {
                continue;
              }
              
              tempDevices.push({
                name,
                url,
                year: extractedYear
              });
            }
            
            // If we found devices with this pattern, use them
            if (tempDevices.length > 0) {
              devices = [...devices, ...tempDevices];
              break; // Stop trying other patterns for this URL
            }
          }
          
          // If we found devices, stop trying other URLs
          if (devices.length > 0) {
            break;
          }
          
        } catch (urlError) {
          logProgress(`Error with search URL ${searchUrl}: ${urlError.message}`, 'warn');
          continue;
        }
      }
      
      // Remove duplicates based on name
      const uniqueDevices = [];
      const seenNames = new Set();
      
      for (const device of devices) {
        if (!seenNames.has(device.name)) {
          seenNames.add(device.name);
          uniqueDevices.push(device);
        }
      }
      
      logProgress(`Found ${uniqueDevices.length} unique devices for brand ${brandName}`, 'success');
      return uniqueDevices;
    } catch (error) {
      logProgress(`Error searching devices by brand: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Get device specifications
   * @param {Object} device - Device object with URL
   * @param {Object} options - Options including minYear filter
   * @returns {Promise<Object>} - Device specifications
   */
  async getDeviceSpecifications(device, options = {}) {
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
      
      // Try multiple approaches to extract specifications
      const specPatterns = [
        // Pattern 1: GSM Arena standard format with ttl and nfo classes
        /<td class="ttl">([^<]+)<\/td>\s*<td class="nfo"[^>]*>([^<]+)<\/td>/g,
        // Pattern 2: Alternative format with links
        /<td class="ttl"><a[^>]*>([^<]+)<\/a><\/td>\s*<td class="nfo"[^>]*>([^<]+)<\/td>/g,
        // Pattern 3: Format with nested links in nfo
        /<td class="ttl">([^<]+)<\/td>\s*<td class="nfo"[^>]*><a[^>]*>([^<]+)<\/a><\/td>/g,
        // Pattern 4: Simple table rows without classes
        /<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<\/tr>/g
      ];
      
      for (const pattern of specPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const specName = match[1].trim();
          const specValue = match[2].trim();
          
          if (specName && specValue && specName !== '&nbsp;' && specValue !== '&nbsp;') {
            // Clean up the specification name and value
            const cleanName = specName.replace(/&nbsp;/g, '').trim();
            const cleanValue = specValue.replace(/&nbsp;/g, '').trim();
            
            if (cleanName && cleanValue) {
              specSections[cleanName] = cleanValue;
            }
          }
        }
      }
      
      // Post-process specifications to fix naming and remove unwanted entries
      const processedSpecs = {};
      for (const [key, value] of Object.entries(specSections)) {
        // Skip endurance entries (they're not useful)
        if (key.toLowerCase().includes('endurance') || value.toLowerCase().includes('endurance')) {
          continue;
        }
        
        // Handle battery-related entries
        if (key.toLowerCase() === 'type' && value.toLowerCase().includes('mah')) {
          // This is battery type, rename to "Battery"
          processedSpecs['Battery'] = value;
        } else if (key.toLowerCase() === 'energy' && value.toLowerCase().includes('mah')) {
          // This is also battery-related, rename to "Battery"
          processedSpecs['Battery'] = value;
        } else if (key.toLowerCase() === 'type' && !value.toLowerCase().includes('mah')) {
          // This is display type, keep as "Display Type"
          processedSpecs['Display Type'] = value;
        } else if (key.toLowerCase() === 'energy' && !value.toLowerCase().includes('mah')) {
          // This is energy efficiency rating, skip it
          continue;
        } else {
          processedSpecs[key] = value;
        }
      }
      
      // Extract RAM, storage, and color options from specifications
      const ramOptions = [];
      const storageOptions = [];
      const colorOptions = [];
      
        // Look for RAM in the specifications
        for (const [key, value] of Object.entries(processedSpecs)) {
          if (key.toLowerCase().includes('ram') || key.toLowerCase().includes('memory') || key.toLowerCase().includes('internal')) {
            const ramMatches = value.match(/\b(\d+)\s*GB\s*RAM\b/gi);
            if (ramMatches) {
              ramMatches.forEach(ram => {
                const ramValue = ram.replace(/\D/g, '');
                if (ramValue && !ramOptions.includes(ramValue)) {
                  ramOptions.push(ramValue);
                }
              });
            }
          }
        
        // Look for storage (exclude RAM patterns)
        if (key.toLowerCase().includes('internal') || key.toLowerCase().includes('storage')) {
          // First remove RAM patterns to avoid confusion
          const valueWithoutRAM = value.replace(/\b(\d+)\s*GB\s*RAM\b/gi, '');
          const storageMatches = valueWithoutRAM.match(/\b(\d+)\s*(GB|TB)\b/gi);
          if (storageMatches) {
            storageMatches.forEach(storage => {
              // Additional filter to exclude common RAM sizes from storage
              const size = storage.replace(/\D/g, '');
              if (size && !['4', '6', '8', '12', '16'].includes(size) && !storageOptions.includes(storage)) {
                storageOptions.push(storage);
              }
            });
          }
        }
        
        // Look for colors
        if (key.toLowerCase().includes('color')) {
          const colors = value.split(',').map(color => color.trim());
          colors.forEach(color => {
            if (color && !colorOptions.includes(color)) {
              colorOptions.push(color);
            }
          });
        }
      }
      
      // Apply minYear filter based on "Announced" field
      if (options.minYear && processedSpecs['Announced']) {
        const announcedYear = this.extractYearFromAnnounced(processedSpecs['Announced']);
        if (announcedYear && announcedYear < options.minYear) {
          logProgress(`Device ${device.name} announced in ${announcedYear}, filtered out by minYear ${options.minYear}`, 'info');
          return null; // Return null to indicate this device should be filtered out
        }
      }
      
      return {
        specifications: processedSpecs,
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
      const devices = await this.searchDevicesByBrand(brand.name, {
        minYear: options.minYear,
        excludeKeywords: CONFIG.EXCLUDE_KEYWORDS
      });
      
      // Convert devices to models with detailed specifications
      const models = [];
      const modelsPerBrand = options.modelsPerBrand || devices.length;
      const devicesToProcess = devices.slice(0, modelsPerBrand);
      
      for (const device of devicesToProcess) {
        try {
          logProgress(`  Getting details for: ${device.name}`, 'info');
          
          const deviceSpecs = await this.getDeviceSpecifications(device, options);
          
          // Skip device if it was filtered out by minYear
          if (deviceSpecs === null) {
            logProgress(`  Skipping device ${device.name} due to minYear filter`, 'info');
            continue;
          }
          
          models.push({
            brand_name: brand.name,
            model_name: device.name,
            series: device.name.split(' ')[0],
            ram_options: deviceSpecs.ram_options || [6, 8],
            storage_options: deviceSpecs.storage_options || [128, 256],
            color_options: deviceSpecs.color_options.length > 0 ? 
              deviceSpecs.color_options :
              ['Black', 'White'],
            specifications: deviceSpecs.specifications || {},
            release_date: device.year ? `${device.year}-01-01` : '2023-01-01',
            image_url: deviceSpecs.image_url,
            is_active: true
          });
          
          // Add delay between device processing
          await this.delay(CONFIG.DELAYS.between_requests || 1000);
        } catch (error) {
          logProgress(`  Error processing device ${device.name}: ${error.message}`, 'error');
          // Add fallback model data
          models.push({
            brand_name: brand.name,
            model_name: device.name,
            series: device.name.split(' ')[0],
            ram_options: [6, 8],
            storage_options: [128, 256],
            color_options: ['Black', 'White'],
            specifications: {},
            release_date: device.year ? `${device.year}-01-01` : '2023-01-01',
            image_url: null,
            is_active: true
          });
        }
      }
      
      return {
        name: brand.name,
        logo_url: brand.logo_url || `${this.baseUrl}/img/logo_${brand.name}.png`,
        is_active: true,
        models: models
      };
    } catch (error) {
      logProgress(`Error scraping brand ${brand.name}: ${error.message}`, 'error');
      return {
        name: brand.name,
        logo_url: brand.logo_url || `${this.baseUrl}/img/logo_${brand.name}.png`,
        models: [],
        is_active: false,
        error: error.message
      };
    }
  }

  /**
   * Scrape multiple brands
   * @param {Array} brands - Array of brand names or brand objects
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} - Scraping result with brands and models
   */
  async scrapeBrands(brands, options = {}) {
    try {
      logProgress(`Starting to scrape ${brands.length} brands`, 'info');
      
      const results = [];
      let totalModels = 0;
      
      for (const brand of brands) {
        let brandObj;
        
        // Handle both string brand names and brand objects
        if (typeof brand === 'string') {
          brandObj = {
            name: brand,
            url: `${this.baseUrl}/${brand}-phones-48.php`,
            is_active: true
          };
        } else {
          brandObj = brand;
        }
        
        logProgress(`Processing brand: ${brandObj.name}`, 'info');
        
        const brandData = await this.scrapeBrand(brandObj, options);
        results.push(brandData);
        totalModels += brandData.models ? brandData.models.length : 0;
        
        // Add delay between brand scraping
        await this.delay(CONFIG.DELAYS.between_brands || 3000);
      }
      
      return {
        brands: results,
        scraped_at: new Date().toISOString(),
        total_brands: results.length,
        total_models: totalModels,
        options: options
      };
    } catch (error) {
      logProgress(`Error in scrapeBrands: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get devices by brand name (alias for searchDevicesByBrand)
   * @param {string} brandName - Brand name
   * @returns {Promise<Array>} - List of devices for the brand
   */
  async getDevicesByBrand(brandName) {
    return this.searchDevicesByBrand(brandName);
  }

  /**
   * Get device specifications by device ID
   * @param {string} deviceId - Device ID
   * @returns {Promise<Object>} - Device specifications
   */
  async getDeviceSpecificationsById(deviceId) {
    // This method expects a device ID, but we need to construct the device object
    const device = {
      name: `Device ${deviceId}`,
      url: `${this.baseUrl}/device-${deviceId}.php`
    };
    
    return this.getDeviceSpecifications(device, {});
  }

  /**
   * Find devices by keyword
   * @param {string} keyword - Search keyword
   * @returns {Promise<Array>} - List of matching devices
   */
  async findDevicesByKeyword(keyword) {
    return this.searchDevicesByBrand(keyword);
  }

  /**
   * Get available brands from GSM Arena
   * @returns {Array} - Available brands
   */
  async getAvailableBrands() {
    return this.getAllBrands();
  }

  /**
   * Test scraping with single brand
   * @param {string} brandName - Brand name to test
   * @returns {Object} - Test result
   */
  async testScraping(brandName = 'apple') {
    const options = {
      modelsPerBrand: 3,
      minYear: undefined // No year filtering for test
    };

    const result = await this.scrapeBrands([brandName], options);
    
    return {
      brand: result.brands[0] || null,
      scraped_at: result.scraped_at,
      total_models: result.total_models,
      test_mode: true
    };
  }

  /**
   * Get current scraping status
   * @returns {Object} - Current status
   */
  async getStatus() {
    return {
      status: 'ready',
      isRunning: false,
      hasBrowser: false,
      timestamp: new Date().toISOString()
    };
  }
}

// Export is handled by the ES module syntax at the top of the file