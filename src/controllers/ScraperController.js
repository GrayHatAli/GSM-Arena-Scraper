// Scraper Controller - Handles all scraping operations

import { ScraperService } from '../services/ScraperService.js';
import { ResponseHelper } from '../utils/ResponseHelper.js';

export class ScraperController {
  constructor() {
    this.scraperService = new ScraperService();
  }

  /**
   * Scrape specific brands
   * @param {Array} brands - Array of brand names (empty array scrapes all brands)
   * @param {Object} options - Scraping options
   * @returns {Object} - Scraping result
   */
  async scrapeBrands(brands, options = {}) {
    try {
      const result = await this.scraperService.scrapeBrands(brands, options);
      
      // Return success even if no models found (this might be valid)
      const message = result.total_models > 0 
        ? 'Brand scraping completed successfully' 
        : 'Brand scraping completed but no models found for the specified filters';
      
      return ResponseHelper.success(message, result);
    } catch (error) {
      return ResponseHelper.error('Brand scraping failed', error.message);
    }
  }

  /**
   * Scrape all brands
   * @param {Object} options - Scraping options
   * @returns {Object} - Scraping result
   */
  async scrapeAll(options = {}) {
    return this.scrapeBrands([], options);
  }

  /**
   * Get device specifications by device ID
   * @param {string} deviceId - Device ID
   * @returns {Object} - Device specifications
   */
  async getDeviceSpecifications(deviceId) {
    try {
      const specifications = await this.scraperService.getDeviceSpecificationsById(deviceId);
      return ResponseHelper.success('Retrieved device specifications successfully', specifications);
    } catch (error) {
      return ResponseHelper.error('Failed to get device specifications', error.message);
    }
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
   * @returns {Object} - List of matching devices with deviceId
   */
  async searchDevices(filters = {}) {
    try {
      const devices = await this.scraperService.searchDevices(filters);
      return ResponseHelper.success(`Found ${devices.length} devices`, { devices });
    } catch (error) {
      return ResponseHelper.error('Failed to search devices', error.message);
    }
  }

  /**
   * Get scraping status
   * @returns {Object} - Current status
   */
  async getStatus() {
    try {
      const status = await this.scraperService.getStatus();
      return ResponseHelper.success('Status retrieved successfully', status);
    } catch (error) {
      return ResponseHelper.error('Failed to get status', error.message);
    }
  }
}
