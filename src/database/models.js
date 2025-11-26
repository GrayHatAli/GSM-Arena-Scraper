/**
 * Database model operations
 */

import { getPool } from './db.js';
import { logProgress } from '../utils.js';

/**
 * Save or update a brand in the database
 * @param {Object} brand - Brand object with name, url, is_active
 * @returns {Promise<Object|null>} Saved brand object or null
 */
export async function saveBrand(brand) {
  const pool = getPool();
  if (!pool) {
    return null;
  }

  try {
    const result = await pool.query(
      `INSERT INTO brands (name, url, is_active, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (name) 
       DO UPDATE SET url = EXCLUDED.url, is_active = EXCLUDED.is_active, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [brand.name, brand.url || null, brand.is_active !== undefined ? brand.is_active : true]
    );

    return result.rows[0];
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
  const pool = getPool();
  if (!pool) {
    return [];
  }

  try {
    let query = 'SELECT * FROM brands';
    const params = [];
    
    if (options.is_active !== undefined) {
      query += ' WHERE is_active = $1';
      params.push(options.is_active);
    }
    
    query += ' ORDER BY name ASC';
    
    const result = await pool.query(query, params);
    return result.rows;
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
  const pool = getPool();
  if (!pool) {
    return null;
  }

  try {
    const result = await pool.query(
      'SELECT * FROM brands WHERE name = $1',
      [brandName]
    );
    return result.rows[0] || null;
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
  const pool = getPool();
  if (!pool) {
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

    const result = await pool.query(
      `INSERT INTO models (brand_id, model_name, series, release_date, device_id, device_url, image_url, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       ON CONFLICT (device_id) 
       DO UPDATE SET 
         model_name = EXCLUDED.model_name,
         series = EXCLUDED.series,
         release_date = EXCLUDED.release_date,
         device_url = EXCLUDED.device_url,
         image_url = EXCLUDED.image_url,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        brand.id,
        model.model_name,
        model.series || null,
        model.release_date || null,
        model.device_id || null,
        model.device_url || null,
        model.image_url || null
      ]
    );

    return result.rows[0];
  } catch (error) {
    logProgress(`Error saving model ${model.model_name}: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Get models by brand ID
 * @param {number} brandId - Brand ID
 * @returns {Promise<Array>} Array of model objects
 */
export async function getModelsByBrandId(brandId) {
  const pool = getPool();
  if (!pool) {
    return [];
  }

  try {
    const result = await pool.query(
      'SELECT * FROM models WHERE brand_id = $1 ORDER BY model_name ASC',
      [brandId]
    );
    return result.rows;
  } catch (error) {
    logProgress(`Error getting models for brand ${brandId}: ${error.message}`, 'error');
    return [];
  }
}

/**
 * Get models by brand name
 * @param {string} brandName - Brand name
 * @returns {Promise<Array>} Array of model objects
 */
export async function getModelsByBrandName(brandName) {
  const pool = getPool();
  if (!pool) {
    return [];
  }

  try {
    const result = await pool.query(
      `SELECT m.*, b.name as brand_name 
       FROM models m
       JOIN brands b ON m.brand_id = b.id
       WHERE b.name = $1
       ORDER BY m.model_name ASC`,
      [brandName]
    );
    return result.rows;
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
  const pool = getPool();
  if (!pool) {
    return null;
  }

  try {
    const result = await pool.query(
      `SELECT m.*, b.name as brand_name 
       FROM models m
       JOIN brands b ON m.brand_id = b.id
       WHERE m.device_id = $1`,
      [deviceId]
    );
    return result.rows[0] || null;
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
  const pool = getPool();
  if (!pool) {
    return null;
  }

  try {
    const result = await pool.query(
      `INSERT INTO specifications (device_id, specifications_json, image_url, ram_options, storage_options, color_options, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (device_id) 
       DO UPDATE SET 
         specifications_json = EXCLUDED.specifications_json,
         image_url = EXCLUDED.image_url,
         ram_options = EXCLUDED.ram_options,
         storage_options = EXCLUDED.storage_options,
         color_options = EXCLUDED.color_options,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        specData.device_id,
        JSON.stringify(specData.specifications || {}),
        specData.image_url || null,
        JSON.stringify(specData.ram_options || []),
        JSON.stringify(specData.storage_options || []),
        JSON.stringify(specData.color_options || [])
      ]
    );

    return result.rows[0];
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
  const pool = getPool();
  if (!pool) {
    return null;
  }

  try {
    const result = await pool.query(
      'SELECT * FROM specifications WHERE device_id = $1',
      [deviceId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const spec = result.rows[0];
    return {
      device_id: spec.device_id,
      specifications: spec.specifications_json,
      image_url: spec.image_url,
      ram_options: spec.ram_options,
      storage_options: spec.storage_options,
      color_options: spec.color_options,
      created_at: spec.created_at,
      updated_at: spec.updated_at
    };
  } catch (error) {
    logProgress(`Error getting specifications for device ${deviceId}: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Check if specifications exist for a device
 * @param {number} deviceId - Device ID
 * @returns {Promise<boolean>} True if specifications exist
 */
export async function hasSpecifications(deviceId) {
  const pool = getPool();
  if (!pool) {
    return false;
  }

  try {
    const result = await pool.query(
      'SELECT 1 FROM specifications WHERE device_id = $1 LIMIT 1',
      [deviceId]
    );
    return result.rows.length > 0;
  } catch (error) {
    logProgress(`Error checking specifications for device ${deviceId}: ${error.message}`, 'error');
    return false;
  }
}

/**
 * Search models with filters
 * @param {Object} filters - Search filters (brand_name, minYear, excludeKeywords, keyword)
 * @returns {Promise<Array>} Array of matching models
 */
export async function searchModels(filters = {}) {
  const pool = getPool();
  if (!pool) {
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
    let paramIndex = 1;

    // Filter by brand name
    if (filters.brand_name || filters.keyword) {
      const searchTerm = filters.brand_name || filters.keyword;
      query += ` AND LOWER(b.name) = LOWER($${paramIndex})`;
      params.push(searchTerm);
      paramIndex++;
    }

    // Filter by minimum year
    if (filters.minYear) {
      query += ` AND (
        m.release_date IS NULL OR 
        CAST(SUBSTRING(m.release_date FROM '\\d{4}') AS INTEGER) >= $${paramIndex}
      )`;
      params.push(filters.minYear);
      paramIndex++;
    }

    // Exclude keywords
    if (filters.excludeKeywords && filters.excludeKeywords.length > 0) {
      filters.excludeKeywords.forEach((keyword, index) => {
        query += ` AND LOWER(m.model_name) NOT LIKE LOWER($${paramIndex})`;
        params.push(`%${keyword}%`);
        paramIndex++;
      });
    }

    query += ' ORDER BY m.model_name ASC';

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    logProgress(`Error searching models: ${error.message}`, 'error');
    return [];
  }
}

