// Scraper Controller - Handles all scraping operations

import { ScraperService } from '../services/ScraperService.js';
import { ResponseHelper } from '../utils/ResponseHelper.js';
import * as db from '../database/models.js';
import { CONFIG } from '../config/config.js';
import { enqueueBrandScrape, enqueueDeviceSpecs, getJob } from '../jobs/index.js';

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
      const minYear = options.minYear ? parseInt(options.minYear, 10) : null;
      const normalizedInput = Array.isArray(brands) ? brands : CONFIG.DEFAULT_TARGET_BRANDS;
      if (!normalizedInput || normalizedInput.length === 0) {
        return ResponseHelper.validationError('At least one brand must be provided in the request body', [
          'Provide brands: [] with at least one brand name'
        ]);
      }

      const requestedBrands = normalizedInput.map(brand => brand.toLowerCase());

      const ready = [];
      const pending = [];

      for (const brandName of requestedBrands) {
        const models = await db.getModelsForBrandAndYear(brandName, minYear);
        if (models.length > 0) {
          ready.push({
            name: brandName,
            models: models.map(model => ({
              model_name: model.model_name,
              series: model.series,
              release_date: model.release_date,
              device_id: model.device_id,
              device_url: model.device_url,
              image_url: model.image_url
            }))
          });
          continue;
        }

        const brandMeta = await db.getBrandByName(brandName);
        const estimatedModels = brandMeta?.estimated_models || CONFIG.MODELS_PER_BRAND || 25;
        const averageSecondsPerModel = 4; // includes random 1-5s delays
        const etaMinutes = Math.max(1, Math.ceil((estimatedModels * averageSecondsPerModel) / 60));

        const job = await enqueueBrandScrape(brandName, { minYear });
        pending.push({
          brand: brandName,
          jobId: job?.id,
          eta_minutes: etaMinutes
        });
      }

      if (ready.length > 0 && pending.length === 0) {
        const totalBrands = ready.length;
        const totalModels = ready.reduce((sum, brand) => sum + (brand.models?.length || 0), 0);
        return ResponseHelper.success('Brand data retrieved from database', {
          brands: ready,
          total_brands: totalBrands,
          total_models: totalModels,
          minYear
        });
      }

      if (ready.length > 0 && pending.length > 0) {
        const totalModels = ready.reduce((sum, brand) => sum + (brand.models?.length || 0), 0);
        return ResponseHelper.success(
          'Partial data returned. Remaining brands are being fetched in background.',
          {
            brands: ready,
            pending,
            total_brands: ready.length,
            total_models: totalModels,
            minYear
          },
          206
        );
      }

      return ResponseHelper.accepted(
        'Data is being fetched. Estimated completion time is based on the number of models per brand. Please retry after the suggested interval.',
        { pending, minYear }
      );
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
      const cached = await db.getSpecificationsByDeviceId(deviceId);
      if (cached) {
        return ResponseHelper.success('Retrieved device specifications from database', cached);
      }

      const job = await enqueueDeviceSpecs(deviceId);
      return ResponseHelper.accepted(
        'Device specifications are being fetched. Please retry in a few minutes.',
        {
          deviceId,
          jobId: job?.id
        }
      );
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

  /**
   * Get job status by ID
   * @param {string} jobId
   * @returns {Object}
   */
  async getJobStatus(jobId) {
    try {
      const job = getJob(jobId);
      if (!job) {
        return ResponseHelper.notFound('Job not found');
      }
      return ResponseHelper.success('Job status retrieved', job);
    } catch (error) {
      return ResponseHelper.error('Failed to get job status', error.message);
    }
  }
}
