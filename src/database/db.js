/**
 * Database connection management
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { logProgress } from '../utils.js';

let dbInstance = null;
let pool = null;

const DEFAULT_DB_NAME = 'gsmarena.sqlite';

function resolveDatabasePath() {
  const customPath = process.env.SQLITE_DB_PATH;
  if (customPath) {
    return path.isAbsolute(customPath) ? customPath : path.join(process.cwd(), customPath);
  }

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, DEFAULT_DB_NAME);
}

class SQLitePool {
  constructor(db) {
    this.db = db;
  }

  /**
   * Execute SQL query with positional parameters.
   * Mimics pg.Pool.query returning an object with rows array.
   * @param {string} sql
   * @param {Array} params
   * @returns {{rows: Array}}
   */
  query(sql, params = []) {
    const statement = this.db.prepare(sql);
    const trimmed = sql.trim().toLowerCase();

    if (trimmed.startsWith('select') || trimmed.startsWith('pragma')) {
      const rows = statement.all(params);
      return { rows };
    }

    const result = statement.run(params);
    return {
      rows: [],
      lastInsertRowid: result.lastInsertRowid,
      changes: result.changes
    };
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  close() {
    this.db.close();
  }
}

/**
 * Get database connection pool (SQLite wrapper)
 * @returns {SQLitePool|null}
 */
export function getPool() {
  if (!pool) {
    try {
      const dbPath = resolveDatabasePath();
      dbInstance = new Database(dbPath);
      dbInstance.pragma('journal_mode = WAL');
      dbInstance.pragma('foreign_keys = ON');
      pool = new SQLitePool(dbInstance);
      logProgress(`SQLite database opened at ${dbPath}`, 'success');
    } catch (error) {
      logProgress(`Failed to open SQLite database: ${error.message}`, 'error');
      return null;
    }
  }

  return pool;
}

export function getDatabase() {
  if (!dbInstance) {
    getPool();
  }
  return dbInstance;
}

/**
 * Test database connection
 * @returns {Promise<boolean>} True if connection successful
 */
export async function testConnection() {
  const dbPool = getPool();
  if (!dbPool) {
    return false;
  }

  try {
    dbPool.query('SELECT 1');
    logProgress('SQLite connection test successful', 'success');
    return true;
  } catch (error) {
    logProgress(`SQLite connection test failed: ${error.message}`, 'error');
    return false;
  }
}

/**
 * Close database connection pool
 * @returns {Promise<void>}
 */
export async function closePool() {
  if (pool) {
    pool.close();
    pool = null;
    dbInstance = null;
    logProgress('SQLite database connection closed', 'info');
  }
}

