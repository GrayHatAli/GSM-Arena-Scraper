/**
 * Database model operations
 */

import { getDatabase } from './db.js';
import { logProgress } from '../utils/ScraperUtils.js';

function normalizeBrandName(name = '') {
  return name.trim().toLowerCase();
}

function mapBrand(row) {
  if (!row) return null;
  return {
    ...row,
    is_active: row.is_active === 1,
    estimated_models: row.estimated_models || 0,
    last_scraped_at: row.last_scraped_at || null
  };
}

function mapModel(row) {
  if (!row) return null;
  // If release_year is already set, use it; otherwise try to extract from release_date
  let releaseYear = row.release_year;
  if (!releaseYear && row.release_date) {
    const releaseDateStr = String(row.release_date);
    // Try to extract 4-digit year from the string (could be "2025" or "Released 2025, September 09")
    const yearMatch = releaseDateStr.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      releaseYear = parseInt(yearMatch[1], 10);
    } else {
      // Fallback: try first 4 characters if they're all digits
      const firstFour = releaseDateStr.substring(0, 4);
      if (/^\d{4}$/.test(firstFour)) {
        releaseYear = parseInt(firstFour, 10);
      }
    }
  }
  return {
    ...row,
    release_year: releaseYear || null
  };
}

function parseJSONColumn(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

/**
 * Save or update a brand in the database
 * @param {Object} brand - Brand object with name, url, is_active
 * @returns {Promise<Object|null>} Saved brand object or null
 */
export async function saveBrand(brand) {
  const db = getDatabase();
  if (!db) {
    return null;
  }

  try {
    const normalizedName = normalizeBrandName(brand.name);
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO brands (name, display_name, url, is_active, estimated_models, last_scraped_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        display_name=excluded.display_name,
        url=excluded.url,
        is_active=excluded.is_active,
        estimated_models=COALESCE(excluded.estimated_models, brands.estimated_models),
        last_scraped_at=COALESCE(excluded.last_scraped_at, brands.last_scraped_at),
        updated_at=excluded.updated_at
    `);

    stmt.run(
      normalizedName,
      brand.display_name || brand.name,
      brand.url || null,
      brand.is_active === false ? 0 : 1,
      brand.estimated_models ?? null,
      brand.last_scraped_at || null,
      now
    );

    const row = db.prepare('SELECT * FROM brands WHERE name = ?').get(normalizedName);
    return mapBrand(row);
  } catch (error) {
    logProgress(`Error saving brand ${brand.name}: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Get all brands from database
 * @param {Object} options - Query options (is_active filter)
 * @returns {Promise<Array>} Array of brand objects
 */
export async function getBrands(options = {}) {
  const db = getDatabase();
  if (!db) {
    return [];
  }

  try {
    let query = 'SELECT * FROM brands';
    const params = [];

    if (options.is_active !== undefined) {
      query += ' WHERE is_active = ?';
      params.push(options.is_active ? 1 : 0);
    }

    query += ' ORDER BY name ASC';
    const rows = db.prepare(query).all(...params);
    return rows.map(mapBrand);
  } catch (error) {
    logProgress(`Error getting brands: ${error.message}`, 'error');
    return [];
  }
}

/**
 * Get a brand by name
 * @param {string} brandName - Brand name
 * @returns {Promise<Object|null>} Brand object or null
 */
export async function getBrandByName(brandName) {
  const db = getDatabase();
  if (!db) {
    return null;
  }

  try {
    const row = db.prepare('SELECT * FROM brands WHERE name = ?').get(normalizeBrandName(brandName));
    return mapBrand(row);
  } catch (error) {
    logProgress(`Error getting brand ${brandName}: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Save or update a model in the database
 * @param {Object} model - Model object
 * @returns {Promise<Object|null>} Saved model object or null
 */
export async function saveModel(model) {
  const db = getDatabase();
  if (!db) {
    return null;
  }

  try {
    // First, get or create the brand
    let brand = await getBrandByName(model.brand_name);
    if (!brand && model.brand_name) {
      brand = await saveBrand({
        name: model.brand_name,
        url: model.brand_url || null,
        is_active: true
      });
    }

    if (!brand) {
      logProgress(`Brand not found for model ${model.model_name}`, 'warn');
      return null;
    }

    const normalizedName = model.model_name.trim();
    // Use release_year if provided, otherwise try to extract from release_date
    let releaseYear = model.release_year || null;
    if (!releaseYear && model.release_date) {
      const releaseDateStr = String(model.release_date);
      // Try to extract 4-digit year from the string (could be "2025" or "Released 2025, September 09")
      const yearMatch = releaseDateStr.match(/\b(20\d{2})\b/);
      if (yearMatch) {
        releaseYear = parseInt(yearMatch[1], 10);
      } else {
        // Fallback: try first 4 characters if they're all digits
        const firstFour = releaseDateStr.substring(0, 4);
        if (/^\d{4}$/.test(firstFour)) {
          releaseYear = parseInt(firstFour, 10);
        }
      }
    }
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO models (brand_id, model_name, series, release_date, release_year, device_id, device_url, image_url, last_fetched_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        model_name=excluded.model_name,
        series=excluded.series,
        release_date=excluded.release_date,
        release_year=excluded.release_year,
        device_url=excluded.device_url,
        image_url=excluded.image_url,
        last_fetched_at=excluded.last_fetched_at,
        updated_at=excluded.updated_at
    `);

    stmt.run(
      brand.id,
      normalizedName,
      model.series || null,
      model.release_date || null,
      releaseYear || null,
      model.device_id || null,
      model.device_url || null,
      model.image_url || null,
      now,
      now
    );

    const row = db.prepare('SELECT m.*, b.name as brand_name FROM models m JOIN brands b ON m.brand_id = b.id WHERE m.device_id = ?').get(model.device_id);
    return mapModel(row);
  } catch (error) {
    logProgress(`Error saving model ${model.model_name}: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Get models by brand name
 * @param {string} brandName - Brand name
 * @returns {Promise<Array>} Array of model objects
 */
export async function getModelsByBrandName(brandName) {
  const db = getDatabase();
  if (!db) {
    return [];
  }

  try {
    const rows = db.prepare(
      `SELECT m.*, b.name as brand_name
       FROM models m
       JOIN brands b ON m.brand_id = b.id
       WHERE b.name = ?
       ORDER BY m.model_name ASC`
    ).all(normalizeBrandName(brandName));
    return rows.map(mapModel);
  } catch (error) {
    logProgress(`Error getting models for brand ${brandName}: ${error.message}`, 'error');
    return [];
  }
}

/**
 * Get model by device ID
 * @param {number} deviceId - Device ID
 * @returns {Promise<Object|null>} Model object or null
 */
export async function getModelByDeviceId(deviceId) {
  const db = getDatabase();
  if (!db) {
    return null;
  }

  try {
    const row = db.prepare(
      `SELECT m.*, b.name as brand_name
       FROM models m
       JOIN brands b ON m.brand_id = b.id
       WHERE m.device_id = ?`
    ).get(deviceId);
    return mapModel(row);
  } catch (error) {
    logProgress(`Error getting model for device ${deviceId}: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Save or update device specifications
 * @param {Object} specData - Specification data
 * @returns {Promise<Object|null>} Saved specification object or null
 */
export async function saveSpecifications(specData) {
  const db = getDatabase();
  if (!db) {
    return null;
  }

  try {
    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO specifications (device_id, specifications_json, image_url, ram_options, storage_options, color_options, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         specifications_json=excluded.specifications_json,
         image_url=excluded.image_url,
         ram_options=excluded.ram_options,
         storage_options=excluded.storage_options,
         color_options=excluded.color_options,
         updated_at=excluded.updated_at`
    );

    stmt.run(
      specData.device_id,
      JSON.stringify(specData.specifications || {}),
      specData.image_url || null,
      JSON.stringify(specData.ram_options || []),
      JSON.stringify(specData.storage_options || []),
      JSON.stringify(specData.color_options || []),
      now
    );

    const row = db.prepare('SELECT * FROM specifications WHERE device_id = ?').get(specData.device_id);
    return {
      ...row,
      specifications_json: parseJSONColumn(row?.specifications_json, {}),
      ram_options: parseJSONColumn(row?.ram_options, []),
      storage_options: parseJSONColumn(row?.storage_options, []),
      color_options: parseJSONColumn(row?.color_options, [])
    };
  } catch (error) {
    logProgress(`Error saving specifications for device ${specData.device_id}: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Get specifications by device ID
 * @param {number} deviceId - Device ID
 * @returns {Promise<Object|null>} Specification object or null
 */
export async function getSpecificationsByDeviceId(deviceId) {
  const db = getDatabase();
  if (!db) {
    return null;
  }

  try {
    const spec = db.prepare('SELECT * FROM specifications WHERE device_id = ?').get(deviceId);
    if (!spec) {
      return null;
    }

    return {
      device_id: spec.device_id,
      specifications: parseJSONColumn(spec.specifications_json, {}),
      image_url: spec.image_url,
      ram_options: parseJSONColumn(spec.ram_options, []),
      storage_options: parseJSONColumn(spec.storage_options, []),
      color_options: parseJSONColumn(spec.color_options, []),
      created_at: spec.created_at,
      updated_at: spec.updated_at
    };
  } catch (error) {
    logProgress(`Error getting specifications for device ${deviceId}: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Search models with filters
 * @param {Object} filters - Search filters (brand_name, minYear, excludeKeywords, keyword)
 * @returns {Promise<Array>} Array of matching models
 */
export async function searchModels(filters = {}) {
  const db = getDatabase();
  if (!db) {
    return [];
  }

  try {
    let query = `
      SELECT m.*, b.name as brand_name
      FROM models m
      JOIN brands b ON m.brand_id = b.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.brand_name || filters.keyword) {
      const term = normalizeBrandName(filters.brand_name || filters.keyword);
      query += ' AND b.name = ?';
      params.push(term);
    }

    if (filters.minYear) {
      query += ' AND (m.release_year IS NULL OR m.release_year >= ?)';
      params.push(filters.minYear);
    }

    if (filters.excludeKeywords && filters.excludeKeywords.length > 0) {
      filters.excludeKeywords.forEach(keyword => {
        query += ' AND LOWER(m.model_name) NOT LIKE ?';
        params.push(`%${keyword.toLowerCase()}%`);
      });
    }

    query += ' ORDER BY m.model_name ASC';
    const rows = db.prepare(query).all(...params);
    return rows.map(mapModel);
  } catch (error) {
    logProgress(`Error searching models: ${error.message}`, 'error');
    return [];
  }
}

export async function getModelsForBrandAndYear(brandName, minYear) {
  const models = await getModelsByBrandName(brandName);
  if (!models || models.length === 0) {
    return [];
  }
  if (!minYear) {
    return models;
  }
  return models.filter(model => !model.release_year || model.release_year >= minYear);
}

