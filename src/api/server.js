// API Server for GSM Arena Scraper

import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { ScraperRoutes } from '../routes/scraperRoutes.js';
import { CONFIG } from '../config/config.js';
import { parse } from 'yaml';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const swaggerPathCandidates = [
  path.join(__dirname, '../../swagger.yaml'),
  path.resolve(process.cwd(), 'swagger.yaml'),
  path.resolve(process.cwd(), 'src/swagger.yaml')
];

const swaggerPath = swaggerPathCandidates.find((candidate) => existsSync(candidate));

let swaggerDocument;

if (swaggerPath) {
  try {
    swaggerDocument = parse(readFileSync(swaggerPath, 'utf8'));
  } catch (error) {
    console.error('Failed to parse swagger.yaml. Using fallback document. Error:', error.message);
    swaggerDocument = null;
  }
} else {
  swaggerDocument = null;
}

if (!swaggerDocument) {
  swaggerDocument = {
    openapi: '3.0.0',
    info: {
      title: 'GSM Arena Scraper API',
      description:
        'swagger.yaml is missing; using minimal fallback schema. Ensure swagger.yaml is deployed for full documentation.',
      version: '1.0.0'
    },
    paths: {}
  };
  console.warn(
    'swagger.yaml not found. Checked paths:',
    swaggerPathCandidates,
    'Using fallback Swagger document.'
  );
}

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

    // Swagger JSON endpoint (must be before Swagger UI middleware)
    this.app.get('/swagger.json', routeDefinitions['GET /swagger.json']);

    // Swagger UI setup with middleware - use CDN for assets (works better on Vercel)
    const swaggerUiOptions = {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'GSM Arena Scraper API Documentation',
      customJs: [
        'https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js',
        'https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js'
      ],
      customCssUrl: 'https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css'
    };

    // Swagger UI serve middleware - temporarily disabled to fix startup issue
    // TODO: Re-enable Swagger UI after fixing the setup issue
    // try {
    //   this.app.use(swaggerUi.serve);
    //   const swaggerSetup = swaggerUi.setup(swaggerDocument, swaggerUiOptions);
    //   // Root -> Swagger docs HTML (only for GET /)
    //   if (Array.isArray(swaggerSetup)) {
    //     this.app.get('/', ...swaggerSetup);
    //     this.app.get('/docs', ...swaggerSetup);
    //   } else {
    //     this.app.get('/', swaggerSetup);
    //     this.app.get('/docs', swaggerSetup);
    //   }
    // } catch (swaggerError) {
    //   console.warn('Swagger UI setup failed, continuing without it:', swaggerError.message);
    // }

    // Health check
    this.app.get('/health', routeDefinitions['GET /health']);

    // Status endpoints
    this.app.get('/status', routeDefinitions['GET /status']);

    // Brand endpoints
    this.app.post('/brands', routeDefinitions['POST /brands']);

    // Device endpoints
    this.app.get('/devices/:deviceId/specifications', routeDefinitions['GET /devices/:deviceId/specifications']);
    this.app.post('/devices/search', routeDefinitions['POST /devices/search']);
    this.app.get('/jobs/:jobId', routeDefinitions['GET /jobs/:jobId']);

    // Data endpoints
    this.app.get('/data/latest', routeDefinitions['GET /data/latest']);
    this.app.post('/data/save', routeDefinitions['POST /data/save']);

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
      console.log(`   POST /brands - Scrape brands (includes search and filter parameters)`);
      console.log(`   GET  /devices/:deviceId/specifications - Get device specifications`);
      console.log(`   POST /devices/search - Search devices (with filters and deviceId)`);
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
