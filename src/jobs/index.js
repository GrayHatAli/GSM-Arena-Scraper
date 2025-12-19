import { JobQueue } from './JobQueue.js';
import { ScraperService } from '../services/ScraperService.js';
import * as db from '../database/models.js';
import { logProgress } from '../utils/ScraperUtils.js';

const scraperService = new ScraperService();
const jobQueue = new JobQueue();

async function handleBrandJob(payload, job, logger) {
  if (!payload?.brand) {
    logger.error('Brand name is required in payload');
    throw new Error('Brand name is required');
  }

  const brandName = payload.brand.toLowerCase();
  const scrapeOptions = { ...(payload.options || {}) };
  
  logger.startStep('brand_scraping_init', {
    brand: brandName,
    options: scrapeOptions
  });

  if (scrapeOptions.minYear) {
    logger.info(`Starting brand scraping with year filter`, {
      brand: brandName,
      minYear: scrapeOptions.minYear
    });
  } else {
    logger.info(`Starting brand scraping`, { brand: brandName });
  }
  
  try {
    logger.debug('Calling ScraperService.scrapeBrands');
    await scraperService.scrapeBrands([brandName], scrapeOptions);
    logger.endStep('brand_scraping_init', { success: true });

    logger.startStep('data_retrieval', { brand: brandName });
    
    const models = await db.getModelsByBrandName(brandName);
    logger.debug(`Retrieved ${models.length} models from database`);
    
    const filtered = payload.options?.minYear
      ? models.filter(model => model.release_year && model.release_year >= payload.options.minYear)
      : models;

    logger.endStep('data_retrieval', {
      totalModels: models.length,
      filteredModels: filtered.length,
      filterApplied: !!payload.options?.minYear
    });

    const result = {
      brand: brandName,
      models: filtered.length
    };

    logger.stats({
      brand: brandName,
      totalModels: models.length,
      filteredModels: filtered.length,
      minYear: payload.options?.minYear || null
    });

    return result;

  } catch (error) {
    logger.error(`Brand scraping failed`, {
      brand: brandName,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

async function handleDeviceSpecsJob(payload, job, logger) {
  if (!payload?.deviceId) {
    logger.error('deviceId is required in payload');
    throw new Error('deviceId is required');
  }

  const deviceId = payload.deviceId;
  
  logger.startStep('device_specs_init', { deviceId });
  logger.info(`Starting device specifications fetch`, { deviceId });

  try {
    logger.debug('Calling ScraperService.getDeviceSpecificationsById');
    const specs = await scraperService.getDeviceSpecificationsById(deviceId);
    
    logger.endStep('device_specs_init', {
      success: true,
      hasSpecifications: !!specs
    });

    const result = {
      deviceId: deviceId,
      hasSpecifications: !!specs
    };

    logger.stats({
      deviceId: deviceId,
      specificationsFound: !!specs,
      specCount: specs ? Object.keys(specs.specifications || {}).length : 0
    });

    return result;

  } catch (error) {
    logger.error(`Device specifications fetch failed`, {
      deviceId: deviceId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

async function handleBrandListJob(payload, job, logger) {
  logger.startStep('brand_list_scraping', {});
  logger.info('Starting brand list scraping from GSM Arena');
  
  try {
    logger.debug('Calling ScraperService.getAllBrands');
    
    // Scrape brands with retry logic and longer delays
    const brands = await scraperService.getAllBrands();
    
    if (!brands || brands.length === 0) {
      logger.error('No brands returned from GSM Arena');
      throw new Error('No brands returned from GSM Arena');
    }
    
    logger.progress(`Retrieved ${brands.length} brands from GSM Arena`, {
      brandsCount: brands.length
    });

    logger.startStep('database_save', { brandsCount: brands.length });
    
    // Save brands to database
    let savedCount = 0;
    for (const brand of brands) {
      try {
        await db.saveBrand({
          name: brand.name,
          display_name: brand.display_name || brand.name,
          url: brand.url || null,
          is_active: brand.is_active !== undefined ? brand.is_active : true,
          estimated_models: brand.estimated_models || 0
        });
        savedCount++;
        
        if (savedCount % 10 === 0) {
          logger.progress(`Saved ${savedCount}/${brands.length} brands to database`);
        }
      } catch (error) {
        logger.warn(`Failed to save brand: ${brand.name}`, {
          brand: brand.name,
          error: error.message
        });
      }
    }
    
    logger.endStep('database_save', {
      savedCount,
      totalCount: brands.length,
      failedCount: brands.length - savedCount
    });

    const result = {
      total_brands: savedCount,
      failed_brands: brands.length - savedCount,
      message: 'Brand list scraped and saved successfully'
    };

    logger.success(`Brand list scraping completed successfully`, result);
    logger.stats(result);

    return result;
    
  } catch (error) {
    logger.error(`Brand list scraping failed`, {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

jobQueue.registerHandler('brand_scrape', handleBrandJob);
jobQueue.registerHandler('device_specs', handleDeviceSpecsJob);
jobQueue.registerHandler('brand_list', handleBrandListJob);

export function startJobQueue() {
  jobQueue.start();
  logProgress('Job queue started', 'info');
}

export function enqueueBrandScrape(brand, options = {}) {
  return jobQueue.enqueue('brand_scrape', { brand, options }, { deduplicate: true });
}

export function enqueueDeviceSpecs(deviceId) {
  return jobQueue.enqueue('device_specs', { deviceId }, { deduplicate: true });
}

export function enqueueBrandList() {
  return jobQueue.enqueue('brand_list', {}, { deduplicate: true });
}

export function getJob(jobId) {
  return jobQueue.getJobById(jobId);
}

export function getJobs(filters = {}) {
  return jobQueue.getJobs(filters);
}

