## 🧵 Background Flow

1. **Startup** – SQLite migrations run automatically and the GSM Arena maker list is cached locally.
2. **Brand Request (`POST /brands`)** – API checks SQLite for the requested brand + `minYear`. Missing data triggers a background job and returns `202 Accepted` with an ETA.
3. **Job Queue** – Jobs are persisted in `scrape_jobs`, processed sequentially, and include automatic retries with exponential backoff.
4. **Job Status (`GET /jobs/:id`)** – Poll job progress while the scraper works in the background.
5. **Device Specs** – `/devices/:deviceId/specifications` acts the same way: cached lookups first, background jobs otherwise.
# GSM Arena Scraper

A standalone, production-ready web scraper for GSM Arena mobile phone data with RESTful API.

## 🚀 Features

- **Independent Service**: Completely standalone, can be deployed anywhere
- **SQLite Persistence**: All brands, models, specs, and job metadata live in `data/gsmarena.sqlite`
- **Background Job Queue**: Brand/model/spec scraping happens asynchronously with persistent retry logic
- **RESTful API**: Clean API endpoints for scraping status, job status, and cached data
- **Real Data Scraping**: Extracts actual specifications, RAM, Storage, Colors
- **Flexible Brand Selection**: Choose any brands you want, or scrape all available brands
- **Optional Year Filtering**: Filter by release year or include all devices regardless of year
- **Mobile Phones Only**: Excludes tablets, watches, accessories
- **Rate Limiting Aware**: Randomized delays (1–5s per spec fetch) to stay under GSM Arena limits
- **Docker Support & Health Checks**: Ready for containerized deployment with `/health` endpoint

## 📦 Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone <repository-url>
cd gsm-arena-scraper

# Build and run with Docker Compose
docker-compose up -d

# Check status
curl http://localhost:3002/health
```

### Option 2: Local Installation

```bash
# Install dependencies
npm install

# Start the API server
npm start

# Server runs on http://localhost:3002
```

> ℹ️ The first run creates `data/gsmarena.sqlite` automatically and seeds it with the full GSM Arena brand list.

## 🔌 API Endpoints

### Health & Status
- `GET /health` – Health check
- `GET /status` – Current scraping status

### Brands & Jobs
- `GET /brands` – List cached brands with stored models
- `POST /brands` – Request brand data (queues background jobs if data is missing)
- `GET /jobs/:jobId` – Check background job status

### Devices
- `GET /devices/:deviceId/specifications` – Retrieve cached specs or enqueue a fetch job
- `POST /devices/search` – Search locally cached devices

## 📡 API Examples

### Request Brand Data
```bash
curl -X POST http://localhost:3002/brands \
  -H "Content-Type: application/json" \
  -d '{
    "brands": ["apple", "samsung"],
    "options": { "minYear": 2024 }
  }'
```

- If data exists → models are returned immediately from SQLite
- If data is missing → response includes `statusCode: 202` plus queued job IDs

### Check Job Status
```bash
curl http://localhost:3002/jobs/12
```

### Retrieve Device Specifications
```bash
curl http://localhost:3002/devices/13964/specifications
```

- If cached → specs returned instantly
- If missing → background job scheduled; response includes `jobId`

## 📊 Response Format

The API returns data in a simple, standardized format:

```json
{
  "success": true,
  "message": "Brand data retrieved from database",
  "statusCode": 200,
  "data": {
    "brands": [
      {
        "name": "apple",
        "models": [
          {
            "model_name": "iPhone 17 Pro Max",
            "series": "iPhone",
            "release_date": "Released 2025, September 09",
            "device_id": 13964,
            "device_url": "https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php",
            "image_url": "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-17-pro-max.jpg"
          }
        ]
      }
    ],
    "total_brands": 1,
    "total_models": 4,
    "minYear": 2024
  }
}
```

If data is missing the response looks like:

```json
{
  "success": true,
  "message": "Data is being fetched. Estimated completion time is based on the number of models per brand. Please retry after the suggested interval.",
  "statusCode": 202,
  "data": {
    "pending": [
      {
        "brand": "samsung",
        "jobId": 18,
        "eta_minutes": 6
      }
    ],
    "minYear": 2024
  }
}
```

## 🎛️ Flexible Filtering Options

The scraper now supports flexible filtering options that can be customized per request:

### Brand Selection
- **All Brands**: Don't specify `brands` in request body to scrape all available brands
- **Specific Brands**: Specify `brands: ["apple", "samsung", "xiaomi"]` to scrape only selected brands
- **Available Brands**: Use `GET /brands` endpoint to see all available brands

### Model Selection
- **All Models**: Don't specify `modelsPerBrand` to scrape all models for each brand
- **Limited Models**: Specify `modelsPerBrand: 5` to scrape only 5 models per brand

### Year Filtering
- **No Filtering**: Don't specify `minYear` to include all devices regardless of release year
- **Year Filter**: Specify `minYear: 2022` to only include devices from 2022 onwards
- **Historical Data**: Set `minYear: 2020` to include older devices

### Example Combinations
```bash
# Request everything (all models, all years) for Apple & Samsung
curl -X POST http://localhost:3002/brands -d '{
  "brands": ["apple", "samsung"]
}'

