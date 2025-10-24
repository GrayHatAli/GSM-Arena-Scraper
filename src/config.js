// Configuration for GSM Arena Scraper

export const CONFIG = {
  // Default target brands (can be overridden by user)
  DEFAULT_TARGET_BRANDS: [
    'apple', 'samsung', 'xiaomi', 'huawei', 'oppo', 
    'nothing', 'google', 'realme', 'honor'
  ],

  // Persian names for brands
  PERSIAN_NAMES: {
    'apple': 'اپل',
    'samsung': 'سامسونگ',
    'xiaomi': 'شیائومی',
    'huawei': 'هواوی',
    'oppo': 'اوپو',
    'nothing': 'ناتینگ',
    'google': 'گوگل',
    'realme': 'ریلمی',
    'honor': 'آنر'
  },

  // Default year filter (can be overridden by user, null means no filtering)
  DEFAULT_MIN_YEAR: null,

  // Number of models to scrape per brand
  MODELS_PER_BRAND: 10,

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
      '--disable-gpu'
    ]
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
  ]
};
