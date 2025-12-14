#!/bin/bash

# Simple test script to scrape a random brand from 2023 onwards
# Assumes Docker container is already running

set -e

echo "🔍 Brand Scraping Test"
echo "====================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Wait for server
echo "⏳ Waiting for server..."
MAX_ATTEMPTS=30
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s -f http://localhost:3005/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Server is ready!${NC}"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    sleep 2
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo -e "${RED}❌ Server not ready${NC}"
    exit 1
fi

# Get brands
echo ""
echo "📋 Getting brands list..."
BRANDS_RESPONSE=$(curl -s http://localhost:3005/brands)

# Select random brand
RANDOM_BRAND=$(echo "$BRANDS_RESPONSE" | python3 -c "
import sys, json, random
try:
    data = json.load(sys.stdin)
    if data.get('success') and 'data' in data and 'brands' in data['data']:
        brands = [b.get('brand_name', '').lower() for b in data['data']['brands'] if b.get('brand_name')]
        if brands:
            print(random.choice(brands))
except:
    pass
")

if [ -z "$RANDOM_BRAND" ]; then
    echo -e "${RED}❌ Failed to get random brand${NC}"
    exit 1
fi

echo -e "${BLUE}🎲 Selected brand: ${RANDOM_BRAND}${NC}"

# Request scraping
echo ""
echo "🔍 Requesting scraping for brand '${RANDOM_BRAND}' (minYear=2023)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:3005/brands/${RANDOM_BRAND}/devices" \
  -H "Content-Type: application/json" \
  -d '{"options": {"minYear": 2023}}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"

# Extract job ID
JOB_ID=$(echo "$BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'data' in data:
        print(data['data'].get('jobId') or data['data'].get('job_id', ''))
except:
    pass
" 2>/dev/null)

if [ -n "$JOB_ID" ] && [ "$JOB_ID" != "None" ]; then
    echo ""
    echo -e "${BLUE}📝 Job ID: ${JOB_ID}${NC}"
    echo "⏳ Monitoring job (this may take several minutes)..."
    
    MAX_WAIT=1800
    ELAPSED=0
    CHECK_INTERVAL=15
    
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
            exit 1
        else
            echo "   Status: $STATUS | Progress: $COMPLETED / $TOTAL | Elapsed: ${ELAPSED}s"
        fi
        
        sleep $CHECK_INTERVAL
        ELAPSED=$((ELAPSED + CHECK_INTERVAL))
    done
fi

# Verify models in database
echo ""
echo "🔍 Verifying models in database..."
sleep 5

MODELS_RESPONSE=$(curl -s -X POST "http://localhost:3005/brands/${RANDOM_BRAND}/devices" \
  -H "Content-Type: application/json" \
  -d '{"options": {"minYear": 2023}}')

MODELS_COUNT=$(echo "$MODELS_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('success') and 'data' in data:
        if 'models' in data['data']:
            print(len(data['data']['models']))
        elif 'total_models' in data['data']:
            print(data['data']['total_models'])
        else:
            print(0)
    else:
        print(0)
except:
    print(0)
" 2>/dev/null)

if [ -n "$MODELS_COUNT" ] && [ "$MODELS_COUNT" != "0" ]; then
    echo -e "${GREEN}✅ Found ${MODELS_COUNT} model(s) in database!${NC}"
    echo ""
    echo "Sample models:"
    echo "$MODELS_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('success') and 'data' in data and 'models' in data['data']:
        models = data['data']['models'][:5]
        for model in models:
            name = model.get('model_name', 'N/A')
            year = model.get('release_date', 'N/A')
            device_id = model.get('device_id', 'N/A')
            print(f\"  - {name} (Year: {year}, Device ID: {device_id})\")
except Exception as e:
    print(f\"  Error: {e}\")
" 2>/dev/null
    echo ""
    echo -e "${GREEN}🎉 SUCCESS: All models scraped and saved!${NC}"
else
    echo -e "${YELLOW}⚠️  No models found yet. The job may still be running.${NC}"
    echo "Response:"
    echo "$MODELS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$MODELS_RESPONSE"
fi

