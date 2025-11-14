// Scraper Controller - Handles all scraping operations

import { ScraperService } from '../services/ScraperService.js';
import { ResponseHelper } from '../utils/ResponseHelper.js';

export class ScraperController {
  constructor() {
    this.scraperService = new ScraperService();
  }

  /**
   * Scrape specific brands
   * @param {Array} brands - Array of brand names
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
   * Get all available brands
   * @returns {Object} - List of all brands
   */
  async getAllBrands() {
    try {
      const brands = await this.scraperService.getAllBrands();
      return ResponseHelper.success('Retrieved all brands successfully', { brands });
    } catch (error) {
      return ResponseHelper.error('Failed to get brands', error.message);
    }
  }

  /**
   * Get devices by brand name
   * @param {string} brandName - Brand name
   * @returns {Object} - List of devices for the brand
   */
  async getDevicesByBrand(brandName) {
    try {
      const devices = await this.scraperService.getDevicesByBrand(brandName);
      return ResponseHelper.success(`Retrieved devices for ${brandName} successfully`, { devices });
    } catch (error) {
      return ResponseHelper.error(`Failed to get devices for ${brandName}`, error.message);
    }
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
   * Find devices by keyword
   * @param {string} keyword - Search keyword
   * @returns {Object} - List of matching devices
   */
  async findDevicesByKeyword(keyword) {
    try {
      const devices = await this.scraperService.findDevicesByKeyword(keyword);
      return ResponseHelper.success(`Found ${devices.length} devices matching "${keyword}"`, { devices });
    } catch (error) {
      return ResponseHelper.error('Failed to search devices', error.message);
    }
  }

  /**
   * Get available brands from GSM Arena
   * @returns {Object} - Available brands
   */
  async getAvailableBrands() {
    try {
      const brands = await this.scraperService.getAvailableBrands();
      return ResponseHelper.success('Available brands retrieved successfully', {
        brands,
        total_brands: brands.length
      });
    } catch (error) {
      return ResponseHelper.error('Failed to get available brands', error.message);
    }
  }

  /**
   * Test scraping with single brand
   * @param {string} brandName - Brand name to test
   * @returns {Object} - Test result
   */
  async testScraping(brandName = 'apple') {
    try {
      const result = await this.scraperService.testScraping(brandName);
      return ResponseHelper.success('Test scraping completed successfully', result);
    } catch (error) {
      return ResponseHelper.error('Test scraping failed', error.message);
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
