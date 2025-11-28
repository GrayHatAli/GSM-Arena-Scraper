// Scraper Controller - Handles all scraping operations

import { ScraperService } from '../services/ScraperService.js';
import { ResponseHelper } from '../utils/ResponseHelper.js';
import * as db from '../database/models.js';
import { CONFIG } from '../config/config.js';
import { enqueueBrandScrape, enqueueDeviceSpecs, getJob, getJobs } from '../jobs/index.js';
import { logProgress } from '../utils.js';

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
      
      // Treat undefined, null, or empty array as "scrape all brands"
      // If brands is provided and is a non-empty array, use it; otherwise scrape all brands
      let requestedBrands = [];
      if (brands && Array.isArray(brands) && brands.length > 0) {
        requestedBrands = brands.map(brand => brand.toLowerCase());
      } else {
        // No brands specified - scrape all brands from database
        const allBrands = await db.getBrands({ is_active: true });
        requestedBrands = allBrands.map(brand => brand.name.toLowerCase());
        
        if (requestedBrands.length === 0) {
          return ResponseHelper.error('No brands available in database. Please wait for initial brand synchronization to complete.');
        }
      }

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
   * Get devices for a specific brand
   * @param {string} brandName - Brand name
   * @param {Object} options - Scraping options (minYear, etc.)
   * @returns {Object} - Devices result
   */
  async getBrandDevices(brandName, options = {}) {
    try {
      const minYear = options.minYear ? parseInt(options.minYear, 10) : null;
      const normalizedBrandName = brandName.toLowerCase();

      // Check if models exist in database for this brand
      const models = await db.getModelsForBrandAndYear(normalizedBrandName, minYear);
      
      if (models.length > 0) {
        // Data exists in database, return it
        return ResponseHelper.success('Brand devices retrieved from database', {
          brand: normalizedBrandName,
          models: models.map(model => ({
            model_name: model.model_name,
            series: model.series,
            release_date: model.release_date,
            device_id: model.device_id,
            device_url: model.device_url,
            image_url: model.image_url
          })),
          total_models: models.length,
          minYear
        });
      }

      // Data not in database, enqueue job
      const brandMeta = await db.getBrandByName(normalizedBrandName);
      if (!brandMeta) {
        return ResponseHelper.error(`Brand '${brandName}' not found in database. Please ensure brands are synced first.`);
      }

      const estimatedModels = brandMeta?.estimated_models || CONFIG.MODELS_PER_BRAND || 25;
      const averageSecondsPerModel = 4; // includes random 1-5s delays
      const etaMinutes = Math.max(1, Math.ceil((estimatedModels * averageSecondsPerModel) / 60));

      const job = await enqueueBrandScrape(normalizedBrandName, { minYear });
      
      return ResponseHelper.accepted(
        'Data is being fetched. Estimated completion time is based on the number of models to be extracted. Please retry after the suggested interval.',
        {
          brand: normalizedBrandName,
          jobId: job?.id,
          eta_minutes: etaMinutes,
          minYear
        }
      );
    } catch (error) {
      return ResponseHelper.error('Failed to get brand devices', error.message);
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
   * Get brands from database or scrape if empty
   * @param {Object} options - Query options
   * @returns {Object} - List of brands (name and URL only)
   */
  async getBrands(options = {}) {
    try {
      // Check if brands table is empty
      const existingBrands = await db.getBrands(options);
      
      if (existingBrands.length === 0) {
        // Database is empty, scrape brands from site
        logProgress('Brands table is empty, scraping brands from site...', 'info');
        const scrapedBrands = await this.scraperService.getAllBrands();
        
        // Save only brand_name and brand_url to database
        for (const brand of scrapedBrands) {
          await db.saveBrand({
            name: brand.name,
            display_name: brand.display_name || brand.name,
            url: brand.url || null,
            is_active: brand.is_active !== undefined ? brand.is_active : true,
            estimated_models: brand.estimated_models || 0
          });
        }
        
        logProgress(`Scraped and saved ${scrapedBrands.length} brands to database`, 'success');
        
        // Return scraped brands with only name and URL
        return ResponseHelper.success('Brands scraped and saved successfully', {
          brands: scrapedBrands.map(brand => ({
            brand_name: brand.display_name || brand.name,
            brand_url: brand.url
          })),
          total_brands: scrapedBrands.length
        });
      }
      
      // Database has brands, read from database
      return ResponseHelper.success('Retrieved brands successfully', {
        brands: existingBrands.map(brand => ({
          brand_name: brand.display_name || brand.name,
          brand_url: brand.url
        })),
        total_brands: existingBrands.length
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

  /**
   * Get list of jobs with optional filters
   * @param {Object} filters - Optional filters (status, job_type, limit)
   * @returns {Object}
   */
  async getJobsList(filters = {}) {
    try {
      const jobs = getJobs(filters);
      return ResponseHelper.success('Jobs retrieved successfully', {
        jobs,
        count: jobs.length,
        filters
      });
    } catch (error) {
      return ResponseHelper.error('Failed to get jobs list', error.message);
    }
  }
}
