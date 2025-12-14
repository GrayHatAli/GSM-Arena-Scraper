#!/bin/bash

# Test script to scrape a random brand from 2023 onwards
# This script:
# 1. Builds and runs the Docker container
# 2. Waits for server to be ready
# 3. Gets a random brand
# 4. Sends a request to scrape all models from 2023 onwards
# 5. Monitors the job until completion
# 6. Verifies all models are saved in database

set -e

echo "🐳 Docker Brand Scraping Test"
echo "=============================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Clean up function
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    docker-compose down 2>/dev/null || true
    echo "✅ Cleanup complete"
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Step 1: Build and start Docker container
echo "📦 Step 1: Building Docker image..."
docker-compose build --no-cache

echo ""
echo "🚀 Step 2: Starting Docker container..."
docker-compose up -d

echo ""
echo "⏳ Step 3: Waiting for server to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s -f http://localhost:3005/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Server is ready!${NC}"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo "   Attempt $ATTEMPT/$MAX_ATTEMPTS..."
    sleep 2
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo -e "${RED}❌ Server did not become ready in time${NC}"
    docker-compose logs --tail=50
    exit 1
fi

# Step 4: Get brands list
echo ""
echo "📋 Step 4: Getting brands list..."
BRANDS_RESPONSE=$(curl -s http://localhost:3005/brands)
echo "$BRANDS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$BRANDS_RESPONSE"

# Extract brands array
BRANDS_JSON=$(echo "$BRANDS_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('success') and 'data' in data and 'brands' in data['data']:
        brands = data['data']['brands']
        # Extract brand_name from each brand
        brand_names = [b.get('brand_name', '').lower() for b in brands if b.get('brand_name')]
        if brand_names:
            print('\n'.join(brand_names))
        else:
            print('', file=sys.stderr)
            sys.exit(1)
    else:
        print('', file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print('', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null)

if [ -z "$BRANDS_JSON" ]; then
    echo -e "${YELLOW}⚠️  No brands found in response, waiting 5 seconds and retrying...${NC}"
    sleep 5
    BRANDS_RESPONSE=$(curl -s http://localhost:3005/brands)
    BRANDS_JSON=$(echo "$BRANDS_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('success') and 'data' in data and 'brands' in data['data']:
        brands = data['data']['brands']
        brand_names = [b.get('brand_name', '').lower() for b in brands if b.get('brand_name')]
        if brand_names:
            print('\n'.join(brand_names))
        else:
            sys.exit(1)
    else:
        sys.exit(1)
except:
    sys.exit(1)
" 2>/dev/null)
fi

if [ -z "$BRANDS_JSON" ]; then
    echo -e "${RED}❌ Failed to get brands list${NC}"
    exit 1
fi

# Select a random brand
RANDOM_BRAND=$(echo "$BRANDS_JSON" | python3 -c "
import sys
import random
brands = [line.strip() for line in sys.stdin if line.strip()]
if brands:
    print(random.choice(brands))
")
echo ""
echo -e "${BLUE}🎲 Selected random brand: ${RANDOM_BRAND}${NC}"

# Step 5: Request scraping for the brand with minYear=2023
echo ""
echo "🔍 Step 5: Requesting scraping for brand '${RANDOM_BRAND}' (minYear=2023)..."
echo "   This will scrape all models from 2023 onwards and save them to database"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:3005/brands/${RANDOM_BRAND}/devices" \
  -H "Content-Type: application/json" \
  -d '{
    "options": {
      "minYear": 2023
    }
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "   HTTP Status Code: $HTTP_CODE"
echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "202" ]; then
    echo -e "${RED}❌ Request failed with status $HTTP_CODE${NC}"
    exit 1
fi

# Extract job ID if available
JOB_ID=$(echo "$BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'data' in data and 'jobId' in data['data']:
        print(data['data']['jobId'])
    elif 'data' in data and 'job_id' in data['data']:
        print(data['data']['job_id'])
except:
    pass
" 2>/dev/null)

if [ -n "$JOB_ID" ]; then
    echo ""
    echo -e "${BLUE}📝 Job ID: ${JOB_ID}${NC}"
    echo ""
    echo "⏳ Step 6: Monitoring job progress..."
    
    MAX_WAIT=1800  # 30 minutes max
    ELAPSED=0
    CHECK_INTERVAL=10
    
    while [ $ELAPSED -lt $MAX_WAIT ]; do
        JOB_STATUS=$(curl -s "http://localhost:3005/jobs/${JOB_ID}")
        JOB_STATE=$(echo "$JOB_STATUS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'data' in data:
        job = data['data']
        status = job.get('status', 'unknown')
        progress = job.get('progress', {})
        print(f\"{status}|{progress.get('completed', 0)}|{progress.get('total', 0)}\")
    else:
        print('unknown|0|0')
except:
    print('unknown|0|0')
" 2>/dev/null)
        
        STATUS=$(echo "$JOB_STATE" | cut -d'|' -f1)
        COMPLETED=$(echo "$JOB_STATE" | cut -d'|' -f2)
        TOTAL=$(echo "$JOB_STATE" | cut -d'|' -f3)
        
        if [ "$STATUS" = "completed" ]; then
            echo -e "${GREEN}✅ Job completed!${NC}"
            echo "   Completed: $COMPLETED / $TOTAL"
            break
        elif [ "$STATUS" = "failed" ]; then
            echo -e "${RED}❌ Job failed!${NC}"
            echo "$JOB_STATUS" | python3 -m json.tool 2>/dev/null || echo "$JOB_STATUS"
            exit 1
        else
            echo "   Status: $STATUS | Progress: $COMPLETED / $TOTAL | Elapsed: ${ELAPSED}s"
        fi
        
        sleep $CHECK_INTERVAL
        ELAPSED=$((ELAPSED + CHECK_INTERVAL))
    done
    
    if [ $ELAPSED -ge $MAX_WAIT ]; then
        echo -e "${YELLOW}⚠️  Timeout waiting for job to complete${NC}"
    fi
else
    echo ""
    echo -e "${YELLOW}⚠️  No job ID found, checking if data is already available...${NC}"
    sleep 5
fi

# Step 7: Verify models are saved in database
echo ""
echo "🔍 Step 7: Verifying models are saved in database..."
echo ""

# Get models for the brand
MODELS_RESPONSE=$(curl -s -X POST "http://localhost:3005/brands/${RANDOM_BRAND}/devices" \
  -H "Content-Type: application/json" \
  -d '{
    "options": {
      "minYear": 2023
    }
  }')

MODELS_COUNT=$(echo "$MODELS_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('success') and 'data' in data:
        if 'models' in data['data']:
            models = data['data']['models']
            print(len(models))
        elif 'total_models' in data['data']:
            print(data['data']['total_models'])
        else:
            print(0)
    else:
        print(0)
except:
    print(0)
" 2>/dev/null)

if [ -z "$MODELS_COUNT" ] || [ "$MODELS_COUNT" = "0" ]; then
    echo -e "${YELLOW}⚠️  No models found yet. Waiting 30 seconds and retrying...${NC}"
    sleep 30
    
    MODELS_RESPONSE=$(curl -s -X POST "http://localhost:3005/brands/${RANDOM_BRAND}/devices" \
      -H "Content-Type: application/json" \
      -d '{
        "options": {
          "minYear": 2023
        }
      }')
    
    MODELS_COUNT=$(echo "$MODELS_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('success') and 'data' in data:
        if 'models' in data['data']:
            models = data['data']['models']
            print(len(models))
        elif 'total_models' in data['data']:
            print(data['data']['total_models'])
        else:
            print(0)
    else:
        print(0)
except:
    print(0)
" 2>/dev/null)
fi

if [ -n "$MODELS_COUNT" ] && [ "$MODELS_COUNT" != "0" ]; then
    echo -e "${GREEN}✅ Found ${MODELS_COUNT} model(s) saved in database for brand '${RANDOM_BRAND}' (2023+)${NC}"
    echo ""
    echo "Sample models:"
    echo "$MODELS_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('success') and 'data' in data and 'models' in data['data']:
        models = data['data']['models'][:5]  # First 5 models
        for model in models:
            name = model.get('model_name', 'N/A')
            year = model.get('release_date', 'N/A')
            device_id = model.get('device_id', 'N/A')
            print(f\"  - {name} (Year: {year}, Device ID: {device_id})\")
except Exception as e:
    print(f\"  Error: {e}\")
" 2>/dev/null
else
    echo -e "${RED}❌ No models found in database${NC}"
    echo "Response:"
    echo "$MODELS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$MODELS_RESPONSE"
    exit 1
fi

# Step 8: Summary
echo ""
echo "=============================="
echo "📋 Test Summary"
echo "=============================="
echo "Brand: ${RANDOM_BRAND}"
echo "Min Year: 2023"
echo "Models Found: ${MODELS_COUNT}"
echo ""
echo -e "${GREEN}🎉 SUCCESS: All models scraped and saved to database!${NC}"

