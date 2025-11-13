// API Server for GSM Arena Scraper

import express from 'express';
import cors from 'cors';
import { ScraperRoutes } from '../routes/scraperRoutes.js';
import { CONFIG } from '../config/config.js';

export class ScraperAPI {
  constructor() {
    this.app = express();
    this.port = CONFIG.API.port;
    this.host = CONFIG.API.host;
    this.routes = new ScraperRoutes();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup middleware
   */
  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup routes
   */
  setupRoutes() {
    const routeDefinitions = this.routes.getRoutes();

    // Root -> Swagger docs
    this.app.get('/', (req, res) => {
      res.redirect('/docs');
    });

    // Health check
    this.app.get('/health', routeDefinitions['GET /health']);

    // Status endpoints
    this.app.get('/status', routeDefinitions['GET /status']);

    // Brand endpoints
    this.app.get('/brands', routeDefinitions['GET /brands']);
    this.app.get('/brands/all', routeDefinitions['GET /brands/all']);
    this.app.post('/brands/scrape', routeDefinitions['POST /brands/scrape']);
    this.app.post('/brands/:brandName/scrape', routeDefinitions['POST /brands/:brandName/scrape']);
    this.app.get('/brands/:brandName/devices', routeDefinitions['GET /brands/:brandName/devices']);

    // Device endpoints
    this.app.get('/devices/:deviceId/specifications', routeDefinitions['GET /devices/:deviceId/specifications']);
    this.app.get('/devices/search', routeDefinitions['GET /devices/search']);

    // Scraping endpoints
    this.app.post('/scrape/test', routeDefinitions['POST /scrape/test']);

    // Data endpoints
    this.app.get('/data/latest', routeDefinitions['GET /data/latest']);
    this.app.post('/data/save', routeDefinitions['POST /data/save']);

    // Documentation endpoints
    this.app.get('/docs', routeDefinitions['GET /docs']);
    this.app.get('/swagger.json', routeDefinitions['GET /swagger.json']);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.originalUrl
      });
    });

    // Error handler
    this.app.use((error, req, res, next) => {
      console.error('API Error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    });
  }

  /**
   * Start the server
   */
  start() {
    this.app.listen(this.port, this.host, () => {
      console.log(`🚀 GSM Arena Scraper API running on http://${this.host}:${this.port}`);
      console.log(`📚 API Documentation:`);
      console.log(`   GET  /health - Health check`);
      console.log(`   GET  /status - Get scraping status`);
      console.log(`   GET  /brands - Get available brands`);
      console.log(`   POST /brands/scrape - Scrape brands (all brands if none specified)`);
      console.log(`   POST /brands/:brandName/scrape - Scrape brand models`);
      console.log(`   POST /scrape/test - Test scraping`);
      console.log(`   GET  /data/latest - Get latest data`);
      console.log(`   POST /data/save - Save data`);
      console.log(`📖 Swagger Documentation:`);
      console.log(`   GET  /docs - Interactive API documentation`);
      console.log(`   GET  /swagger.json - OpenAPI specification`);
    });
  }

  /**
   * Stop the server
   */
  stop() {
    if (this.server) {
      this.server.close();
      console.log('🛑 API server stopped');
    }
  }
}

// Start server if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const api = new ScraperAPI();
  api.start();
}
