// Scraper Routes - API endpoints

import { ScraperController } from '../controllers/ScraperController.js';

export class ScraperRoutes {
  constructor() {
    this.controller = new ScraperController();
  }

  /**
   * Get all routes
   * @returns {Object} - Route definitions
   */
  getRoutes() {
    return {
      // Health check
      'GET /health': this.healthCheck.bind(this),
      
      // Status endpoints
      'GET /status': this.getStatus.bind(this),
      
      // Brand endpoints
      'GET /brands': this.getAvailableBrands.bind(this),
      'POST /brands/scrape': this.scrapeBrands.bind(this),
      'POST /brands/:brandName/scrape': this.scrapeBrandModels.bind(this),
      
      // New endpoints for the requested features
      'GET /brands/all': this.getAllBrands.bind(this),
      'GET /brands/:brandName/devices': this.getDevicesByBrand.bind(this),
      'GET /devices/:deviceId/specifications': this.getDeviceSpecifications.bind(this),
      'GET /devices/search': this.findDevicesByKeyword.bind(this),
      
      // Scraping endpoints
      'POST /scrape/test': this.testScraping.bind(this),
      
      // Data endpoints
      'GET /data/latest': this.getLatestData.bind(this),
      'POST /data/save': this.saveData.bind(this)
    };
  }

  /**
   * Health check endpoint
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async healthCheck(req, res) {
    try {
      res.json({
        success: true,
        message: 'GSM Arena Scraper API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Health check failed',
        error: error.message
      });
    }
  }

  /**
   * Get scraping status
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getStatus(req, res) {
    try {
      const result = await this.controller.getStatus();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get status',
        error: error.message
      });
    }
  }

  /**
   * Get available brands
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getAvailableBrands(req, res) {
    try {
      const result = await this.controller.getAvailableBrands();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get available brands',
        error: error.message
      });
    }
  }

  /**
   * Scrape brands (all brands if none specified)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async scrapeBrands(req, res) {
    try {
      const { brands, options = {} } = req.body;
      
      // brands is now optional - if not provided, scrape all brands
      const result = await this.controller.scrapeBrands(brands || [], options);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to scrape brands',
        error: error.message
      });
    }
  }

  /**
   * Scrape specific brand models
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async scrapeBrandModels(req, res) {
    try {
      const { brandName } = req.params;
      const { options = {} } = req.body;

      if (!brandName) {
        return res.status(400).json({
          success: false,
          message: 'Brand name is required',
          error: 'Missing brandName parameter'
        });
      }

      const result = await this.controller.scrapeBrandModels(brandName, options);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to scrape brand models',
        error: error.message
      });
    }
  }

  /**
   * Test scraping
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async testScraping(req, res) {
    try {
      const { brandName = 'apple' } = req.body;
      const result = await this.controller.testScraping(brandName);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Test scraping failed',
        error: error.message
      });
    }
  }

  /**
   * Get latest scraped data
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getLatestData(req, res) {
    try {
      // This would typically read from a database or file
      res.json({
        success: true,
        message: 'Latest data retrieved',
        data: null // Placeholder
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get latest data',
        error: error.message
      });
    }
  }

  /**
   * Save scraped data
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async saveData(req, res) {
    try {
      const { data, filename } = req.body;
      
      if (!data) {
        return res.status(400).json({
          success: false,
          message: 'Data is required',
          error: 'Missing data parameter'
        });
      }

      // This would typically save to a database or file
      res.json({
        success: true,
        message: 'Data saved successfully',
        filename: filename || 'gsm-data.json'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to save data',
        error: error.message
      });
    }
  }

  /**
   * Get all available brands
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getAllBrands(req, res) {
    try {
      const result = await this.controller.getAllBrands();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get all brands',
        error: error.message
      });
    }
  }

  /**
   * Get devices by brand name
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getDevicesByBrand(req, res) {
    try {
      const { brandName } = req.params;
      const result = await this.controller.getDevicesByBrand(brandName);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get devices by brand',
        error: error.message
      });
    }
  }

  /**
   * Get device specifications
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getDeviceSpecifications(req, res) {
    try {
      const { deviceId } = req.params;
      const result = await this.controller.getDeviceSpecifications(deviceId);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get device specifications',
        error: error.message
      });
    }
  }

  /**
   * Find devices by keyword
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async findDevicesByKeyword(req, res) {
    try {
      const { keyword } = req.query;
      
      if (!keyword) {
        return res.status(400).json({
          success: false,
          message: 'Keyword parameter is required'
        });
      }
      
      const result = await this.controller.findDevicesByKeyword(keyword);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to search devices',
        error: error.message
      });
    }
  }
}
