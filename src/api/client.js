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
   * Scrape brands
   * @param {Array} brands - Array of brand names (optional - if empty, scrapes all brands)
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} - Scraping result
   */
  async scrapeBrands(brands = [], options = {}) {
    try {
      const response = await this.client.post('/brands', {
        brands,
        options
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to scrape brands: ${error.message}`);
    }
  }

  /**
   * Search devices with filters
   * @param {Object} filters - Search filters
   * @param {string} filters.keyword - Search keyword
   * @param {string} filters.brand_name - Filter by brand name
   * @param {number} filters.minYear - Minimum year filter
   * @param {Array} filters.excludeKeywords - Keywords to exclude
   * @returns {Promise<Object>} - Search results with devices
   */
  async searchDevices(filters = {}) {
    try {
      const response = await this.client.post('/devices/search', filters);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to search devices: ${error.message}`);
    }
  }

  /**
   * Get device specifications
   * @param {string} deviceId - Device ID
   * @returns {Promise<Object>} - Device specifications
   */
  async getDeviceSpecifications(deviceId) {
    try {
      const response = await this.client.get(`/devices/${deviceId}/specifications`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get device specifications: ${error.message}`);
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
