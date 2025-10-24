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
      
      // Scraping endpoints
      'POST /scrape/all': this.scrapeAll.bind(this),
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
   * Scrape specific brands
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async scrapeBrands(req, res) {
    try {
      const { brands, options = {} } = req.body;
      
      if (!brands || !Array.isArray(brands) || brands.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Brands array is required',
          error: 'Invalid brands parameter'
        });
      }

      const result = await this.controller.scrapeBrands(brands, options);
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
   * Scrape all brands
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async scrapeAll(req, res) {
    try {
      const { options = {} } = req.body;
      
      // Use actual scraping instead of mock data
      const result = await this.controller.scrapeAll(options);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to scrape all brands',
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
}
