/**
 * ScraperService.js
 * A service that uses direct HTTP requests to scrape GSM Arena data
 */

import axios from 'axios';
import { logProgress, delay } from '../utils/ScraperUtils.js';
import { CONFIG } from '../config/config.js';
import * as db from '../database/models.js';

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
    // In-memory cache for brand list (cache for 1 hour)
    this._brandsCache = null;
    this._brandsCacheTime = null;
    this._brandsCacheTTL = 60 * 60 * 1000; // 1 hour in milliseconds
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
    let alreadyDelayed = false; // Track if we delayed in catch block to avoid double delay
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Delay before retry (except for first attempt)
        // Skip if we already delayed in the catch block (for 429 errors)
        if (attempt > 0 && !alreadyDelayed) {
          const delayMs = baseDelay * Math.pow(2, attempt - 1);
          logProgress(`Retry attempt ${attempt}/${maxRetries} after ${delayMs}ms delay`, 'warning');
          await delay(delayMs);
        }
        
        // Reset the flag before making the request
        alreadyDelayed = false;
        
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
        
        // For 429 errors, use longer delays or respect retry-after header
        if (error.response?.status === 429) {
          const retryAfter = error.response?.headers?.['retry-after'] || 
                            error.response?.headers?.['Retry-After'];
          let delayMs;
          
          if (retryAfter) {
            const retryAfterSeconds = parseInt(retryAfter, 10);
            delayMs = retryAfterSeconds * 1000 + 1000;
            logProgress(`Rate limit (429) - server says retry after ${retryAfterSeconds}s, waiting ${Math.round(delayMs/1000)}s before retry ${attempt + 1}/${maxRetries}...`, 'warning');
          } else {
            delayMs = baseDelay * Math.pow(2, attempt - 1) * 2;
            logProgress(`Rate limit (429) - waiting ${Math.round(delayMs/1000)}s before retry ${attempt + 1}/${maxRetries}...`, 'warning');
          }
          
          await delay(delayMs);
          alreadyDelayed = true;
        } else {
          logProgress(`Request failed (${error.response?.status || error.code}), will retry...`, 'warning');
        }
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
   * Extract release year from brand page snippet
   * @param {string} snippet
   * @returns {number|null}
   */
  extractYearFromReleaseSnippet(snippet) {
    if (!snippet) return null;
    const releasedMatch = snippet.match(/Released\s+(?:in\s+)?(\d{4})/i);
    if (releasedMatch) {
      const year = parseInt(releasedMatch[1], 10);
      if (year >= 2000 && year <= 2099) {
        return year;
      }
    }
    
    const fallback = snippet.match(/(\d{4})/);
    if (fallback) {
      const year = parseInt(fallback[1], 10);
      if (year >= 2000 && year <= 2099) {
        return year;
      }
    }
    return null;
  }

  /**
   * Build a map of device href -> release snippet from brand page HTML
   * @param {string} html
   * @returns {Map<string,string>}
   */
  extractReleaseInfoMap(html) {
    const map = new Map();
    if (!html) return map;
    const releasePattern = /<a href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*class="specs-brief-accent"[^>]*>([^<]+)<\/span>/gi;
    let releaseMatch;
    while ((releaseMatch = releasePattern.exec(html)) !== null) {
      const href = releaseMatch[1]?.replace(/^\/+/, '');
      const snippet = releaseMatch[2]?.trim();
      if (!href || !snippet) continue;
      map.set(href.toLowerCase(), snippet);
    }
    return map;
  }

  /**
   * Extract released year from "Status" field
   * Status format: "Available. Released 2025, March 19" or similar
   * @param {string} status - Status field value
   * @returns {number|null} - Extracted released year or null
   */
  extractYearFromStatus(status) {
    if (!status) return null;
    
    // Look for "Released" followed by a year pattern
    // Pattern matches various formats:
    // - "Released 2025"
    // - "Released 2025, March"
    // - "Released in 2025"
    // - "Released March 2025"
    // - "Released on 2025"
    // Uses a more flexible pattern that allows optional words between "Released" and the year
    const releasedMatch = status.match(/Released\s+(?:in|on|,)?\s*(?:[A-Za-z]+\s+)?(\d{4})/i);
    if (releasedMatch) {
      const year = parseInt(releasedMatch[1], 10);
      // Validate it's a reasonable year (2000-2099) - consistent with fallback
      if (year >= 2000 && year <= 2099) {
        return year;
      }
    }
    
    // Fallback: look for year pattern specifically in context of "Released"
    // This ensures we only match years that appear after "Released" text
    // Pattern: "Released" followed by any characters (non-greedy) then a 4-digit year
    const releasedContextMatch = status.match(/Released[^0-9]*(\d{4})/i);
    if (releasedContextMatch) {
      const year = parseInt(releasedContextMatch[1], 10);
      // Validate it's a reasonable year (2000-2099)
      if (year >= 2000 && year <= 2099) {
        return year;
      }
    }
    
    return null;
  }

  /**
   * Check if status indicates device is available
   * @param {string} status - Status field value
   * @returns {boolean} - True if status contains "Available"
   */
  isStatusAvailable(status) {
    if (!status) return false;
    return status.toLowerCase().includes('available');
  }

  /**
   * Get all available brands from GSM Arena
   * @returns {Promise<Array>} - Array of brand objects
   */
  async getAllBrands() {
    try {
      // Check cache first
      const now = Date.now();
      if (this._brandsCache && this._brandsCacheTime && (now - this._brandsCacheTime) < this._brandsCacheTTL) {
        logProgress(`Using cached brand list (${this._brandsCache.length} brands)`, 'info');
        return this._brandsCache;
      }
      
      logProgress('Getting available brands...', 'info');
      
      // Add longer delay before request to avoid rate limiting (especially on startup)
      await delay(10000);
      
      try {
        // Use retry logic for rate limit errors with more retries and longer delays
        const response = await this.makeRequestWithRetry(
          () => this.apiClient.get('/makers.php3'),
          5, // max retries (increased from 3)
          10000 // base delay for retries (10s, 20s, 40s, 80s, 160s)
        );
      
      // Extract brands from HTML response
      const html = response.data;
      
      const brands = [];
      const brandDataMap = new Map(); // Store href -> {name, url} mapping for deduplication
      const brandNameMap = new Map(); // Store href -> extracted name/meta from HTML
      
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

          const brandUrlMatch = href.match(/([a-z0-9_&]+)-phones-\d+\.php/i);
          if (!brandUrlMatch || !brandUrlMatch[1]) {
            continue;
          }

          let displayName = name.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          if (!displayName) {
            continue;
          }

          const normalizedName = displayName.toLowerCase();
          const invalidNames = ['object', 'function', 'undefined', 'null', 'true', 'false', 'this', 'var', 'let', 'const'];
          if (invalidNames.includes(normalizedName)) {
            continue;
          }

          const modelCountMatch = tableMatch[0].match(/(\d+)\s+devices?/i);
          const estimatedModels = modelCountMatch ? parseInt(modelCountMatch[1], 10) : 0;

          brandNameMap.set(href, {
            normalizedName,
            displayName,
            estimatedModels
          });
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
        const meta = brandNameMap.get(href);
        const finalName = meta?.normalizedName || brandNameFromUrl;
        const displayName = meta?.displayName || finalName;
        const estimatedModels = meta?.estimatedModels || 0;
        
        // Add to map (deduplication by href)
        brandDataMap.set(href, {
          name: finalName,
          display_name: displayName,
          estimated_models: estimatedModels,
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
      
      // Cache the result
      this._brandsCache = brands;
      this._brandsCacheTime = Date.now();
      
      return brands;
      } catch (error) {
        // If rate limited and we have old cache, use it
        if (error.response?.status === 429 && this._brandsCache) {
          logProgress(`Rate limited, using stale cache (${this._brandsCache.length} brands)`, 'warn');
          return this._brandsCache;
        }
        throw error;
      }
    } catch (error) {
      // If we still have an error and have old cache, use it as last resort
      if (this._brandsCache) {
        logProgress(`Error getting brands, using stale cache (${this._brandsCache.length} brands): ${error.message}`, 'warn');
        return this._brandsCache;
      }
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
      
      // Extract brand ID from brandUrl
      let brandId = null;
      if (options.brandUrl) {
        logProgress(`Attempting to extract brand ID from URL: ${options.brandUrl}`, 'info');
        brandId = this.extractBrandIdFromUrl(options.brandUrl);
        if (brandId) {
          logProgress(`✅ Extracted brand ID: ${brandId} from URL: ${options.brandUrl}`, 'success');
        } else {
          logProgress(`❌ Could not extract brand ID from URL: ${options.brandUrl}`, 'warn');
        }
      } else {
        logProgress(`⚠️ No brandUrl provided in options`, 'warn');
      }
      
      // If brand ID is not available, fall back to old method (scrape brand page)
      if (!brandId) {
        logProgress(`⚠️ Brand ID not available, falling back to brand page scraping`, 'warn');
        // Use the brand page URL directly
        if (options.brandUrl) {
          const brandPageUrl = options.brandUrl.startsWith('http') 
            ? options.brandUrl 
            : `${this.baseUrl}/${options.brandUrl.replace(/^\/+/, '')}`;
          return await this.scrapeDevicesFromBrandPage(brandPageUrl, brandName, options);
        }
        return [];
      }
      
      // Add random delay to avoid detection
      const randomDelay = Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds
      await delay(randomDelay);
      
      // Build search URL using GSM Arena search API
      // Format: https://www.gsmarena.com/results.php3?nYearMin=2023&sMakers=48
      // Note: results.php3 is the actual results page, search.php3 is just a form
      const searchParams = new URLSearchParams();
      searchParams.append('sMakers', brandId.toString());
      
      if (options.minYear) {
        searchParams.append('nYearMin', options.minYear.toString());
      }
      
      const searchUrl = `/results.php3?${searchParams.toString()}`;
      logProgress(`Using search API: ${searchUrl}`, 'info');
      
      // Make request to search API
      const response = await this.makeRequestWithRetry(
        () => this.apiClient.get(searchUrl),
        3, // max retries
        3000 // base delay for retries
      );
      
      const html = response.data;
      logProgress(`Search response length: ${html.length}`, 'info');
      
      // Check if HTML contains device listings
      // Search results might have different structure - look for common indicators
      const hasDeviceListings = html.includes('results') || html.includes('phone') || html.includes('device');
      logProgress(`HTML contains device indicators: ${hasDeviceListings}`, 'info');
      
      // Extract devices from search results HTML
      // GSM Arena search results use specific patterns for device listings
      // Based on the actual HTML structure from search.php3
      const devices = [];
      const devicePatterns = [
        // Pattern 1: Standard device link format from search results (most common)
        // <a href="apple_iphone_17_pro_max-13964.php"><img...><strong><span>iPhone 17 Pro Max</span></strong></a>
        /<a\s+href="([^"]+)"[^>]*>\s*<img[^>]*>\s*<strong><span>([^<]+)<\/span><\/strong><\/a>/gi,
        // Pattern 2: Device links without span
        /<a\s+href="([^"]+)"[^>]*>\s*<img[^>]*>\s*<strong>([^<]+)<\/strong><\/a>/gi,
        // Pattern 3: Device links in li elements
        /<li><a\s+href="([^"]+)"[^>]*>\s*<img[^>]*>\s*<strong><span>([^<]+)<\/span><\/strong><\/a><\/li>/gi,
        // Pattern 4: More flexible - any link with device URL pattern (non-greedy)
        /<a\s+href="([^"]+-[^"]+\.php)"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/gi,
        // Pattern 5: Pattern from brand pages (fallback) - no whitespace
        /<a\s+href="([^"]+)"[^>]*><img[^>]*><strong><span>([^<]+)<\/span><\/strong><\/a>/gi,
        // Pattern 6: Search results might use different structure - try table rows
        /<tr[^>]*>[\s\S]*?<a\s+href="([^"]+)"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>[\s\S]*?<\/a>[\s\S]*?<\/tr>/gi,
        // Pattern 7: Try div-based listings
        /<div[^>]*>[\s\S]*?<a\s+href="([^"]+)"[^>]*>[\s\S]*?<img[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>[\s\S]*?<\/a>[\s\S]*?<\/div>/gi
      ];
      
      for (let patternIndex = 0; patternIndex < devicePatterns.length; patternIndex++) {
        const pattern = devicePatterns[patternIndex];
        let match;
        pattern.lastIndex = 0; // Reset regex
        let patternMatches = 0;
        
        while ((match = pattern.exec(html)) !== null) {
          patternMatches++;
          const url = match[1].startsWith('http') ? match[1] : this.baseUrl + '/' + match[1].replace(/^\/+/, '');
          
          // Extract device name (remove HTML tags if any)
          let name = match[2].replace(/<[^>]+>/g, '').trim();
          
          // Debug: log first few matches
          if (patternMatches <= 3) {
            logProgress(`Pattern ${patternIndex + 1} match ${patternMatches}: name="${name}", url="${url}"`, 'debug');
          }
          
          // Skip invalid entries
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
              name.length < 3) {
            continue;
          }
          
          // Extract year from name if available
          const yearMatch = name.match(/\b(20\d{2})\b/);
          let extractedYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
          
          // Also try to extract year from URL
          if (!extractedYear) {
            const urlYearMatch = url.match(/\b(20\d{2})\b/);
            extractedYear = urlYearMatch ? parseInt(urlYearMatch[1], 10) : null;
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
          
          // Apply keyword exclusion if specified
          if (options.excludeKeywords && options.excludeKeywords.length > 0) {
            const shouldExclude = options.excludeKeywords.some(keyword => 
              nameLower.includes(keyword.toLowerCase())
            );
            
            if (shouldExclude) {
              continue;
            }
          }
          
          devices.push({
            name,
            url,
            year: extractedYear
          });
        }
        
        // Log pattern results
        if (patternMatches > 0) {
          logProgress(`Pattern ${patternIndex + 1} found ${patternMatches} matches, ${devices.length} valid devices`, 'info');
        }
        
        // If we found devices with this pattern, stop trying other patterns
        if (devices.length > 0) {
          logProgress(`Using pattern ${patternIndex + 1} for device extraction`, 'success');
          break;
        }
      }
      
      if (devices.length === 0) {
        // Try to find any device-like URLs in HTML as fallback
        // Device URLs pattern: brand_model-12345.php (not brand-phones-48.php)
        const deviceUrlPattern = /([a-z_]+_[a-z0-9_]+-\d+\.php)/gi;
        const urlMatches = html.match(deviceUrlPattern);
        if (urlMatches && urlMatches.length > 0) {
          logProgress(`Found ${urlMatches.length} potential device URLs in HTML (sample: ${urlMatches.slice(0, 5).join(', ')})`, 'info');
          
          // Try to extract device names from these URLs
          for (const deviceUrl of urlMatches.slice(0, 50)) { // Limit to first 50
            // Extract device name from URL (e.g., apple_iphone_17_pro_max-13964.php -> iPhone 17 Pro Max)
            const urlParts = deviceUrl.replace('.php', '').split('-');
            const deviceId = urlParts[urlParts.length - 1];
            const nameParts = urlParts.slice(0, -1).join('_').split('_').slice(1); // Remove brand name
            
            // Convert snake_case to Title Case
            let deviceName = nameParts.map(part => 
              part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
            ).join(' ');
            
            // Skip if name is too short or looks invalid
            if (deviceName.length < 3 || deviceName.toLowerCase().includes('phones')) {
              continue;
            }
            
            // Extract year if available
            const yearMatch = deviceName.match(/\b(20\d{2})\b/);
            let extractedYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
            
            // Filter non-phone devices
            const nameLower = deviceName.toLowerCase();
            const nonPhoneKeywords = ['ipad', 'pad', 'tab', 'matepad', 'watch', 'band', 'airpods', 'buds', 'mac', 'macbook', 'imac', 'tablet', 'smartwatch'];
            if (nonPhoneKeywords.some(keyword => nameLower.includes(keyword))) {
              continue;
            }
            
            devices.push({
              name: deviceName,
              url: deviceUrl.startsWith('http') ? deviceUrl : this.baseUrl + '/' + deviceUrl,
              year: extractedYear
            });
          }
          
          logProgress(`Extracted ${devices.length} devices from URL pattern fallback`, 'info');
        }
        
        if (devices.length === 0) {
          logProgress(`No devices found with search API patterns. Falling back to brand page scraping.`, 'warn');
          // Fallback to brand page scraping
          if (options.brandUrl) {
            const brandPageUrl = options.brandUrl.startsWith('http') 
              ? options.brandUrl 
              : `${this.baseUrl}/${options.brandUrl.replace(/^\/+/, '')}`;
            return await this.scrapeDevicesFromBrandPage(brandPageUrl, brandName, options);
          }
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
      
      // Extract release info from the search results page if available
      const releaseInfoMap = this.extractReleaseInfoMap(html);
      for (const device of uniqueDevices) {
        const normalizedHref = device.url.replace(this.baseUrl, '').replace(/^\/+/, '').toLowerCase();
        if (normalizedHref) {
          const snippet = releaseInfoMap?.get(normalizedHref);
          if (snippet) {
            device.releaseSnippet = snippet;
            if (!device.year) {
              const releaseYear = this.extractYearFromReleaseSnippet(snippet);
              if (releaseYear) {
                device.year = releaseYear;
              }
            }
          }
        }
      }
      
      // If minYear is specified and we still have devices without year, extract from device pages
      if (options.minYear) {
        const devicesWithoutYear = uniqueDevices.filter(d => !d.year);
        if (devicesWithoutYear.length > 0) {
          logProgress(`Extracting year from ${devicesWithoutYear.length} device pages (minYear=${options.minYear})`, 'info');
          
          // Process devices in batches to avoid rate limiting
          const batchSize = 5;
          for (let i = 0; i < devicesWithoutYear.length; i += batchSize) {
            const batch = devicesWithoutYear.slice(i, i + batchSize);
            await Promise.all(batch.map(async (device) => {
              try {
                const releasedDate = await this.getDeviceReleased(device.url);
                if (releasedDate) {
                  const year = this.extractYearFromReleaseSnippet(releasedDate);
                  if (year) {
                    device.year = year;
                  }
                }
              } catch (error) {
                logProgress(`Error extracting year for ${device.name}: ${error.message}`, 'warn');
              }
            }));
            
            // Add delay between batches
            if (i + batchSize < devicesWithoutYear.length) {
              await delay(1000);
            }
          }
        }
        
        // Apply minYear filter
        const filteredDevices = uniqueDevices.filter(d => {
          // Keep devices without year (unknown year)
          if (!d.year) return true;
          // Exclude devices with year less than minYear
          return d.year >= options.minYear;
        });
        
        logProgress(`Found ${filteredDevices.length} unique devices for brand ${brandName} (after minYear=${options.minYear} filtering)`, 'success');
        return filteredDevices;
      }
      
      logProgress(`Found ${uniqueDevices.length} unique devices for brand ${brandName}`, 'success');
      return uniqueDevices;
    } catch (error) {
      logProgress(`Error searching devices by brand: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Scrape devices from brand page (fallback method when search API doesn't work)
   * @param {string} brandPageUrl - Brand page URL
   * @param {string} brandName - Brand name
   * @param {Object} options - Options including minYear
   * @returns {Promise<Array>} - Array of device objects
   */
  async scrapeDevicesFromBrandPage(brandPageUrl, brandName, options = {}) {
    try {
      logProgress(`Scraping devices from brand page: ${brandPageUrl}`, 'info');
      
      const brandNameLower = brandName ? brandName.toLowerCase() : null;
      const searchUrl = brandPageUrl.replace(this.baseUrl, '').replace(/^\/?/, '/');
      
      // Use retry logic for rate limit errors
      const response = await this.makeRequestWithRetry(
        () => this.apiClient.get(searchUrl),
        3, // max retries
        3000 // base delay for retries
      );
      
      const html = response.data;
      logProgress(`Brand page response length: ${html.length}`, 'info');
      
      const releaseInfoMap = this.extractReleaseInfoMap(html);
      
      // Use the same patterns as before for brand pages
      const devicePatterns = [
        /<a href="([^"]+)"[^>]*><img[^>]*><strong><span>([^<]+)<\/span><\/strong><\/a>/g,
        /<li><a href="([^"]+)"[^>]*><img[^>]*><strong><span>([^<]+)<\/span><\/strong><\/a><\/li>/g,
        /<a href="([^"]+)"[^>]*><img[^>]*><br>([^<]+)<\/a>/g
      ];
      
      const devices = [];
      
      for (const pattern of devicePatterns) {
        let match;
        pattern.lastIndex = 0;
        
        while ((match = pattern.exec(html)) !== null) {
          const url = match[1].startsWith('http') ? match[1] : this.baseUrl + '/' + match[1];
          const name = match[2].trim();
          
          // Skip invalid entries
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
              name.length < 3) {
            continue;
          }
          
          // Extract year from name or URL
          const yearMatch = name.match(/\b(20\d{2})\b/);
          let extractedYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
          
          if (!extractedYear) {
            const urlYearMatch = url.match(/\b(20\d{2})\b/);
            extractedYear = urlYearMatch ? parseInt(urlYearMatch[1], 10) : null;
          }
          
          // For iPhone models without explicit year, infer from model number
          if (!extractedYear && name.toLowerCase().includes('iphone')) {
            const iphoneMatch = name.match(/iPhone\s+(\d+)/i);
            if (iphoneMatch) {
              const iphoneNumber = parseInt(iphoneMatch[1]);
              extractedYear = 2007 + iphoneNumber;
            }
          }
          
          // Apply minYear filter early if year is available
          if (options.minYear && extractedYear && extractedYear < options.minYear) {
            continue;
          }
          
          // Filter out non-phone devices
          const nameLower = name.toLowerCase();
          const nonPhoneKeywords = [
            'ipad', 'pad', 'tab', 'matepad', 'watch', 'band', 'airpods', 'buds',
            'mac', 'macbook', 'imac', 'mac mini', 'mac pro', 'apple tv', 'homepod',
            'airtag', 'tablet', 'smartwatch', 'smart watch', 'earbuds', 'headphones',
            'speaker', 'accessory', 'charger', 'case', 'cover'
          ];
          
          if (nonPhoneKeywords.some(keyword => nameLower.includes(keyword))) {
            continue;
          }
          
          // Apply keyword exclusion
          if (options.excludeKeywords && options.excludeKeywords.length > 0) {
            const shouldExclude = options.excludeKeywords.some(keyword => 
              nameLower.includes(keyword.toLowerCase())
            );
            if (shouldExclude) continue;
          }
          
          // Check brand match
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
          
          devices.push({
            name,
            url,
            year: extractedYear
          });
        }
        
        if (devices.length > 0) break;
      }
      
      // Remove duplicates
      const uniqueDevices = [];
      const seenNames = new Set();
      for (const device of devices) {
        if (!seenNames.has(device.name)) {
          seenNames.add(device.name);
          uniqueDevices.push(device);
        }
      }
      
      // Add release snippets
      for (const device of uniqueDevices) {
        const normalizedHref = device.url.replace(this.baseUrl, '').replace(/^\/+/, '').toLowerCase();
        if (normalizedHref) {
          const snippet = releaseInfoMap?.get(normalizedHref);
          if (snippet) {
            device.releaseSnippet = snippet;
            if (!device.year) {
              const releaseYear = this.extractYearFromReleaseSnippet(snippet);
              if (releaseYear) {
                device.year = releaseYear;
              }
            }
          }
        }
      }
      
      // If minYear is specified, extract year from device pages for devices without year
      if (options.minYear) {
        const devicesWithoutYear = uniqueDevices.filter(d => !d.year);
        if (devicesWithoutYear.length > 0) {
          logProgress(`Extracting year from ${devicesWithoutYear.length} device pages (minYear=${options.minYear})`, 'info');
          
          const batchSize = 5;
          for (let i = 0; i < devicesWithoutYear.length; i += batchSize) {
            const batch = devicesWithoutYear.slice(i, i + batchSize);
            await Promise.all(batch.map(async (device) => {
              try {
                const releasedDate = await this.getDeviceReleased(device.url);
                if (releasedDate) {
                  const year = this.extractYearFromReleaseSnippet(releasedDate);
                  if (year) {
                    device.year = year;
                  }
                }
              } catch (error) {
                logProgress(`Error extracting year for ${device.name}: ${error.message}`, 'warn');
              }
            }));
            
            if (i + batchSize < devicesWithoutYear.length) {
              await delay(1000);
            }
          }
        }
        
        // Apply minYear filter
        const filteredDevices = uniqueDevices.filter(d => {
          if (!d.year) return true;
          return d.year >= options.minYear;
        });
        
        logProgress(`Found ${filteredDevices.length} unique devices from brand page (after minYear=${options.minYear} filtering)`, 'success');
        return filteredDevices;
      }
      
      logProgress(`Found ${uniqueDevices.length} unique devices from brand page`, 'success');
      return uniqueDevices;
    } catch (error) {
      logProgress(`Error scraping devices from brand page: ${error.message}`, 'error');
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
      await delay(2000);
      
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
   * Get device Released date from device page (Status field)
   * @param {string} deviceUrl - Device URL
   * @returns {Promise<string|null>} - Released date string or null
   */
  async getDeviceReleased(deviceUrl) {
    try {
      const url = deviceUrl.startsWith('http') ? deviceUrl : this.baseUrl + '/' + deviceUrl;
      
      const response = await this.makeRequestWithRetry(
        () => this.apiClient.get(url),
        3,
        3000
      );
      const html = response.data;
      
      // Look for "Status" field in the specifications table
      // Status format: "Available. Released 2025, September 09" or "Released 2025, September 09"
      const statusPatterns = [
        /<td[^>]*class="ttl"[^>]*>Status<\/td>\s*<td[^>]*class="nfo"[^>]*>([^<]+)<\/td>/i,
        /<td[^>]*>Status<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
        /<th[^>]*>Status<\/th>\s*<td[^>]*>([^<]+)<\/td>/i,
        /<tr[^>]*>[\s\S]*?<td[^>]*>Status<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<\/tr>/i,
        /Status[:\s]+([^<\n]+)/i
      ];
      
      for (const pattern of statusPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          let status = match[1].trim();
          status = status.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
          status = status.replace(/<[^>]+>/g, '').trim();
          
          if (status && status.length > 0 && status.toLowerCase().includes('released')) {
            return status;
          }
        }
      }
      
      return null;
    } catch (error) {
      logProgress(`Error getting device released date: ${error.message}`, 'warn');
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
      await delay(4000);
      
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
      const randomDelay = Math.floor(Math.random() * 4000) + 1000; // 1-5 seconds
      await delay(randomDelay);
      
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
      
      // Apply minYear filter based on "Status" field with Released date
      // Filter: Status = Available && ReleasedYear >= minYear
      // Only applies filter when we can verify the conditions (maintains backward compatibility)
      // Similar to old behavior: only filter if field exists and fails the check
      if (options.minYear) {
        const status = processedSpecs['Status'];
        
        // Only apply filter if Status field exists (backward compatibility - old code only filtered if Announced existed)
        if (status) {
          const isAvailable = this.isStatusAvailable(status);
          
          // Only check ReleasedYear if status is Available (filter condition requires both)
          if (isAvailable) {
            // Extract released year from status
            const releasedYear = this.extractYearFromStatus(status);
            
            // Only filter if we can extract released year and it fails the check
            // (backward compatibility - old code only filtered if year could be extracted and failed)
            if (releasedYear && releasedYear < options.minYear) {
              logProgress(`Device ${device.name} released in ${releasedYear}, filtered out by minYear ${options.minYear}`, 'info');
              return null; // Return null to indicate this device should be filtered out
            }
          }
          // If status exists but is not Available, allow through (backward compatibility)
          // If status exists and is Available but no Released year, allow through (backward compatibility)
        }
        // If Status field doesn't exist, allow through (backward compatibility - old code only filtered if Announced existed)
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
      logProgress(`Passing brandUrl to searchDevicesByBrand: ${brand.url}`, 'info');
      const devices = await this.searchDevicesByBrand(brand.name, {
        minYear: options.minYear,
        excludeKeywords: excludeKeywords,
        brandUrl: brand.url
      });
      
      // Ensure devices is an array (safety check)
      if (!Array.isArray(devices)) {
        logProgress(`Error: searchDevicesByBrand returned non-array value for brand ${brand.name}`, 'error');
        return {
          name: brand.name,
          models: []
        };
      }
      
      logProgress(`Found ${devices.length} devices for brand ${brand.name}`, 'info');
      
      if (devices.length === 0) {
        logProgress(`No devices found for brand ${brand.name}. This might be due to filters or parsing issues.`, 'warn');
        return {
          name: brand.name,
          models: []
        };
      }
      
      // Convert devices to models (only basic info, no specifications)
      const models = [];
      // If modelsPerBrand is not specified, use devices.length (scrape all)
      // This could be a large number for brands with many models
      const modelsPerBrand = options.modelsPerBrand !== undefined ? options.modelsPerBrand : devices.length;
      const devicesToProcess = devices.slice(0, modelsPerBrand);
      
      logProgress(`Processing ${devicesToProcess.length} devices (limited by modelsPerBrand: ${modelsPerBrand})`, 'info');
      
      for (const device of devicesToProcess) {
        try {
          logProgress(`  Processing device: ${device.name}`, 'info');
          
          // Extract device_id from URL
          const deviceId = this.extractDeviceIdFromUrl(device.url);
          
          // Normalize device_url
          const deviceUrl = device.url.startsWith('http') ? device.url : this.baseUrl + '/' + device.url.replace(/^\/+/, '');
          
          // Get image_url sequentially to avoid rate limiting
          // Each request already has retry logic and delays built in
          // Skip image URL if we're getting rate limited to speed up the process
          let imageUrl = null;
          try {
            imageUrl = await this.getDeviceImageUrl(device.url);
          } catch (error) {
            if (error.response?.status === 429) {
              logProgress(`  Skipping image URL for ${device.name} due to rate limit`, 'warn');
            } else {
              throw error;
            }
          }
          
          // Extract year from releaseSnippet if available (ONLY use Released date, not Announced)
          let releaseDate = null;
          let releaseYear = device.year;
          
          if (device.releaseSnippet) {
            // Extract year from release snippet (e.g., "Released 2025, September 09" -> "2025")
            const extractedYear = this.extractYearFromReleaseSnippet(device.releaseSnippet);
            if (extractedYear) {
              releaseYear = extractedYear;
              releaseDate = String(extractedYear); // Store just the year as release_date
            } else {
              // If we can't extract year, store the full snippet
              releaseDate = device.releaseSnippet;
            }
          } else if (device.year) {
            // Use year from device if available (extracted from name or URL)
            releaseYear = device.year;
            releaseDate = String(device.year);
          }
          
          // If still no release year, try to get it from device page Status field (Released date)
          if (!releaseYear) {
            try {
              await delay(2000);
              const releasedDate = await this.getDeviceReleased(device.url);
              if (releasedDate) {
                const extractedYear = this.extractYearFromReleaseSnippet(releasedDate);
                if (extractedYear) {
                  releaseYear = extractedYear;
                  releaseDate = String(extractedYear);
                }
              }
            } catch (error) {
              logProgress(`  Error getting released date for ${device.name}: ${error.message}`, 'warn');
            }
          }
          
          // Extract series from device name (first word)
          const series = device.name.split(' ')[0];
          
          models.push({
            model_name: device.name,
            series: series,
            release_date: releaseDate || null,
            release_year: releaseYear || null,
            device_id: deviceId ? parseInt(deviceId) : null,
            device_url: deviceUrl,
            image_url: imageUrl
          });
          
          // Add delay between device processing (increased to avoid rate limiting)
          await delay(CONFIG.DELAYS.between_requests || 5000);
        } catch (error) {
          logProgress(`  Error processing device ${device.name}: ${error.message}`, 'error');
          // Add fallback model data with minimal info
          const deviceId = this.extractDeviceIdFromUrl(device.url);
          const deviceUrl = device.url.startsWith('http') ? device.url : this.baseUrl + '/' + device.url.replace(/^\/+/, '');
          const series = device.name.split(' ')[0];
          models.push({
            model_name: device.name,
            series: series,
            release_date: device.year ? String(device.year) : null,
            release_year: device.year || null,
            device_id: deviceId ? parseInt(deviceId) : null,
            device_url: deviceUrl,
            image_url: null
          });
        }
      }
      
      // Save brand to database
      await db.saveBrand({
        name: brand.name,
        url: brand.url || null,
        is_active: true
      });

      // Save models to database
      for (const model of models) {
        await db.saveModel({
          brand_name: brand.name,
          brand_url: brand.url || null,
          model_name: model.model_name,
          series: model.series,
          release_date: model.release_date,
          device_id: model.device_id,
          device_url: model.device_url,
          image_url: model.image_url
        });
      }

      const brandData = {
        name: brand.name,
        models: models
      };

      return brandData;
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
              // If brand not found but we have a lookup, try to construct URL directly
              // This allows scraping even if brand list fetch failed due to rate limiting
              logProgress(`Brand "${brand}" not found in available brands list. Trying direct URL.`, 'warn');
              brandsToScrape.push({
                name: normalizedName,
                url: `${this.baseUrl}/${normalizedName}-phones-48.php`,
                is_active: true
              });
            } else {
              brandsToScrape.push(brandObj);
            }
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
      
      for (const brand of brandsToScrape) {
        let brandObj;
        
        // Handle both string brand names and brand objects
        if (typeof brand === 'string') {
          // Try to get brand from database to get the correct URL
          const dbBrand = await db.getBrandByName(brand);
          if (dbBrand && dbBrand.url) {
            brandObj = {
              name: brand,
              url: dbBrand.url,
              is_active: true
            };
            logProgress(`Using brand URL from database: ${dbBrand.url}`, 'info');
          } else {
            // Fallback: construct URL (but this won't have correct brand ID)
            brandObj = {
              name: brand,
              url: `${this.baseUrl}/${brand}-phones-48.php`,
              is_active: true
            };
            logProgress(`⚠️ Brand ${brand} not found in database, using fallback URL`, 'warn');
          }
        } else {
          brandObj = brand;
        }
        
        logProgress(`Processing brand: ${brandObj.name}`, 'info');
        
        const brandData = await this.scrapeBrand(brandObj, options);
        results.push(brandData);
        
        // Add delay between brand scraping
        await delay(CONFIG.DELAYS.between_brands || 3000);
      }
      
      return {
        brands: results
      };
    } catch (error) {
      logProgress(`Error in scrapeBrands: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Count devices for a brand using search API (quick count without full scraping)
   * @param {string} brandName - Brand name
   * @param {Object} options - Options including minYear
   * @returns {Promise<number>} - Number of devices
   */
  async countDevicesByBrand(brandName, options = {}) {
    try {
      const brandNameLower = brandName ? brandName.toLowerCase() : null;
      
      // Get brand from database to get URL
      const brand = await db.getBrandByName(brandNameLower);
      if (!brand || !brand.url) {
        return 0;
      }
      
      // Extract brand ID from URL
      const brandId = this.extractBrandIdFromUrl(brand.url);
      if (!brandId) {
        return 0;
      }
      
      // Build search URL
      const searchParams = new URLSearchParams();
      searchParams.append('sMakers', brandId.toString());
      
      if (options.minYear) {
        searchParams.append('nYearMin', options.minYear.toString());
      }
      
      const searchUrl = `/results.php3?${searchParams.toString()}`;
      
      // Make request to search API
      const response = await this.makeRequestWithRetry(
        () => this.apiClient.get(searchUrl),
        3, // max retries
        3000 // base delay for retries
      );
      
      const html = response.data;
      
      // Count device URLs in HTML (quick pattern match)
      const deviceUrlPattern = /([a-z_]+_[a-z0-9_]+-\d+\.php)/gi;
      const urlMatches = html.match(deviceUrlPattern);
      
      if (urlMatches && urlMatches.length > 0) {
        // Deduplicate URLs using Set (same device URL may appear multiple times in HTML)
        const uniqueUrls = new Set();
        
        // Filter out non-phone devices and deduplicate
        for (const url of urlMatches) {
          const nameLower = url.toLowerCase();
          const nonPhoneKeywords = ['ipad', 'pad', 'tab', 'matepad', 'watch', 'band', 'airpods', 'buds', 'mac', 'macbook', 'imac', 'tablet', 'smartwatch'];
          
          // Only add if it's a phone device and not already seen
          if (!nonPhoneKeywords.some(keyword => nameLower.includes(keyword))) {
            uniqueUrls.add(url.toLowerCase()); // Normalize to lowercase for deduplication
          }
        }
        
        return uniqueUrls.size;
      }
      
      return 0;
    } catch (error) {
      logProgress(`Error counting devices for brand ${brandName}: ${error.message}`, 'warn');
      return 0;
    }
  }

  /**
   * Extract brand ID from brand URL
   * @param {string} brandUrl - Brand URL (e.g., "https://www.gsmarena.com/apple-phones-48.php" or "/apple-phones-48.php")
   * @returns {number|null} - Brand ID or null
   */
  extractBrandIdFromUrl(brandUrl) {
    if (!brandUrl) return null;
    
    // Pattern: apple-phones-48.php or /apple-phones-48.php or https://www.gsmarena.com/apple-phones-48.php
    // Extract the number before .php (the last number before .php)
    const match = brandUrl.match(/-(\d+)\.php/);
    if (match && match[1]) {
      const brandId = parseInt(match[1], 10);
      // Validate it's a reasonable brand ID (1-999)
      if (brandId > 0 && brandId < 1000) {
        return brandId;
      }
    }
    
    return null;
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
      
      // Ensure devices is an array (safety check)
      if (!Array.isArray(devices)) {
        logProgress(`Error: searchDevicesByBrand returned non-array value for search term ${searchTerm}`, 'error');
        return [];
      }
      
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
    try {
      const deviceIdNum = parseInt(deviceId, 10);
      if (isNaN(deviceIdNum)) {
        throw new Error(`Invalid device ID: ${deviceId}`);
      }

      // Check database first
      const dbSpecs = await db.getSpecificationsByDeviceId(deviceIdNum);
      if (dbSpecs) {
        logProgress(`Retrieved specifications for device ${deviceId} from database`, 'success');
        return {
          specifications: dbSpecs.specifications,
          image_url: dbSpecs.image_url,
          ram_options: dbSpecs.ram_options,
          storage_options: dbSpecs.storage_options,
          color_options: dbSpecs.color_options
        };
      }

      // If not in database, scrape it
      logProgress(`Specifications not found in database for device ${deviceId}, scraping...`, 'info');
      
      // Get model info from database to construct device object
      const model = await db.getModelByDeviceId(deviceIdNum);
      const device = {
        name: model ? model.model_name : `Device ${deviceId}`,
        url: model ? model.device_url : `${this.baseUrl}/device-${deviceId}.php`
      };
      
      const specs = await this.getDeviceSpecifications(device, {});
      
      // Save to database
      if (specs && specs.specifications) {
        await db.saveSpecifications({
          device_id: deviceIdNum,
          specifications: specs.specifications,
          image_url: specs.image_url,
          ram_options: specs.ram_options || [],
          storage_options: specs.storage_options || [],
          color_options: specs.color_options || []
        });
        logProgress(`Saved specifications for device ${deviceId} to database`, 'success');
      }
      
      return specs;
    } catch (error) {
      logProgress(`Error getting device specifications for ${deviceId}: ${error.message}`, 'error');
      throw error;
    }
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