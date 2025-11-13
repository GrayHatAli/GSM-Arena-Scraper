import { ScraperAPI } from '../src/api/server.js';

const apiInstance = new ScraperAPI();

export default function handler(req, res) {
  if (!apiInstance.server) {
    const { host, port } = apiInstance;

    apiInstance.server = apiInstance.app.listen(port, host, () => {
      console.log(`Serverless Express server started on http://${host}:${port}`);
    });
  }

  return apiInstance.app(req, res);
}

