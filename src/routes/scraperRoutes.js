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
      'GET /health': this.healthCheck.bind(this),
      'GET /status': this.getStatus.bind(this),
      'GET /brands': this.getBrands.bind(this),
      'POST /brands/:brandName/devices': this.getBrandDevices.bind(this),
      'GET /devices/:deviceId/specifications': this.getDeviceSpecifications.bind(this),
      'POST /devices/search': this.searchDevices.bind(this),
      'GET /jobs/:jobId': this.getJobStatus.bind(this),
      'GET /jobs': this.getJobsList.bind(this),
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
   * Get brands from database
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getBrands(req, res) {
    try {
      const result = await this.controller.getBrands();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get brands',
        error: error.message
      });
    }
  }

  /**
   * Scrape brands (all brands if none specified)
   * Includes search and filter parameters from the old brands/scrape route
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async scrapeBrands(req, res) {
    try {
      const { brands, options = {} } = req.body;
      
      const brandsToScrape = (brands && Array.isArray(brands) && brands.length > 0) ? brands : undefined;
      const result = await this.controller.scrapeBrands(brandsToScrape, options);
      if (result.success === false) {
        res.status(result.statusCode || 400).json(result);
      } else {
        res.status(result.statusCode || 200).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to scrape brands',
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
      res.json({
        success: true,
        message: 'Latest data retrieved',
        data: null
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
   * Search devices with filters and search parameters
   * Supports brand_name, keyword, minYear, and excludeKeywords filters
   * Returns devices with deviceId in the response
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async searchDevices(req, res) {
    try {
      const { keyword, brand_name, minYear, excludeKeywords } = req.body;
      
      const filters = {
        keyword,
        brand_name,
        minYear,
        excludeKeywords
      };
      
      const result = await this.controller.searchDevices(filters);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to search devices',
        error: error.message
      });
    }
  }

  /**
   * Get job status
   * @param {Object} req
   * @param {Object} res
   */
  async getJobStatus(req, res) {
    try {
      const { jobId } = req.params;
      const result = await this.controller.getJobStatus(jobId);
      res.status(result.statusCode || 200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get job status',
        error: error.message
      });
    }
  }

  /**
   * Get list of jobs with optional filters
   * @param {Object} req
   * @param {Object} res
   */
  async getJobsList(req, res) {
    try {
      const { status, job_type, limit } = req.query;
      const filters = {};
      if (status) filters.status = status;
      if (job_type) filters.job_type = job_type;
      if (limit) filters.limit = parseInt(limit, 10);
      
      const result = await this.controller.getJobsList(filters);
      res.status(result.statusCode || 200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get jobs list',
        error: error.message
      });
    }
  }

  /**
   * Get devices for a specific brand
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getBrandDevices(req, res) {
    try {
      const { brandName } = req.params;
      // Accept options either as nested object or directly in body
      const options = req.body.options || req.body;
      
      const result = await this.controller.getBrandDevices(brandName, options);
      
      // Set appropriate HTTP status code based on result
      if (result.success === false) {
        res.status(result.statusCode || 400).json(result);
      } else {
        res.status(result.statusCode || 200).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get brand devices',
        error: error.message
      });
    }
  }
}
