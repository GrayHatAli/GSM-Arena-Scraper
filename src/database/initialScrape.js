/**
 * Initial scraping logic to populate database with brands and models
 * This runs on startup to ensure database is populated
 */

import { ScraperService } from '../services/ScraperService.js';
import * as db from './models.js';
import { runMigrations } from './migrations.js';
import { testConnection } from './db.js';
import { logProgress } from '../utils.js';

let isScraping = false;
let scrapePromise = null;

/**
 * Check if database needs initial scraping
 * @returns {Promise<boolean>} True if scraping is needed
 */
export async function needsInitialScrape() {
  try {
    const brands = await db.getBrands();
    const models = await db.getModelsByBrandId(1); // Check if any models exist
    
    // If we have brands but no models, or no brands at all, we need to scrape
    return brands.length === 0 || (brands.length > 0 && models.length === 0);
  } catch (error) {
    logProgress(`Error checking if initial scrape is needed: ${error.message}`, 'error');
    // If there's an error, assume we need to scrape
    return true;
  }
}

/**
 * Run initial scraping to populate database
 * This scrapes all brands and their models (without specifications)
 * @returns {Promise<boolean>} True if scraping completed successfully
 */
export async function runInitialScrape() {
  // If already scraping, return the existing promise
  if (isScraping && scrapePromise) {
    logProgress('Initial scrape already in progress, waiting...', 'info');
    return scrapePromise;
  }

  // If already completed, return immediately
  if (!isScraping && scrapePromise) {
    return scrapePromise;
  }

  isScraping = true;
  scrapePromise = (async () => {
    try {
      logProgress('Starting initial database scraping...', 'info');

      // Test database connection
      const dbConnected = await testConnection();
      if (!dbConnected) {
        logProgress('Database not available, skipping initial scrape', 'warn');
        isScraping = false;
        return false;
      }

      // Run migrations
      await runMigrations();

      // Check if we need to scrape
      const needsScrape = await needsInitialScrape();
      if (!needsScrape) {
        logProgress('Database already populated, skipping initial scrape', 'info');
        isScraping = false;
        return true;
      }

      logProgress('Database needs initial population, starting scrape...', 'info');

      // Create scraper service
      const scraperService = new ScraperService();

      // Get all brands
      logProgress('Fetching all brands...', 'info');
      const allBrands = await scraperService.getAllBrands();
      logProgress(`Found ${allBrands.length} brands`, 'success');

      // Save all brands to database
      for (const brand of allBrands) {
        await db.saveBrand({
          name: brand.name,
          url: brand.url || null,
          is_active: brand.is_active !== undefined ? brand.is_active : true
        });
      }
      logProgress(`Saved ${allBrands.length} brands to database`, 'success');

      // Scrape models for each brand (without specifications)
      let totalModels = 0;
      for (let i = 0; i < allBrands.length; i++) {
        const brand = allBrands[i];
        try {
          logProgress(`Scraping models for brand ${i + 1}/${allBrands.length}: ${brand.name}`, 'info');
          
          const brandData = await scraperService.scrapeBrand(brand, {
            // Don't limit models per brand - scrape all
            // Don't apply year filters - get all models
            // Don't exclude keywords - get all models
          });

          totalModels += brandData.models?.length || 0;
          logProgress(`Scraped ${brandData.models?.length || 0} models for ${brand.name}`, 'success');

          // Add delay between brands to avoid rate limiting
          if (i < allBrands.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        } catch (error) {
          logProgress(`Error scraping brand ${brand.name}: ${error.message}`, 'error');
          // Continue with next brand
        }
      }

      logProgress(`Initial scraping completed! Total models: ${totalModels}`, 'success');
      isScraping = false;
      return true;
    } catch (error) {
      logProgress(`Initial scraping failed: ${error.message}`, 'error');
      isScraping = false;
      return false;
    }
  })();

  return scrapePromise;
}

/**
 * Run initial scrape in background (non-blocking)
 */
export function runInitialScrapeInBackground() {
  // Don't await - let it run in background
  runInitialScrape().catch(error => {
    logProgress(`Background initial scrape error: ${error.message}`, 'error');
  });
}

