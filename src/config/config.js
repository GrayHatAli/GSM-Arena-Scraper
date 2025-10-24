// Configuration for GSM Arena Scraper

export const CONFIG = {
  // No default brands - will get all results unless specified by user
  DEFAULT_TARGET_BRANDS: [],

  // No default year filter - will get all results unless specified by user
  DEFAULT_MIN_YEAR: null,

  // No limit on models per brand - will get all available models
  MODELS_PER_BRAND: null,

  // Output file path
  OUTPUT_FILE: 'output/gsm-arena-data.json',

  // Puppeteer options
  PUPPETEER_OPTIONS: {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-images',
      '--disable-javascript',
      '--disable-default-apps',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ],
    ignoreDefaultArgs: ['--disable-extensions'],
    timeout: 60000
  },

  // Request delays (in milliseconds)
  DELAYS: {
    between_requests: 1000,
    between_models: 2000,
    between_brands: 3000,
    page_load: 2000
  },

  // User agent
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',

  // GSM Arena URLs
  URLS: {
    makers: 'https://www.gsmarena.com/makers.php3',
    base: 'https://www.gsmarena.com'
  },

  // Device filters (exclude these from results)
  EXCLUDE_KEYWORDS: [
    'ipad', 'tablet', 'matepad', 'watch', 'buds', 'airpods'
  ],

  // API Configuration
  API: {
    port: 3002,
    host: '0.0.0.0',
    timeout: 300000, // 5 minutes
    maxConcurrent: 3
  }
};
