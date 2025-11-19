/**
 * ScraperService.js
 * A service that uses direct HTTP requests to scrape GSM Arena data
 */

import axios from 'axios';
import { logProgress } from '../utils.js';
import { getCache, setCache, DEFAULT_TTL_SECONDS } from '../utils/cache.js';
import { CONFIG } from '../config/config.js';

const CACHE_TTL_SECONDS = DEFAULT_TTL_SECONDS;
const ALL_BRANDS_CACHE_KEY = 'brands:all:v1';

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
   * Make HTTP request with retry logic and exponential backoff
   * @param {Function} requestFn - Function that returns a promise for the HTTP request
   * @param {number} maxRetries - Maximum number of retries (default: 3)
   * @param {number} baseDelay - Base delay in milliseconds (default: 2000)
   * @returns {Promise} - Request result
   */
  async makeRequestWithRetry(requestFn, maxRetries = 3, baseDelay = 2000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 2s, 4s, 8s, etc.
          const delay = baseDelay * Math.pow(2, attempt - 1);
          logProgress(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay`, 'warning');
          await this.delay(delay);
        }
        
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        // Check if it's a rate limit error (429) or server error (5xx)
        const isRetryable = error.response?.status === 429 || 
                           (error.response?.status >= 500 && error.response?.status < 600) ||
                           error.code === 'ECONNRESET' ||
                           error.code === 'ETIMEDOUT';
        
        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }
        
        logProgress(`Request failed (${error.response?.status || error.code}), will retry...`, 'warning');
      }
    }
    
    throw lastError;
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
      const cachedBrands = await getCache(ALL_BRANDS_CACHE_KEY);
      if (cachedBrands) {
        logProgress('Retrieved available brands from cache', 'success');
        return cachedBrands;
      }

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
      await setCache(ALL_BRANDS_CACHE_KEY, brands, CACHE_TTL_SECONDS);
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
      const brandNameLower = brandName ? brandName.toLowerCase() : null;
      logProgress(`Searching for devices by brand: ${brandName}`, 'info');

      const searchCacheKey = this.buildDeviceSearchCacheKey(brandNameLower, options);
      const cachedDevices = await getCache(searchCacheKey);
      if (cachedDevices) {
        logProgress(`Cache hit for device search: ${brandName}`, 'success');
        return cachedDevices;
      }
      
      // Add random delay to avoid detection (increased to avoid rate limiting)
      const randomDelay = Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds
      await this.delay(randomDelay);
      
      // Try multiple search approaches
      const searchUrls = [];

      if (options.brandUrl) {
        const brandUrl = options.brandUrl.startsWith('http')
          ? options.brandUrl
          : `${this.baseUrl}/${options.brandUrl.replace(/^\/+/, '')}`;
        searchUrls.push(brandUrl.replace(this.baseUrl, '').replace(/^\/?/, '/'));
      }

      if (brandName) {
        searchUrls.push(
          `/${brandNameLower}-phones-48.php`,
          `/${brandNameLower}-phones-f-0-0-p1.php`,
          `/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(brandName)}`,
          `/results.php3?sQuickSearch=${encodeURIComponent(brandName)}`
        );
      }
      
      let devices = [];
      
      for (const searchUrl of searchUrls) {
        try {
          logProgress(`Trying search URL: ${searchUrl}`, 'info');
          // Use retry logic for rate limit errors
          const response = await this.makeRequestWithRetry(
            () => this.apiClient.get(searchUrl),
            3, // max retries
            3000 // base delay for retries (3s, 6s, 12s)
          );
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
                'pad',
                'tab',
                'matepad',
                'watch',
                'band',
                'airpods',
                'buds',
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

              if (brandNameLower) {
                const urlLower = url.toLowerCase();
                const brandMatchesUrl =
                  urlLower.includes(`-${brandNameLower}-`) ||
                  urlLower.includes(`_${brandNameLower}_`) ||
                  urlLower.includes(`/${brandNameLower}`) ||
                  urlLower.includes(`${brandNameLower}-phones`);
                const brandMatchesName = nameLower.includes(brandNameLower);
                if (!brandMatchesUrl && !brandMatchesName) {
                  continue;
                }
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
          
          // Add delay before trying next URL to avoid rate limiting
          await this.delay(1000);
          
        } catch (urlError) {
          logProgress(`Error with search URL ${searchUrl}: ${urlError.message}`, 'warn');
          // Add delay even on error before trying next URL
          await this.delay(1000);
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
      await setCache(searchCacheKey, uniqueDevices, CACHE_TTL_SECONDS);
      return uniqueDevices;
    } catch (error) {
      logProgress(`Error searching devices by brand: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Get device image URL (lightweight method, no full specifications)
   * @param {string} deviceUrl - Device URL
   * @returns {Promise<string|null>} - Image URL or null
   */
  async getDeviceImageUrl(deviceUrl) {
    try {
      const url = deviceUrl.startsWith('http') ? deviceUrl : this.baseUrl + '/' + deviceUrl;
      // Increased delay to avoid rate limiting
      await this.delay(2000);
      
      // Use retry logic for rate limit errors
      const response = await this.makeRequestWithRetry(
        () => this.apiClient.get(url),
        3, // max retries
        3000 // base delay for retries (3s, 6s, 12s)
      );
      const html = response.data;
      
      // CSS selector: #body > div > div.review-header > div > div.center-stage.light.nobg.specs-accent > div > a > img
      // We need to extract the exact src attribute from this specific img tag
      
      logProgress(`Extracting image URL from device page: ${url}`, 'info');
      
      // Strategy: Find center-stage div with all required classes, then find img inside <a> tag
      // CSS selector: div.center-stage.light.nobg.specs-accent > div > a > img
      
      // Find center-stage div with all required classes
      // The classes can be in any order, separated by spaces
      // We need to check each div individually to find the one with all required classes
      const divRegex = /<div[^>]*class="([^"]*)"[^>]*>/gi;
      let centerStageMatch = null;
      let centerStageIndex = -1;
      let match;
      
      while ((match = divRegex.exec(html)) !== null) {
        const classes = match[1].toLowerCase();
        // Check if it has all required classes: center-stage, light, nobg, specs-accent
        if (classes.includes('center-stage') && 
            classes.includes('light') && 
            classes.includes('nobg') && 
            classes.includes('specs-accent')) {
          centerStageMatch = match;
          centerStageIndex = match.index;
          logProgress(`Found center-stage div with all classes at index ${centerStageIndex}`, 'info');
          logProgress(`Classes: ${classes}`, 'debug');
          break;
        }
      }
      
      if (!centerStageMatch || centerStageIndex === -1) {
        logProgress('center-stage.light.nobg.specs-accent div not found', 'error');
        // Debug: check if center-stage exists at all
        if (html.includes('center-stage')) {
          logProgress('center-stage found but missing required classes', 'warn');
          // Try to find center-stage with any combination
          const anyCenterStage = html.match(/<div[^>]*class="[^"]*center-stage[^"]*"[^>]*>/i);
          if (anyCenterStage) {
            const classes = anyCenterStage[0].match(/class="([^"]*)"/i);
            logProgress(`Found center-stage but classes are: ${classes ? classes[1] : 'unknown'}`, 'debug');
          }
        } else {
          logProgress('center-stage class not found in HTML at all', 'error');
        }
        return null;
      }
      
      // Search in a larger area (5000 chars) to find the img tag
      // The structure is: <div class="center-stage..."> <div> <a> <img src="...">
      const searchArea = html.substring(centerStageIndex, Math.min(centerStageIndex + 5000, html.length));
      
      logProgress(`Searching in area of ${searchArea.length} chars after center-stage`, 'info');
      
      // Try multiple patterns to find the img tag
      // Pattern 1: <a> followed by <img src="...">
      let imgMatch = searchArea.match(/<a[^>]*>[\s\S]*?<img[^>]*src\s*=\s*["']?([^"'\s>]+)["']?[^>]*>/i);
      
      if (!imgMatch || !imgMatch[1]) {
        // Pattern 2: Any <img> tag in the search area (fallback)
        imgMatch = searchArea.match(/<img[^>]*src\s*=\s*["']?([^"'\s>]+)["']?[^>]*>/i);
      }
      
      if (!imgMatch || !imgMatch[1]) {
        logProgress('Image tag with src not found in center-stage structure', 'error');
        // Debug: try to find any img tag in the area
        const anyImg = searchArea.match(/<img[^>]*/i);
        if (anyImg) {
          logProgress(`Found img tag but no src attribute: ${anyImg[0].substring(0, 200)}`, 'debug');
        } else {
          logProgress('No img tag found in search area at all', 'debug');
          // Log a snippet for debugging
          const snippet = searchArea.substring(0, 1500).replace(/\s+/g, ' ');
          logProgress(`Search area snippet (first 1500 chars): ${snippet.substring(0, 800)}`, 'debug');
        }
        return null;
      }
      
      let imageUrl = imgMatch[1];
      logProgress(`Found image URL: ${imageUrl}`, 'info');
      
      // Clean up and normalize the URL
      imageUrl = imageUrl.replace(/&amp;/g, '&');
      
      // Convert relative URLs to absolute
      if (!imageUrl.startsWith('http')) {
        if (imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        } else if (imageUrl.startsWith('/')) {
          imageUrl = 'https://www.gsmarena.com' + imageUrl;
        } else {
          imageUrl = 'https://www.gsmarena.com/' + imageUrl;
        }
      }
      
      // Normalize to fdn2.gsmarena.com for images
      if (imageUrl.includes('www.gsmarena.com') && (imageUrl.includes('/bigpic/') || imageUrl.includes('/vv/'))) {
        imageUrl = imageUrl.replace('www.gsmarena.com', 'fdn2.gsmarena.com');
      }
      
      logProgress(`Final image URL: ${imageUrl}`, 'info');
      return imageUrl;
      
    } catch (error) {
      logProgress(`Error getting device image URL: ${error.message}`, 'error');
      logProgress(`Error stack: ${error.stack}`, 'error');
      return null;
    }
  }

  /**
   * Get device announced date (lightweight method)
   * @param {string} deviceUrl - Device URL
   * @returns {Promise<string|null>} - Announced date/year or null
   */
  async getDeviceAnnounced(deviceUrl) {
    try {
      const url = deviceUrl.startsWith('http') ? deviceUrl : this.baseUrl + '/' + deviceUrl;
      // Increased delay to avoid rate limiting
      await this.delay(2000);
      
      // Use retry logic for rate limit errors
      const response = await this.makeRequestWithRetry(
        () => this.apiClient.get(url),
        3, // max retries
        3000 // base delay for retries (3s, 6s, 12s)
      );
      const html = response.data;
      
      // Look for "Announced" field in the specifications table
      // GSM Arena uses various patterns for the specifications table
      const announcedPatterns = [
        // Pattern 1: Standard table row with class="ttl" and class="nfo"
        /<td[^>]*class="ttl"[^>]*>Announced<\/td>\s*<td[^>]*class="nfo"[^>]*>([^<]+)<\/td>/i,
        // Pattern 2: Table row without classes
        /<td[^>]*>Announced<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
        // Pattern 3: Table header and data
        /<th[^>]*>Announced<\/th>\s*<td[^>]*>([^<]+)<\/td>/i,
        // Pattern 4: More flexible pattern
        /<tr[^>]*>[\s\S]*?<td[^>]*>Announced<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<\/tr>/i,
        // Pattern 5: Simple text pattern
        /Announced[:\s]+([^<\n]+)/i
      ];
      
      for (const pattern of announcedPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          let announced = match[1].trim();
          
          // Clean up HTML entities and extra whitespace
          announced = announced.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
          
          // Remove any HTML tags that might be in the value
          announced = announced.replace(/<[^>]+>/g, '').trim();
          
          if (announced && announced.length > 0) {
            logProgress(`Found announced date: ${announced}`, 'info');
            
            // Extract year from announced date
            const year = this.extractYearFromAnnounced(announced);
            if (year) {
              return String(year);
            }
            
            // If no year found, return the full announced string (might be just a year)
            return announced;
          }
        }
      }
      
      logProgress('Announced field not found in device page', 'warn');
      return null;
    } catch (error) {
      logProgress(`Error getting device announced date: ${error.message}`, 'warn');
      return null;
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
   * Filter models based on minYear and excludeKeywords
   * @param {Array} models - Array of models
   * @param {number|null} minYear - Minimum year filter
   * @param {Array} excludeKeywords - Keywords to exclude
   * @returns {Array} - Filtered models
   */
  filterModels(models, minYear, excludeKeywords) {
    let filtered = models;
    
    // Filter by minYear
    if (minYear) {
      filtered = filtered.filter(model => {
        if (!model.release_date) return false;
        const year = parseInt(model.release_date);
        return !isNaN(year) && year >= minYear;
      });
    }
    
    // Filter by excludeKeywords
    if (excludeKeywords && excludeKeywords.length > 0) {
      filtered = filtered.filter(model => {
        const nameLower = (model.model_name || '').toLowerCase();
        return !excludeKeywords.some(keyword => 
          nameLower.includes(keyword.toLowerCase())
        );
      });
    }
    
    return filtered;
  }

  /**
   * Scrape a specific brand with smart caching
   * Models are cached per brand (independent of filters)
   * On subsequent requests, cached models are filtered and only new models are scraped
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
      
      // Cache key for brand models (independent of filters)
      const brandModelsCacheKey = `brand:models:${brand.name.toLowerCase()}`;
      
      // Get cached models for this brand
      logProgress(`Checking cache for brand models: ${brandModelsCacheKey}`, 'info');
      const cachedResult = await getCache(brandModelsCacheKey);
      let cachedModels = [];
      
      if (cachedResult) {
        const cachedData = cachedResult.data || cachedResult;
        cachedModels = cachedData.models || [];
        logProgress(`Found ${cachedModels.length} cached models for brand ${brand.name}`, 'info');
      } else {
        logProgress(`No cached models found for brand ${brand.name}`, 'info');
      }
      
      // Filter cached models based on current request filters
      const filteredCachedModels = this.filterModels(cachedModels, options.minYear, excludeKeywords);
      logProgress(`Filtered cached models: ${filteredCachedModels.length} match current filters`, 'info');
      
      // Get all devices for the brand (without minYear filter to get all available devices)
      const allDevices = await this.searchDevicesByBrand(brand.name, {
        minYear: null, // Get all devices, we'll filter later
        excludeKeywords: excludeKeywords,
        brandUrl: brand.url
      });
      
      logProgress(`Found ${allDevices.length} total devices for brand ${brand.name}`, 'info');
      
      if (allDevices.length === 0) {
        logProgress(`No devices found for brand ${brand.name}. This might be due to filters or parsing issues.`, 'warn');
        return {
          name: brand.name,
          models: filteredCachedModels
        };
      }
      
      // Get device_ids that are already cached
      const cachedDeviceIds = new Set(
        cachedModels
          .map(m => m.device_id)
          .filter(id => id !== null && id !== undefined)
      );
      
      // Filter devices: only get those that are not cached and match filters
      const devicesToScrape = allDevices.filter(device => {
        const deviceId = this.extractDeviceIdFromUrl(device.url);
        const isCached = deviceId && cachedDeviceIds.has(parseInt(deviceId));
        
        // Apply minYear filter
        if (options.minYear && device.year && device.year < options.minYear) {
          return false;
        }
        
        return !isCached;
      });
      
      logProgress(`Need to scrape ${devicesToScrape.length} new devices (${allDevices.length - devicesToScrape.length} already cached)`, 'info');
      
      // Calculate how many models we need
      const modelsPerBrand = options.modelsPerBrand || allDevices.length;
      const neededModels = Math.max(0, modelsPerBrand - filteredCachedModels.length);
      
      // Scrape only new devices (up to neededModels)
      const newModels = [];
      const devicesToProcess = devicesToScrape.slice(0, neededModels);
      
      logProgress(`Processing ${devicesToProcess.length} new devices (need ${neededModels} more models)`, 'info');
      
      for (const device of devicesToProcess) {
        try {
          logProgress(`  Processing device: ${device.name}`, 'info');
          
          // Extract device_id from URL
          const deviceId = this.extractDeviceIdFromUrl(device.url);
          
          // Normalize device_url
          const deviceUrl = device.url.startsWith('http') ? device.url : this.baseUrl + '/' + device.url.replace(/^\/+/, '');
          
          // Get image_url and announced date sequentially to avoid rate limiting
          // Each request already has retry logic and delays built in
          const imageUrl = await this.getDeviceImageUrl(device.url);
          // Add delay between requests to avoid rate limiting
          await this.delay(1000);
          const announcedDate = await this.getDeviceAnnounced(device.url);
          
          // Use announced date if available, otherwise fall back to device.year
          const releaseDate = announcedDate || (device.year ? String(device.year) : null);
          
          // Extract series from device name (first word)
          const series = device.name.split(' ')[0];
          
          newModels.push({
            model_name: device.name,
            series: series,
            release_date: releaseDate || null,
            device_id: deviceId ? parseInt(deviceId) : null,
            device_url: deviceUrl,
            image_url: imageUrl
          });
          
          // Add delay between device processing (increased to avoid rate limiting)
          await this.delay(CONFIG.DELAYS.between_requests || 3000);
        } catch (error) {
          logProgress(`  Error processing device ${device.name}: ${error.message}`, 'error');
          // Add fallback model data with minimal info
          const deviceId = this.extractDeviceIdFromUrl(device.url);
          const deviceUrl = device.url.startsWith('http') ? device.url : this.baseUrl + '/' + device.url.replace(/^\/+/, '');
          const series = device.name.split(' ')[0];
          newModels.push({
            model_name: device.name,
            series: series,
            release_date: device.year ? String(device.year) : null,
            device_id: deviceId ? parseInt(deviceId) : null,
            device_url: deviceUrl,
            image_url: null
          });
        }
      }
      
      // Merge cached models with new models (preserve order: cached first, then new)
      const allModels = [...cachedModels, ...newModels];
      
      // Update cache with all models (merged)
      const brandData = {
        name: brand.name,
        models: allModels
      };
      
      await setCache(brandModelsCacheKey, brandData, CACHE_TTL_SECONDS);
      logProgress(`Updated cache for brand ${brand.name} with ${allModels.length} total models`, 'success');
      
      // Prioritize cached models: first return filtered cached models, then new models
      const cachedFiltered = this.filterModels(cachedModels, options.minYear, excludeKeywords);
      const newFiltered = this.filterModels(newModels, options.minYear, excludeKeywords);
      
      // Combine: cached first, then new (up to modelsPerBrand)
      const combinedModels = [...cachedFiltered, ...newFiltered];
      const limitedModels = combinedModels.slice(0, modelsPerBrand);
      
      return {
        name: brand.name,
        models: limitedModels
      };
    } catch (error) {
      logProgress(`Error scraping brand ${brand.name}: ${error.message}`, 'error');
      return {
        name: brand.name,
        models: [],
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
      let brandsToScrape = [];

      if (!brands || brands.length === 0) {
        logProgress('No brands specified, fetching all available brands...', 'info');
        const allBrands = await this.getAllBrands();
        brandsToScrape = allBrands;
        logProgress(`Found ${allBrands.length} brands to scrape`, 'info');
      } else {
        const rawBrands = Array.isArray(brands) ? brands : [brands];
        const stringBrands = rawBrands.filter(brand => typeof brand === 'string');
        let brandLookup = null;

        if (stringBrands.length > 0) {
          logProgress('Fetching available brands for lookup...', 'info');
          const availableBrands = await this.getAllBrands();
          brandLookup = new Map(
            availableBrands.map(brand => [brand.name.toLowerCase(), brand])
          );
        }

        for (const brand of rawBrands) {
          if (typeof brand === 'string') {
            const normalizedName = brand.toLowerCase();
            const brandObj = brandLookup?.get(normalizedName);

            if (!brandObj) {
              logProgress(`Brand "${brand}" not found in available brands list. Skipping.`, 'warn');
              continue;
            }

            brandsToScrape.push(brandObj);
          } else if (brand && typeof brand === 'object') {
            brandsToScrape.push(brand);
          }
        }

        if (brandsToScrape.length === 0) {
          logProgress('No valid brands found to scrape after lookup.', 'error');
          return {
            brands: []
          };
        }
      }
      
      logProgress(`Starting to scrape ${brandsToScrape.length} brands`, 'info');
      
      const results = [];
      let allCached = true;
      let earliestCachedAt = null;
      
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
        
        // Extract cache metadata if present
        const cacheMetadata = brandData._cache_metadata;
        if (cacheMetadata) {
          if (cacheMetadata.cached) {
            // Track earliest cached_at timestamp
            if (!earliestCachedAt || new Date(cacheMetadata.cached_at) < new Date(earliestCachedAt)) {
              earliestCachedAt = cacheMetadata.cached_at;
            }
          } else {
            allCached = false;
          }
          // Remove metadata from brand data before adding to results
          delete brandData._cache_metadata;
        } else {
          allCached = false;
        }
        
        results.push(brandData);
        
        // Add delay between brand scraping
        await this.delay(CONFIG.DELAYS.between_brands || 3000);
      }
      
      return {
        brands: results,
        cached: allCached,
        cached_at: allCached ? earliestCachedAt : null
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
    
    // Pattern 2: brand_model-12345.php (most common GSM Arena format)
    // Examples: apple_iphone_16-13317.php, iphone_16-13317.php
    match = url.match(/-(\d+)\.php$/);
    if (match) return match[1];
    
    // Pattern 3: Extract from path segments
    const segments = url.split('/').filter(s => s);
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) {
      match = lastSegment.match(/-(\d+)\.php$/);
      if (match) return match[1];
      
      // Also try pattern with underscore: brand_model_12345.php
      match = lastSegment.match(/_(\d+)\.php$/);
      if (match) return match[1];
    }
    
    // Pattern 4: Try to find any number before .php at the end
    match = url.match(/(\d+)\.php$/);
    if (match) return match[1];
    
    return null;
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

  buildBrandCacheKey(brandName, options = {}) {
    const normalizedName = (brandName || 'unknown').toLowerCase();
    const minYear = options.minYear ?? 'all';
    const modelsPerBrand = options.modelsPerBrand ?? 'all';
    const exclude = (options.excludeKeywords || []).slice().sort().join('|') || 'none';
    return `brand:${normalizedName}:min:${minYear}:models:${modelsPerBrand}:exclude:${exclude}`;
  }

  buildDeviceSearchCacheKey(brandNameLower, options = {}) {
    const name = brandNameLower || 'unknown';
    const minYear = options.minYear ?? 'all';
    const exclude = (options.excludeKeywords || []).slice().sort().join('|') || 'none';
    const brandUrlToken = (options.brandUrl || '').toLowerCase();
    return `devices:${name}:min:${minYear}:exclude:${exclude}:url:${brandUrlToken}`;
  }
}

// Export is handled by the ES module syntax at the top of the file