# Request Apple/Samsung from 2020 onwards
curl -X POST http://localhost:3002/brands -d '{
  "brands": ["apple", "samsung"],
  "options": { "minYear": 2020 }
}'

# Request Xiaomi/Google recent devices only
curl -X POST http://localhost:3002/brands -d '{
  "brands": ["xiaomi", "google"],
  "options": { "minYear": 2023 }
}'
```

## 🔧 Configuration

Environment variables:

```bash
# Server Configuration
PORT=3002
HOST=0.0.0.0
NODE_ENV=production

# Database (Optional)
SQLITE_DB_PATH=./data/gsmarena.sqlite

# Scraping Configuration (Optional)
MODELS_PER_BRAND=10
REQUEST_DELAY=1000
```

## 🐳 Docker Deployment

### Build Image
```bash
docker build -t gsm-arena-scraper .
```

### Run Container
```bash
docker run -p 3002:3002 gsm-arena-scraper
```

### Docker Compose
```bash
docker-compose up -d
```

## 🔗 Integration Examples

### Node.js/Express
```javascript
const axios = require('axios');

async function getGSMData() {
  try {
    // Scrape all brands and all models without year filtering
    const response = await axios.post('http://your-scraper-host:3002/brands', {
      brands: ['apple', 'samsung', 'xiaomi'], // Optional: specify brands
      options: { 
        minYear: 2022 // Optional: filter by year
        // modelsPerBrand not specified = scrape all models
      }
    });
    return response.data;
  } catch (error) {
    console.error('Scraping failed:', error.message);
  }
}
```

### Python
```python
import requests

def get_gsm_data():
    try:
        # Scrape all brands and all models without year filtering
        response = requests.post('http://your-scraper-host:3002/brands', 
                                json={
                                    'brands': ['apple', 'samsung', 'xiaomi'],  # Optional: specify brands
                                    'options': {
                                        'minYear': 2022  # Optional: filter by year
                                        # modelsPerBrand not specified = scrape all models
                                    }
                                })
        return response.json()
    except Exception as e:
        print(f'Scraping failed: {e}')
```

### PHP
```php
<?php
function getGSMData() {
    $data = [
        'brands' => ['apple', 'samsung', 'xiaomi'], // Optional: specify brands
        'options' => [
            'minYear' => 2022 // Optional: filter by year
            // modelsPerBrand not specified = scrape all models
        ]
    ];
    $options = [
        'http' => [
            'header' => "Content-type: application/json\r\n",
            'method' => 'POST',
            'content' => json_encode($data)
        ]
    ];
    
    $context = stream_context_create($options);
    $result = file_get_contents('http://your-scraper-host:3002/brands', false, $context);
    return json_decode($result, true);
}
?>
```

## 📈 Monitoring

### Health Check
```bash
curl http://localhost:3002/health
```

### Status Check
```bash
curl http://localhost:3002/status
```

## 🛠️ Development

### Local Development
```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Run smoke test (runs migrations + brand sync)
npm run db:test
```

### Project Structure
```
src/
├── api/                    # API Layer
│   ├── server.js          # Express server
│   └── client.js          # API client
├── controllers/           # Controllers
│   └── ScraperController.js
├── services/              # Business Logic
│   └── ScraperService.js
├── routes/                # Route Definitions
│   └── scraperRoutes.js
├── utils/                 # Utilities
│   ├── ResponseHelper.js
│   └── ScraperUtils.js
├── config/                # Configuration
│   └── config.js
└── index.js              # Main entry point
```

## 🔒 Security

- **Rate Limiting**: Built-in delays between requests
- **User Agent**: Proper browser identification
- **Error Handling**: No sensitive data exposure
- **CORS**: Configurable cross-origin handling

## 📋 Requirements

- Node.js 16+
- Internet connection
- Sufficient disk space for output files
- GSM Arena website access

## 🆘 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Check if port is available
lsof -i :3002

# Kill process if needed
kill -9 <PID>
```

#### Scraping Errors
```bash
# Check internet connection
ping gsmarena.com

# Test with single brand
curl -X POST http://localhost:3002/scrape/test
```

#### Memory Issues
```bash
# Increase Node.js memory limit
node --max-old-space-size=4096 src/index.js server
```

## 📄 License

MIT License

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues or questions:
1. Check the logs for error details
2. Test API connectivity
3. Verify configuration settings
4. Contact the development team