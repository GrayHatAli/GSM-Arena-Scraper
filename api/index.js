import { ScraperAPI } from '../src/api/server.js';

const apiInstance = new ScraperAPI();

export default function handler(req, res) {
  try {
    // Ensure the Express app handles the request
    apiInstance.app(req, res);
  } catch (error) {
    console.error('Handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
}

