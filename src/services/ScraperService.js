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
      const brandDataMap = new Map(); // Store href -> {name, url} mapping for deduplication
      const brandNameMap = new Map(); // Store href -> extracted name from HTML
      
      // Step 1: Extract brand names from table structure (if available)
      // Matches: <td><a href="brand-phones-N.php">BrandName<br><span>N devices</span></a></td>
        // Also matches: <td><a href=brand-phones-N.php>BrandName<br><span>N devices</span></a></td>
      const tablePatterns = [
        /<td><a[^>]*href="([^"]*-phones-\d+\.php)"[^>]*>([^<\n\r]+?)(?:<br|<span|<\/a>)/gi,  // With quotes
        /<td><a[^>]*href=([a-z0-9_&]+-phones-\d+\.php)[^>]*>([^<\n\r]+?)(?:<br|<span|<\/a>)/gi  // Without quotes (allow & and _)
      ];
      
      for (const tablePatternWithName of tablePatterns) {
        let tableMatch;
        tablePatternWithName.lastIndex = 0; // Reset regex
        while ((tableMatch = tablePatternWithName.exec(html)) !== null) {
          const href = tableMatch[1];
          let name = tableMatch[2] ? tableMatch[2].trim() : '';
        
        // Validate URL pattern (allow &, _, and - in brand names)
        const brandUrlMatch = href.match(/([a-z0-9_&]+)-phones-\d+\.php/i);
        if (!brandUrlMatch || !brandUrlMatch[1]) {
          continue;
        }
        
        // Clean up the name
        if (name) {
          name = name.replace(/\s+/g, ' ').trim();
          name = name.replace(/<[^>]+>/g, '').trim(); // Remove any HTML tags
          name = name.replace(/&[a-z]+;/gi, '').trim(); // Remove HTML entities
          name = name.toLowerCase();
        }
        
        // Store name if valid
        if (name && name.length >= 2) {
          const invalidNames = ['object', 'function', 'undefined', 'null', 'true', 'false', 'this', 'var', 'let', 'const'];
          if (!invalidNames.includes(name)) {
            brandNameMap.set(href, name);
          }
        }
        }
      }
      
      // Step 2: Extract ALL brand URLs from the page (comprehensive extraction)
      // This is the primary method to ensure we get all 125 brands
      // Match both href="..." and href=... (with or without quotes)
      // Brand names can contain letters, numbers, &, _, and -
      const urlPatterns = [
        /href="([^"]*-phones-\d+\.php)"/gi,  // With quotes
        /href=([a-z0-9_&]+-phones-\d+\.php)(?:\s|>)/gi  // Without quotes (allow & and _)
      ];
      const allUrls = new Set();
      
      // First pass: collect all unique URLs from both patterns
      for (const pattern of urlPatterns) {
        let urlMatch;
        pattern.lastIndex = 0; // Reset regex
        while ((urlMatch = pattern.exec(html)) !== null) {
          const href = urlMatch[1];
          allUrls.add(href);
        }
      }
      
      // Second pass: process all URLs
      for (const href of allUrls) {
        // Validate URL pattern (allow &, _, and - in brand names)
        const brandMatch = href.match(/([a-z0-9_&]+)-phones-\d+\.php/i);
        if (!brandMatch || !brandMatch[1]) {
          continue;
        }
        
        // Clean brand name: replace & with 'and', _ with '-', normalize
        let brandNameFromUrl = brandMatch[1].toLowerCase();
        brandNameFromUrl = brandNameFromUrl.replace(/&/g, 'and').replace(/_/g, '-');
        
        // Skip invalid names
        const invalidNames = ['object', 'function', 'undefined', 'null', 'true', 'false', 'this', 'var', 'let', 'const'];
        if (invalidNames.includes(brandNameFromUrl) || brandNameFromUrl.length < 2) {
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
        
        // Use extracted name from HTML if available, otherwise use URL-based name
        const finalName = brandNameMap.get(href) || brandNameFromUrl;
        
        // Add to map (deduplication by href)
        brandDataMap.set(href, {
          name: finalName,
          url,
          logo_url: '',
          is_active: true
        });
      }
      
      // Convert map to array (already deduplicated by Map)
      brands.push(...Array.from(brandDataMap.values()));
      
      // Sort brands alphabetically by name (A to Z)
      brands.sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      });
      
      logProgress(`Found ${brands.length} brands`, 'success');
      return brands;
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
            /<a href="([^"]+)"[^>]*class="[^"]*phone[^"]*"[^>]*>([^<]+)<\/a>/g,
            // Pattern 6: More flexible pattern for device links
            /<a\s+href="([^"]+)"[^>]*>\s*<img[^>]*>\s*<strong>([^<]+)<\/strong>/gi,
            // Pattern 7: Pattern for div-based device listings
            /<div[^>]*>\s*<a\s+href="([^"]+)"[^>]*>\s*<img[^>]*>\s*([^<]+)<\/a>/gi,
            // Pattern 8: Generic pattern for any link containing device name patterns
            /<a\s+href="([^"]+-[^"]+\.php)"[^>]*>([^<]*iPhone[^<]*|[^<]*Galaxy[^<]*|[^<]*Pixel[^<]*|[^<]*Xiaomi[^<]*|[^<]*Huawei[^<]*)/gi
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
              
              // Apply minYear filter early if year is available
              if (options.minYear && extractedYear && extractedYear < options.minYear) {
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
      
      // Merge excludeKeywords from options with CONFIG defaults (remove duplicates)
      const excludeKeywords = [
        ...new Set([
          ...(CONFIG.EXCLUDE_KEYWORDS || []),
          ...(options.excludeKeywords || [])
        ])
      ];
      
      // Get devices for the brand
      const devices = await this.searchDevicesByBrand(brand.name, {
        minYear: options.minYear,
        excludeKeywords: excludeKeywords
      });
      
      logProgress(`Found ${devices.length} devices for brand ${brand.name}`, 'info');
      
      if (devices.length === 0) {
        logProgress(`No devices found for brand ${brand.name}. This might be due to filters or parsing issues.`, 'warn');
        return {
          name: brand.name,
          logo_url: brand.logo_url || `${this.baseUrl}/img/logo_${brand.name}.png`,
          is_active: true,
          models: []
        };
      }
      
      // Convert devices to models with detailed specifications
      const models = [];
      const modelsPerBrand = options.modelsPerBrand || devices.length;
      const devicesToProcess = devices.slice(0, modelsPerBrand);
      
      logProgress(`Processing ${devicesToProcess.length} devices (limited by modelsPerBrand: ${modelsPerBrand})`, 'info');
      
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
   * @param {Array} brands - Array of brand names or brand objects (empty array scrapes all brands)
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} - Scraping result with brands and models
   */
  async scrapeBrands(brands, options = {}) {
    try {
      // If brands array is empty, get all available brands
      let brandsToScrape = brands;
      if (!brands || brands.length === 0) {
        logProgress('No brands specified, fetching all available brands...', 'info');
        const allBrands = await this.getAllBrands();
        brandsToScrape = allBrands;
        logProgress(`Found ${allBrands.length} brands to scrape`, 'info');
      }
      
      logProgress(`Starting to scrape ${brandsToScrape.length} brands`, 'info');
      
      const results = [];
      let totalModels = 0;
      
      for (const brand of brandsToScrape) {
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
   * Extract device ID from URL
   * @param {string} url - Device URL
   * @returns {string|null} - Device ID or null
   */
  extractDeviceIdFromUrl(url) {
    if (!url) return null;
    
    // Try to extract device ID from various URL patterns
    // Pattern 1: device-12345.php
    let match = url.match(/device-(\d+)\.php/);
    if (match) return match[1];
    
    // Pattern 2: brand_model-12345.php
    match = url.match(/-(\d+)\.php$/);
    if (match) return match[1];
    
    // Pattern 3: Extract from path segments
    const segments = url.split('/').filter(s => s);
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) {
      match = lastSegment.match(/-(\d+)\.php$/);
      if (match) return match[1];
    }
    
    // If no pattern matches, generate a hash from the URL
    // This is a fallback to ensure we always have a deviceId
    return Buffer.from(url).toString('base64').substring(0, 10).replace(/[^a-zA-Z0-9]/g, '');
  }

  /**
   * Search devices with filters
   * Supports brand_name, keyword, minYear, and excludeKeywords filters
   * Returns devices with deviceId in the response
   * @param {Object} filters - Search filters
   * @param {string} filters.keyword - Search keyword
   * @param {string} filters.brand_name - Filter by brand name
   * @param {number} filters.minYear - Minimum year filter
   * @param {Array} filters.excludeKeywords - Keywords to exclude
   * @returns {Promise<Array>} - List of devices with deviceId
   */
  async searchDevices(filters = {}) {
    try {
      const { keyword, brand_name, minYear, excludeKeywords } = filters;
      
      // Determine search term - prefer brand_name over keyword
      const searchTerm = brand_name || keyword;
      
      if (!searchTerm) {
        logProgress('No search term provided (keyword or brand_name required)', 'warn');
        return [];
      }
      
      // Get devices using the search term
      const options = {
        minYear: minYear || null,
        excludeKeywords: excludeKeywords || []
      };
      
      const devices = await this.searchDevicesByBrand(searchTerm, options);
      
      // Add deviceId to each device
      const devicesWithId = devices.map(device => {
        const deviceId = this.extractDeviceIdFromUrl(device.url);
        return {
          deviceId: deviceId || 'unknown',
          name: device.name,
          url: device.url,
          year: device.year,
          brand_name: brand_name || searchTerm
        };
      });
      
      // Apply additional filters if needed
      let filteredDevices = devicesWithId;
      
      // Filter by year if specified
      if (minYear) {
        filteredDevices = filteredDevices.filter(device => {
          return !device.year || device.year >= minYear;
        });
      }
      
      // Filter by excludeKeywords if specified
      if (excludeKeywords && excludeKeywords.length > 0) {
        filteredDevices = filteredDevices.filter(device => {
          const nameLower = device.name.toLowerCase();
          return !excludeKeywords.some(keyword => 
            nameLower.includes(keyword.toLowerCase())
          );
        });
      }
      
      logProgress(`Found ${filteredDevices.length} devices matching filters`, 'success');
      return filteredDevices;
    } catch (error) {
      logProgress(`Error searching devices: ${error.message}`, 'error');
      return [];
    }
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