# GSM Arena Scraper

A standalone, production-ready web scraper for GSM Arena mobile phone data with RESTful API.

## 🚀 Features

- **Independent Service**: Completely standalone, can be deployed anywhere
- **RESTful API**: Clean API endpoints for all scraping operations
- **Real Data Scraping**: Extracts actual specifications, RAM, Storage, Colors
- **Flexible Brand Selection**: Choose any brands you want, or scrape all available brands
- **Optional Year Filtering**: Filter by release year or include all devices regardless of year
- **Mobile Phones Only**: Excludes tablets, watches, accessories
- **Rate Limiting**: Respectful scraping with delays
- **Error Handling**: Comprehensive error management
- **Docker Support**: Ready for containerized deployment
- **Health Checks**: Built-in monitoring and health endpoints

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

## 🔌 API Endpoints

### Health & Status
- `GET /health` - Health check
- `GET /status` - Current scraping status

### Brands
- `GET /brands` - Get available brands
- `POST /brands/scrape` - Scrape specific brands
- `POST /brands/:brandName/scrape` - Scrape brand models

### Scraping
- `POST /scrape/all` - Scrape all brands
- `POST /scrape/test` - Test scraping with single brand

### Data
- `GET /data/latest` - Get latest scraped data
- `POST /data/save` - Save data

## 📡 API Examples

### Scrape All Brands (No Filtering)
```bash
curl -X POST http://localhost:3002/scrape/all \
  -H "Content-Type: application/json" \
  -d '{
    "options": {
      "modelsPerBrand": 10
    }
  }'
```

### Scrape All Brands with Year Filter
```bash
curl -X POST http://localhost:3002/scrape/all \
  -H "Content-Type: application/json" \
  -d '{
    "options": {
      "modelsPerBrand": 10,
      "minYear": 2022
    }
  }'
```

### Scrape Specific Brands Only
```bash
curl -X POST http://localhost:3002/scrape/all \
  -H "Content-Type: application/json" \
  -d '{
    "options": {
      "brands": ["apple", "samsung", "xiaomi"],
      "modelsPerBrand": 5,
      "minYear": 2020
    }
  }'
```

### Scrape Specific Brands
```bash
curl -X POST http://localhost:3002/brands/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "brands": ["apple", "samsung"],
    "options": {
      "modelsPerBrand": 5
    }
  }'
```

### Get Latest Data
```bash
curl http://localhost:3002/data/latest
```

## 📊 Response Format

The API returns data in a simple, standardized format:

```json
{
  "success": true,
  "data": {
    "brands": [
      {
        "name": "apple",
        "displayName": "Apple",
        "models": [
          {
            "name": "iPhone 16 Pro Max",
            "specifications": {
              "battery": "4422 mAh",
              "display": "6.7 inches",
              "os": "iOS 18",
              "processor": "A18 Pro"
            },
            "variants": [
              {
                "ram": 8,
                "storage": 256,
                "colors": ["Natural Titanium", "Blue Titanium"]
              }
            ]
          }
        ]
      }
    ],
    "scrapedAt": "2024-10-22T17:00:00.000Z",
    "totalBrands": 9,
    "totalModels": 15
  },
  "message": "Scraping completed successfully"
}
```

## 🎛️ Flexible Filtering Options

The scraper now supports flexible filtering options that can be customized per request:

### Brand Selection
- **All Brands**: Don't specify `brands` in options to scrape all available brands
- **Specific Brands**: Specify `brands: ["apple", "samsung", "xiaomi"]` to scrape only selected brands
- **Available Brands**: Use `GET /brands` endpoint to see all available brands

### Year Filtering
- **No Filtering**: Don't specify `minYear` to include all devices regardless of release year
- **Year Filter**: Specify `minYear: 2022` to only include devices from 2022 onwards
- **Historical Data**: Set `minYear: 2020` to include older devices

### Example Combinations
```bash
# Scrape everything (all brands, all years)
curl -X POST http://localhost:3002/scrape/all -d '{"options": {"modelsPerBrand": 5}}'

# Scrape only Apple and Samsung from 2020 onwards
curl -X POST http://localhost:3002/scrape/all -d '{
  "options": {
    "brands": ["apple", "samsung"],
    "minYear": 2020,
    "modelsPerBrand": 10
  }
}'

# Scrape all brands but only recent devices
curl -X POST http://localhost:3002/scrape/all -d '{
  "options": {
    "minYear": 2023,
    "modelsPerBrand": 15
  }
}'
```

## 🔧 Configuration

Environment variables:

```bash
# Server Configuration
PORT=3002
HOST=0.0.0.0
NODE_ENV=production

# Scraping Configuration (Optional)
# MIN_YEAR=2022  # Set to filter by year, leave unset for no year filtering
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
    // Scrape all brands without year filtering
    const response = await axios.post('http://your-scraper-host:3002/scrape/all', {
      options: { 
        modelsPerBrand: 10,
        brands: ['apple', 'samsung', 'xiaomi'], // Optional: specify brands
        minYear: 2022 // Optional: filter by year
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
        # Scrape all brands without year filtering
        response = requests.post('http://your-scraper-host:3002/scrape/all', 
                                json={
                                    'options': {
                                        'modelsPerBrand': 10,
                                        'brands': ['apple', 'samsung', 'xiaomi'],  # Optional: specify brands
                                        'minYear': 2022  # Optional: filter by year
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
        'options' => [
            'modelsPerBrand' => 10,
            'brands' => ['apple', 'samsung', 'xiaomi'], // Optional: specify brands
            'minYear' => 2022 // Optional: filter by year
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
    $result = file_get_contents('http://your-scraper-host:3002/scrape/all', false, $context);
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

# Run tests
npm test
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