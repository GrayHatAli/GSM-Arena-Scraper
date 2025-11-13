import { ScraperAPI } from '../src/api/server.js';

const apiInstance = new ScraperAPI();

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true
  }
};

export default function handler(req, res) {
  return apiInstance.app(req, res);
}

