// Utility functions for GSM Arena Scraper

import fs from 'fs/promises';
import path from 'path';

/**
 * Delay function for rate limiting
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} - Promise that resolves after delay
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create directory if it doesn't exist
 * @param {string} dirPath - Directory path
 */
export const ensureDir = async (dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
};

/**
 * Save data to JSON file
 * @param {Object} data - Data to save
 * @param {string} filePath - File path
 */
export const saveToFile = async (data, filePath) => {
  try {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`💾 Data saved to: ${filePath}`);
  } catch (error) {
    console.error('❌ Error saving file:', error.message);
    throw error;
  }
};

/**
 * Extract year from model name or URL
 * @param {string} modelName - Model name
 * @param {string} url - Model URL
 * @returns {number|null} - Extracted year or null
 */
export const extractYear = (modelName, url) => {
  // Try to extract from model name first
  const nameMatch = modelName.match(/(\d{4})/);
  if (nameMatch) {
    return parseInt(nameMatch[1]);
  }

  // Try to extract from URL
  const urlMatch = url.match(/(\d{4})/);
  if (urlMatch) {
    return parseInt(urlMatch[1]);
  }

  return null;
};

/**
 * Check if device should be excluded based on keywords
 * @param {string} modelName - Model name
 * @param {Array} excludeKeywords - Keywords to exclude
 * @returns {boolean} - True if should be excluded
 */
export const shouldExcludeDevice = (modelName, excludeKeywords) => {
  const lowerName = modelName.toLowerCase();
  return excludeKeywords.some(keyword => lowerName.includes(keyword));
};

/**
 * Extract RAM and Storage options from specifications
 * @param {Object} specs - Specifications object
 * @returns {Object} - RAM and Storage options
 */
export const extractRamStorageOptions = (specs) => {
  let ramOptions = [6, 8]; // default
  let storageOptions = [128, 256]; // default

  // Extract RAM
  if (specs['RAM'] || specs['Memory']) {
    const ramSpec = specs['RAM'] || specs['Memory'];
    const ramMatch = ramSpec.match(/(\d+)\s*GB/i);
    if (ramMatch) {
      const ram = parseInt(ramMatch[1]);
      ramOptions = [ram, ram + 2, ram + 4].filter(r => r <= 16);
    }
  }

  // Extract Storage
  if (specs['Internal'] || specs['Storage']) {
    const storageSpec = specs['Internal'] || specs['Storage'];
    const storageMatch = storageSpec.match(/(\d+)\s*GB/i);
    if (storageMatch) {
      const storage = parseInt(storageMatch[1]);
      storageOptions = [storage, storage * 2, storage * 4].filter(s => s <= 1024);
    }
  }

  return {
    ram_options: ramOptions,
    storage_options: storageOptions
  };
};

/**
 * Format specifications for database
 * @param {Object} rawSpecs - Raw specifications from website
 * @returns {Object} - Formatted specifications
 */
export const formatSpecifications = (rawSpecs) => {
  const formatted = {};
  
  // Important specifications to keep
  const importantSpecs = [
    'Battery', 'Main Camera', 'Selfie camera', 'Display', 
    'Chipset', 'Weight', 'OS', 'Display type', 'RAM',
    'Internal', 'Storage', 'Processor', 'CPU', 'GPU'
  ];
  
  importantSpecs.forEach(spec => {
    if (rawSpecs[spec]) {
      const key = spec.toLowerCase().replace(/\s+/g, '_');
      formatted[key] = rawSpecs[spec];
    }
  });
  
  return formatted;
};

/**
 * Generate fallback data for missing information
 * @param {string} brandName - Brand name
 * @param {string} modelName - Model name
 * @returns {Object} - Fallback data
 */
export const generateFallbackData = (brandName, modelName) => {
  return {
    ram_options: [6, 8],
    storage_options: [128, 256],
    color_options: ['Black', 'White'],
    specifications: {},
    image_url: null
  };
};

/**
 * Log progress with timestamp
 * @param {string} message - Message to log
 * @param {string} level - Log level (info, success, error, warning)
 */
export const logProgress = (message, level = 'info') => {
  const timestamp = new Date().toLocaleTimeString();
  const icons = {
    info: '📱',
    success: '✅',
    error: '❌',
    warning: '⚠️'
  };
  
  console.log(`${icons[level]} [${timestamp}] ${message}`);
};
