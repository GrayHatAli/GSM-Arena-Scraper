#!/bin/bash

# Test script to verify rate limiting with Docker
# This script:
# 1. Builds and runs the Docker container
# 2. Waits for server to be ready
# 3. Makes a real scraping request for a brand
# 4. Monitors logs for 429 errors

set -e

echo "🐳 Docker Rate Limiting Test"
echo "============================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Step 4: Get initial status
echo ""
echo "📊 Step 4: Getting initial rate limiter status..."
INITIAL_STATUS=$(curl -s http://localhost:3005/status)
echo "$INITIAL_STATUS" | python3 -m json.tool 2>/dev/null || echo "$INITIAL_STATUS"

# Step 5: Make a real scraping request
echo ""
echo "🔍 Step 5: Making real scraping request for brand 'nothing'..."
echo "   This will make multiple HTTP requests to GSM Arena"
echo ""

# Start monitoring logs in background
LOG_FILE=$(mktemp)
docker-compose logs -f > "$LOG_FILE" 2>&1 &
LOG_PID=$!

# Make the scraping request
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3005/devices/search \
  -H "Content-Type: application/json" \
  -d '{
    "brand_name": "nothing",
    "minYear": 2023
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "   HTTP Status Code: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Request successful${NC}"
    DEVICE_COUNT=$(echo "$BODY" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data.get('data', {}).get('devices', [])))" 2>/dev/null || echo "0")
    echo "   Devices found: $DEVICE_COUNT"
else
    echo -e "${YELLOW}⚠️  Request returned status $HTTP_CODE${NC}"
    echo "   Response: $BODY"
fi

# Wait a bit for all requests to complete
echo ""
echo "⏳ Waiting 10 seconds for all requests to complete..."
sleep 10

# Stop log monitoring
kill $LOG_PID 2>/dev/null || true
wait $LOG_PID 2>/dev/null || true

# Step 6: Check for 429 errors in logs
echo ""
echo "🔍 Step 6: Checking logs for 429 errors..."
echo ""

# Check for 429 errors
ERROR_429_COUNT=$(grep -i "429" "$LOG_FILE" | wc -l | tr -d ' ')
RATE_LIMIT_COUNT=$(grep -i "rate limit\|429\|rate limited" "$LOG_FILE" | wc -l | tr -d ' ')

if [ "$ERROR_429_COUNT" -gt 0 ] || [ "$RATE_LIMIT_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Found potential rate limit mentions in logs:${NC}"
    echo "   429 errors: $ERROR_429_COUNT"
    echo "   Rate limit mentions: $RATE_LIMIT_COUNT"
    echo ""
    echo "   Relevant log lines:"
    grep -i "429\|rate limit\|rate limited" "$LOG_FILE" | tail -10
else
    echo -e "${GREEN}✅ No 429 errors found in logs${NC}"
fi

# Step 7: Get final status
echo ""
echo "📊 Step 7: Getting final rate limiter status..."
FINAL_STATUS=$(curl -s http://localhost:3005/status)
echo "$FINAL_STATUS" | python3 -m json.tool 2>/dev/null || echo "$FINAL_STATUS"

# Extract rate limiter stats
TOTAL_REQUESTS=$(echo "$FINAL_STATUS" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('rateLimiter', {}).get('totalRequests', 0))" 2>/dev/null || echo "0")
RATE_LIMITED=$(echo "$FINAL_STATUS" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('rateLimiter', {}).get('rateLimitedRequests', 0))" 2>/dev/null || echo "0")
FAILED_REQUESTS=$(echo "$FINAL_STATUS" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('rateLimiter', {}).get('failedRequests', 0))" 2>/dev/null || echo "0")
CIRCUIT_OPEN=$(echo "$FINAL_STATUS" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('rateLimiter', {}).get('circuitBreakerOpen', False))" 2>/dev/null || echo "false")

# Step 8: Summary
echo ""
echo "============================"
echo "📋 Test Summary"
echo "============================"
echo "Total Requests: $TOTAL_REQUESTS"
echo "Rate Limited Requests: $RATE_LIMITED"
echo "Failed Requests: $FAILED_REQUESTS"
echo "Circuit Breaker Open: $CIRCUIT_OPEN"
echo "429 Errors in Logs: $ERROR_429_COUNT"
echo ""

if [ "$ERROR_429_COUNT" -eq 0 ] && [ "$RATE_LIMITED" -eq 0 ] && [ "$FAILED_REQUESTS" -eq 0 ]; then
    echo -e "${GREEN}🎉 SUCCESS: No 429 errors detected!${NC}"
    echo -e "${GREEN}✅ Rate limiting is working correctly${NC}"
    rm -f "$LOG_FILE"
    exit 0
else
    echo -e "${YELLOW}⚠️  WARNING: Some rate limiting issues detected${NC}"
    if [ "$RATE_LIMITED" -gt 0 ]; then
        echo "   - Rate limiter caught and handled $RATE_LIMITED request(s)"
        echo "   - This is actually good - the rate limiter is working!"
    fi
    if [ "$ERROR_429_COUNT" -gt 0 ]; then
        echo "   - Found $ERROR_429_COUNT mention(s) of 429 in logs"
    fi
    rm -f "$LOG_FILE"
    exit 1
fi

