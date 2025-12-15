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
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ],
    ignoreHTTPSErrors: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    timeout: 60000
  },

  // Request delays (in milliseconds)
  DELAYS: {
    between_requests: 2000, // Increased from 1000 to 2000
    between_models: 3000, // Increased from 2000 to 3000
    between_brands: 5000, // Increased from 3000 to 5000
    page_load: 2000
  },

  // Rate limiting configuration
  RATE_LIMIT: {
    // Tokens per second (0.5 = 1 request per 2 seconds)
    tokensPerSecond: 0.5,
    // Bucket size (burst capacity)
    bucketSize: 2,
    // Minimum delay between requests (ms)
    minDelay: 2000,
    // Maximum delay between requests (ms)
    maxDelay: 10000,
    // Circuit breaker: number of failures before opening circuit
    failureThreshold: 3,
    // Circuit breaker: time to wait before retrying (ms)
    resetTimeout: 60000, // 1 minute
    // Maximum concurrent requests - disabled for sequential processing only
    maxConcurrent: 1
  },

  // User agent
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',

  // GSM Arena URLs
  URLS: {
    makers: 'https://www.gsmarena.com/makers.php3',
    base: 'https://www.gsmarena.com'
  },

  // Device filters (exclude these from results)
  EXCLUDE_KEYWORDS: [
    'ipad', 'pad', 'tab', 'tablet', 'matepad', 'watch', 'buds', 'airpods', 'band', 'smartwatch'
  ],

  // API Configuration
  API: {
    port: 3002,
    host: '0.0.0.0',
    timeout: 300000, // 5 minutes
    maxConcurrent: 1 // Force sequential processing
  }
};
