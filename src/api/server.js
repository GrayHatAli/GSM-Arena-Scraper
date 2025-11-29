import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { ScraperRoutes } from '../routes/scraperRoutes.js';
import { CONFIG } from '../config/config.js';
import { getSwaggerDocument } from '../utils/SwaggerHelper.js';

const swaggerDocument = getSwaggerDocument();

export class ScraperAPI {
  constructor() {
    this.app = express();
    this.port = CONFIG.API.port;
    this.host = CONFIG.API.host;
    this.routes = new ScraperRoutes();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    const routeDefinitions = this.routes.getRoutes();

    this.app.get('/swagger.json', routeDefinitions['GET /swagger.json']);

    const swaggerUiOptions = {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'GSM Arena Scraper API Documentation',
      customJs: [
        'https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js',
        'https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js'
      ],
      customCssUrl: 'https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css'
    };

    try {
      this.app.use('/docs', swaggerUi.serve);
      this.app.use('/', swaggerUi.serve);
      const swaggerSetup = swaggerUi.setup(swaggerDocument, swaggerUiOptions);
      this.app.get('/docs', swaggerSetup);
      this.app.get('/', swaggerSetup);
    } catch (swaggerError) {
      console.warn('Swagger UI setup failed, continuing without it:', swaggerError.message);
    }

    this.app.get('/health', routeDefinitions['GET /health']);
    this.app.get('/status', routeDefinitions['GET /status']);
    this.app.get('/brands', routeDefinitions['GET /brands']);
    this.app.post('/brands/:brandName/devices', routeDefinitions['POST /brands/:brandName/devices']);
    this.app.get('/devices/:deviceId/specifications', routeDefinitions['GET /devices/:deviceId/specifications']);
    this.app.post('/devices/search', routeDefinitions['POST /devices/search']);
    this.app.get('/jobs', routeDefinitions['GET /jobs']);
    this.app.get('/jobs/:jobId', routeDefinitions['GET /jobs/:jobId']);
    this.app.get('/data/latest', routeDefinitions['GET /data/latest']);
    this.app.post('/data/save', routeDefinitions['POST /data/save']);

    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.originalUrl
      });
    });

    this.app.use((error, req, res, next) => {
      console.error('API Error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    });
  }

  start() {
    this.app.listen(this.port, this.host, () => {
      console.log(`🚀 GSM Arena Scraper API running on http://${this.host}:${this.port}`);
      console.log(`📚 API Documentation:`);
      console.log(`   GET  /health - Health check`);
      console.log(`   GET  /status - Get scraping status`);
      console.log(`   GET  /brands - Get brands (scrapes if DB empty)`);
      console.log(`   POST /brands/:brandName/devices - Get devices for a brand`);
      console.log(`   GET  /devices/:deviceId/specifications - Get device specifications`);
      console.log(`   POST /devices/search - Search devices (with filters and deviceId)`);
      console.log(`   GET  /data/latest - Get latest data`);
      console.log(`   POST /data/save - Save data`);
      console.log(`📖 Swagger Documentation:`);
      console.log(`   GET  /docs - Interactive API documentation`);
      console.log(`   GET  /swagger.json - OpenAPI specification`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('🛑 API server stopped');
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const api = new ScraperAPI();
  api.start();
}
