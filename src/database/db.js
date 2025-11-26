/**
 * Database connection management
 */

import pg from 'pg';
import { logProgress } from '../utils.js';

const { Pool } = pg;

let pool = null;

/**
 * Get database connection pool
 * @returns {pg.Pool} Database pool instance
 */
export function getPool() {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      logProgress('DATABASE_URL not set, database operations will be disabled', 'warn');
      return null;
    }

    try {
      pool = new Pool({
        connectionString: databaseUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      pool.on('error', (err) => {
        logProgress(`Unexpected error on idle client: ${err.message}`, 'error');
      });

      logProgress('Database connection pool created', 'success');
    } catch (error) {
      logProgress(`Failed to create database pool: ${error.message}`, 'error');
      return null;
    }
  }

  return pool;
}

/**
 * Test database connection
 * @returns {Promise<boolean>} True if connection successful
 */
export async function testConnection() {
  const pool = getPool();
  if (!pool) {
    return false;
  }

  try {
    const result = await pool.query('SELECT NOW()');
    logProgress('Database connection test successful', 'success');
    return true;
  } catch (error) {
    logProgress(`Database connection test failed: ${error.message}`, 'error');
    return false;
  }
}

/**
 * Close database connection pool
 * @returns {Promise<void>}
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logProgress('Database connection pool closed', 'info');
  }
}

