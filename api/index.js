import { ScraperAPI } from '../src/api/server.js';

const apiInstance = new ScraperAPI();

export default function handler(req, res) {
  return apiInstance.app(req, res);
}

