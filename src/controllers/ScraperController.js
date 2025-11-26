// Scraper Controller - Handles all scraping operations

import { ScraperService } from '../services/ScraperService.js';
import { ResponseHelper } from '../utils/ResponseHelper.js';
import * as db from '../database/models.js';

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
      
      // Calculate total models from brands array
      const totalModels = result.brands.reduce((total, brand) => total + (brand.models?.length || 0), 0);
      
      // Return success even if no models found (this might be valid)
      const message = totalModels > 0 
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
      // Try to get from database first
      const dbModels = await db.searchModels(filters);
      
      if (dbModels && dbModels.length > 0) {
        // Convert database models to device format
        const devices = dbModels.map(model => ({
          deviceId: model.device_id || 'unknown',
          name: model.model_name,
          url: model.device_url,
          year: model.release_date ? parseInt(model.release_date.substring(0, 4)) : null,
          brand_name: model.brand_name
        }));
        
        return ResponseHelper.success(`Found ${devices.length} devices`, { devices });
      }
      
      // If no results in database, fall back to scraping (for backward compatibility)
      const devices = await this.scraperService.searchDevices(filters);
      return ResponseHelper.success(`Found ${devices.length} devices`, { devices });
    } catch (error) {
      return ResponseHelper.error('Failed to search devices', error.message);
    }
  }

  /**
   * Get brands from database
   * @param {Object} options - Query options
   * @returns {Object} - List of brands with models
   */
  async getBrands(options = {}) {
    try {
      const brands = await db.getBrands(options);
      
      // For each brand, get its models
      const brandsWithModels = await Promise.all(
        brands.map(async (brand) => {
          const models = await db.getModelsByBrandId(brand.id);
          return {
            ...brand,
            models: models.map(model => ({
              model_name: model.model_name,
              series: model.series,
              release_date: model.release_date,
              device_id: model.device_id,
              device_url: model.device_url,
              image_url: model.image_url
            }))
          };
        })
      );
      
      return ResponseHelper.success('Retrieved brands successfully', {
        brands: brandsWithModels,
        total_brands: brandsWithModels.length,
        total_models: brandsWithModels.reduce((total, brand) => total + (brand.models?.length || 0), 0)
      });
    } catch (error) {
      return ResponseHelper.error('Failed to get brands', error.message);
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
