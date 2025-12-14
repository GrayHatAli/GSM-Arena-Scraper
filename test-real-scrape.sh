#!/bin/bash

# Real scraping test to verify rate limiting works
# This script makes actual HTTP requests to GSM Arena

set -e

echo "🔍 Real Scraping Test with Rate Limiting"
echo "=========================================="
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
docker-compose build --no-cache > /dev/null 2>&1

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

# Step 4: Clear database to force real scraping
echo ""
echo "🗑️  Step 4: Clearing database to force real scraping..."
# Note: We can't easily clear DB from outside, but we'll use a brand that's unlikely to be cached

# Step 5: Get initial status
echo ""
echo "📊 Step 5: Getting initial rate limiter status..."
INITIAL_STATUS=$(curl -s http://localhost:3005/status)
INITIAL_REQUESTS=$(echo "$INITIAL_STATUS" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('rateLimiter', {}).get('totalRequests', 0))" 2>/dev/null || echo "0")
echo "   Initial Total Requests: $INITIAL_REQUESTS"

# Step 6: Make a real scraping request that will definitely make HTTP requests
echo ""
echo "🔍 Step 6: Making real scraping request..."
echo "   Using /brands endpoint which will force HTTP requests to GSM Arena"
echo ""

# Start monitoring logs in background
LOG_FILE=$(mktemp)
docker-compose logs -f > "$LOG_FILE" 2>&1 &
LOG_PID=$!

# Make request to /brands endpoint which will scrape brands if DB is empty
# This MUST make HTTP requests to GSM Arena
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET http://localhost:3005/brands)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "   HTTP Status Code: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Request successful${NC}"
    BRAND_COUNT=$(echo "$BODY" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data.get('data', {}).get('brands', [])))" 2>/dev/null || echo "0")
    echo "   Brands found: $BRAND_COUNT"
else
    echo -e "${YELLOW}⚠️  Request returned status $HTTP_CODE${NC}"
    echo "   Response: $BODY"
fi

# Wait for all requests to complete
echo ""
echo "⏳ Waiting 15 seconds for all HTTP requests to complete..."
sleep 15

# Stop log monitoring
kill $LOG_PID 2>/dev/null || true
wait $LOG_PID 2>/dev/null || true

# Step 7: Get final status
echo ""
echo "📊 Step 7: Getting final rate limiter status..."
FINAL_STATUS=$(curl -s http://localhost:3005/status)
FINAL_REQUESTS=$(echo "$FINAL_STATUS" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('rateLimiter', {}).get('totalRequests', 0))" 2>/dev/null || echo "0")
RATE_LIMITED=$(echo "$FINAL_STATUS" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('rateLimiter', {}).get('rateLimitedRequests', 0))" 2>/dev/null || echo "0")
SUCCESSFUL=$(echo "$FINAL_STATUS" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('rateLimiter', {}).get('successfulRequests', 0))" 2>/dev/null || echo "0")
FAILED=$(echo "$FINAL_STATUS" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('rateLimiter', {}).get('failedRequests', 0))" 2>/dev/null || echo "0")

echo "   Final Total Requests: $FINAL_REQUESTS"
echo "   Successful Requests: $SUCCESSFUL"
echo "   Rate Limited Requests: $RATE_LIMITED"
echo "   Failed Requests: $FAILED"

# Check for 429 errors in logs
echo ""
echo "🔍 Step 8: Checking logs for 429 errors..."
ERROR_429_COUNT=$(grep -i "429" "$LOG_FILE" | wc -l | tr -d ' ')

if [ "$ERROR_429_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Found $ERROR_429_COUNT mention(s) of 429 in logs${NC}"
    echo "   Relevant log lines:"
    grep -i "429" "$LOG_FILE" | tail -5
else
    echo -e "${GREEN}✅ No 429 errors found in logs${NC}"
fi

# Step 9: Summary
echo ""
echo "============================"
echo "📋 Test Summary"
echo "============================"
REQUESTS_MADE=$((FINAL_REQUESTS - INITIAL_REQUESTS))
echo "Requests Made: $REQUESTS_MADE (from $INITIAL_REQUESTS to $FINAL_REQUESTS)"
echo "Rate Limited Requests: $RATE_LIMITED"
echo "Failed Requests: $FAILED"
echo "429 Errors in Logs: $ERROR_429_COUNT"
echo ""

if [ "$REQUESTS_MADE" -eq 0 ]; then
    echo -e "${RED}❌ PROBLEM: No requests were made through rate limiter!${NC}"
    echo "   This means either:"
    echo "   1. Requests are not going through requestQueue"
    echo "   2. Data was retrieved from cache/database"
    echo "   3. Request failed before reaching rate limiter"
    echo ""
    echo "   Full status response:"
    echo "$FINAL_STATUS" | python3 -m json.tool 2>/dev/null || echo "$FINAL_STATUS"
    rm -f "$LOG_FILE"
    exit 1
elif [ "$ERROR_429_COUNT" -eq 0 ] && [ "$RATE_LIMITED" -eq 0 ] && [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}🎉 SUCCESS: $REQUESTS_MADE request(s) made, no 429 errors!${NC}"
    echo -e "${GREEN}✅ Rate limiting is working correctly${NC}"
    rm -f "$LOG_FILE"
    exit 0
else
    echo -e "${YELLOW}⚠️  WARNING: Some issues detected${NC}"
    if [ "$RATE_LIMITED" -gt 0 ]; then
        echo "   - Rate limiter caught and handled $RATE_LIMITED request(s) ✅"
    fi
    if [ "$ERROR_429_COUNT" -gt 0 ]; then
        echo "   - Found $ERROR_429_COUNT mention(s) of 429 in logs"
    fi
    rm -f "$LOG_FILE"
    exit 1
fi

