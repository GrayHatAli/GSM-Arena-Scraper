/**
 * Database migrations
 */

import { getPool } from './db.js';
import { SCHEMA } from './schema.js';
import { logProgress } from '../utils/ScraperUtils.js';

/**
 * Run all migrations
 * @returns {Promise<boolean>} True if migrations successful
 */
export async function runMigrations() {
  const pool = getPool();
  if (!pool) {
    logProgress('Database pool not available, skipping migrations', 'warn');
    return false;
  }

  try {
    logProgress('Running database migrations...', 'info');

    // Create brands table
    pool.exec(SCHEMA.brands);
    logProgress('Brands table created/verified', 'success');

    // Create models table
    pool.exec(SCHEMA.models);
    logProgress('Models table created/verified', 'success');

    // Create specifications table
    pool.exec(SCHEMA.specifications);
    logProgress('Specifications table created/verified', 'success');

    // Create jobs table
    pool.exec(SCHEMA.jobs);
    logProgress('Jobs table created/verified', 'success');

    logProgress('All migrations completed successfully', 'success');
    return true;
  } catch (error) {
    logProgress(`Migration failed: ${error.message}`, 'error');
    return false;
  }
}

