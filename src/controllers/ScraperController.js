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
      return ResponseHelper.success('Brand scraping completed successfully', result);
    } catch (error) {
      return ResponseHelper.error('Brand scraping failed', error.message);
    }
  }

  /**
   * Scrape specific models for a brand
   * @param {string} brandName - Brand name
   * @param {Object} options - Scraping options
   * @returns {Object} - Scraping result
   */
  async scrapeBrandModels(brandName, options = {}) {
    try {
      const result = await this.scraperService.scrapeBrandModels(brandName, options);
      return ResponseHelper.success('Brand models scraping completed successfully', result);
    } catch (error) {
      return ResponseHelper.error('Brand models scraping failed', error.message);
    }
  }

  /**
   * Get available brands from GSM Arena
   * @returns {Object} - Available brands
   */
  async getAvailableBrands() {
    try {
      const brands = await this.scraperService.getAvailableBrands();
      return ResponseHelper.success('Available brands retrieved successfully', brands);
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
