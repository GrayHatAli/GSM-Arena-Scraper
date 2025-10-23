// API Client for GSM Arena Scraper

import axios from 'axios';
import { CONFIG } from '../config/config.js';

export class ScraperAPIClient {
  constructor(baseURL = `http://${CONFIG.API.host}:${CONFIG.API.port}`) {
    this.client = axios.create({
      baseURL,
      timeout: CONFIG.API.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Health check
   * @returns {Promise<Object>} - Health status
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      throw new Error(`Health check failed: ${error.message}`);
    }
  }

  /**
   * Get scraping status
   * @returns {Promise<Object>} - Current status
   */
  async getStatus() {
    try {
      const response = await this.client.get('/status');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get status: ${error.message}`);
    }
  }

  /**
   * Get available brands
   * @returns {Promise<Object>} - Available brands
   */
  async getAvailableBrands() {
    try {
      const response = await this.client.get('/brands');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get available brands: ${error.message}`);
    }
  }

  /**
   * Scrape specific brands
   * @param {Array} brands - Array of brand names
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} - Scraping result
   */
  async scrapeBrands(brands, options = {}) {
    try {
      const response = await this.client.post('/brands/scrape', {
        brands,
        options
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to scrape brands: ${error.message}`);
    }
  }

  /**
   * Scrape specific brand models
   * @param {string} brandName - Brand name
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} - Scraping result
   */
  async scrapeBrandModels(brandName, options = {}) {
    try {
      const response = await this.client.post(`/brands/${brandName}/scrape`, {
        options
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to scrape brand models: ${error.message}`);
    }
  }

  /**
   * Scrape all brands
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} - Scraping result
   */
  async scrapeAll(options = {}) {
    try {
      const response = await this.client.post('/scrape/all', {
        options
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to scrape all brands: ${error.message}`);
    }
  }

  /**
   * Test scraping
   * @param {string} brandName - Brand name to test
   * @returns {Promise<Object>} - Test result
   */
  async testScraping(brandName = 'apple') {
    try {
      const response = await this.client.post('/scrape/test', {
        brandName
      });
      return response.data;
    } catch (error) {
      throw new Error(`Test scraping failed: ${error.message}`);
    }
  }

  /**
   * Get latest data
   * @returns {Promise<Object>} - Latest data
   */
  async getLatestData() {
    try {
      const response = await this.client.get('/data/latest');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get latest data: ${error.message}`);
    }
  }

  /**
   * Save data
   * @param {Object} data - Data to save
   * @param {string} filename - Filename
   * @returns {Promise<Object>} - Save result
   */
  async saveData(data, filename) {
    try {
      const response = await this.client.post('/data/save', {
        data,
        filename
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to save data: ${error.message}`);
    }
  }

  /**
   * Wait for server to be ready
   * @param {number} maxAttempts - Maximum attempts
   * @param {number} delay - Delay between attempts
   * @returns {Promise<boolean>} - True if server is ready
   */
  async waitForServer(maxAttempts = 30, delay = 2000) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.healthCheck();
        console.log('✅ Server is ready');
        return true;
      } catch (error) {
        console.log(`⏳ Waiting for server... (${i + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Server did not become ready within timeout');
  }
}
