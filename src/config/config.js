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

  // Request delays (in milliseconds) - reduced due to proxy rotation
  DELAYS: {
    between_requests: 1500, // Reduced due to proxy rotation
    between_models: 2000,   // Reduced due to proxy rotation
    between_brands: 1500,   // Reduced due to proxy rotation
    page_load: 1500         // Reduced due to proxy rotation
  },

  // Rate limiting configuration (optimized for proxy use)
  RATE_LIMIT: {
    // Tokens per second (increased for proxy rotation: 2.0 = 2 requests per second)
    tokensPerSecond: 2.0,
    // Bucket size (increased burst capacity)
    bucketSize: 5,
    // Minimum delay between requests (reduced due to proxy rotation)
    minDelay: 1000,
    // Maximum delay between requests (reduced)
    maxDelay: 8000,
    // Circuit breaker: number of failures before opening circuit (reduced)
    failureThreshold: 2,
    // Circuit breaker: time to wait before retrying (reduced)
    resetTimeout: 30000, // 30 seconds
    // Maximum concurrent requests (increased for proxy support)
    maxConcurrent: 10,
    // Minimum concurrent requests
    minConcurrent: 5,
    // Maximum concurrent requests limit
    maxConcurrentLimit: 20,
    // Enable adaptive concurrency adjustment
    adaptiveConcurrency: true
  },

  // Proxy configuration
  PROXY: {
    // Enable proxy support (automatically enabled if ProxyList.txt exists)
    enabled: true,
    // Path to proxy list file
    listFile: 'src/utils/ProxyList.txt',
    // Request timeout when using proxy (ms)
    timeout: 10000,
    // Rotate proxy on error (429, timeout, etc.)
    rotateOnError: true,
    // Maximum failures per proxy before marking as unhealthy
    maxFailuresPerProxy: 3,
    // Health check interval (ms) - 0 to disable
    healthCheckInterval: 300000, // 5 minutes
    // Test URL for health checks
    testUrl: 'http://httpbin.org/ip'
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
    timeout: 600000, // 10 minutes (increased due to higher concurrency)
    maxConcurrent: 10 // Concurrent processing with proxies
  }
};
