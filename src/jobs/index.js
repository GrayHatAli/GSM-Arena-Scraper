import { JobQueue } from './JobQueue.js';
import { ScraperService } from '../services/ScraperService.js';
import * as db from '../database/models.js';
import { logProgress } from '../utils/ScraperUtils.js';

const scraperService = new ScraperService();
const jobQueue = new JobQueue();

async function handleBrandJob(payload) {
  if (!payload?.brand) {
    throw new Error('Brand name is required');
  }

  const brandName = payload.brand.toLowerCase();
  const scrapeOptions = { ...(payload.options || {}) };
  
  if (scrapeOptions.minYear) {
    logProgress(`JobQueue: scraping brand ${brandName} with minYear=${scrapeOptions.minYear}`, 'info');
  } else {
    logProgress(`JobQueue: scraping brand ${brandName}`, 'info');
  }
  
  await scraperService.scrapeBrands([brandName], scrapeOptions);

  const models = await db.getModelsByBrandName(brandName);
  const filtered = payload.options?.minYear
    ? models.filter(model => model.release_year && model.release_year >= payload.options.minYear)
    : models;

  return {
    brand: brandName,
    models: filtered.length
  };
}

async function handleDeviceSpecsJob(payload) {
  if (!payload?.deviceId) {
    throw new Error('deviceId is required');
  }

  logProgress(`JobQueue: fetching specifications for device ${payload.deviceId}`, 'info');
  const specs = await scraperService.getDeviceSpecificationsById(payload.deviceId);
  return {
    deviceId: payload.deviceId,
    hasSpecifications: !!specs
  };
}

async function handleBrandListJob(payload) {
  logProgress('JobQueue: scraping brand list from GSM Arena', 'info');
  
  try {
    // Scrape brands with retry logic and longer delays
    const brands = await scraperService.getAllBrands();
    
    if (!brands || brands.length === 0) {
      throw new Error('No brands returned from GSM Arena');
    }
    
    // Save brands to database
    for (const brand of brands) {
      await db.saveBrand({
        name: brand.name,
        display_name: brand.display_name || brand.name,
        url: brand.url || null,
        is_active: brand.is_active !== undefined ? brand.is_active : true,
        estimated_models: brand.estimated_models || 0
      });
    }
    
    logProgress(`JobQueue: saved ${brands.length} brands to database`, 'success');
    
    return {
      total_brands: brands.length,
      message: 'Brand list scraped and saved successfully'
    };
  } catch (error) {
    logProgress(`JobQueue: brand list scraping failed: ${error.message}`, 'error');
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

