#!/bin/bash

# Test Script for Affiliate API Integration
# This script tests the affiliate API endpoint with various scenarios

echo "🧪 Testing Affiliate API Integration"
echo "===================================="

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-test_key_replace_me}"

echo ""
echo "📋 Configuration:"
echo "  Base URL: $BASE_URL"
echo "  API Key: ${API_KEY:0:20}..."
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run test
run_test() {
    local name="$1"
    local curl_cmd="$2"
    local expected_status="$3"
    
    echo ""
    echo "TEST: $name"
    echo "------------------------------------"
    
    # Run curl and capture response
    response=$(eval "$curl_cmd" 2>&1)
    status=$?
    
    # Extract status code
    http_code=$(echo "$response" | grep "HTTP/" | tail -1 | awk '{print $2}')
    
    # Extract body (last line after headers)
    body=$(echo "$response" | sed -n '/^{/,/^}/p' | tail -1)
    
    echo "Response Code: $http_code"
    echo "Response Body: $body" | jq '.' 2>/dev/null || echo "$body"
    
    # Check if status matches expected
    if [ "$http_code" = "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ FAIL - Expected $expected_status, got $http_code${NC}"
        ((TESTS_FAILED++))
    fi
}

# Test 1: Missing Authorization Header
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_test "Missing Authorization Header" \
    "curl -i -s -X POST $BASE_URL/api/affiliate/create-character \
    -H 'Content-Type: application/json' \
    -d '{\"character\": {\"name\": \"Test\", \"bio\": [\"Test bio\"]}}'" \
    "401"

# Test 2: Invalid API Key
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_test "Invalid API Key" \
    "curl -i -s -X POST $BASE_URL/api/affiliate/create-character \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer invalid_key_12345' \
    -d '{\"character\": {\"name\": \"Test\", \"bio\": [\"Test bio\"]}}'" \
    "401"

# Test 3: Missing Required Fields
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_test "Missing Required Fields" \
    "curl -i -s -X POST $BASE_URL/api/affiliate/create-character \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer $API_KEY' \
    -d '{\"character\": {}}'" \
    "400"

# Test 4: Valid Request (if you have a valid API key)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$API_KEY" != "test_key_replace_me" ]; then
    run_test "Valid Character Creation" \
        "curl -i -s -X POST $BASE_URL/api/affiliate/create-character \
        -H 'Content-Type: application/json' \
        -H 'Authorization: Bearer $API_KEY' \
        -d '{
            \"character\": {
                \"name\": \"Test Luna\",
                \"bio\": [\"A test character\", \"Created via API\"],
                \"style\": {
                    \"all\": [\"Be friendly\"],
                    \"chat\": [\"Use casual language\"]
                }
            },
            \"affiliateId\": \"test-affiliate\",
            \"metadata\": {
                \"source\": \"curl-test\",
                \"vibe\": \"friendly\"
            }
        }'" \
        "201"
else
    echo -e "${YELLOW}⚠️  SKIP - Set API_KEY environment variable to test valid requests${NC}"
    echo "   Usage: API_KEY=your_key_here ./test-affiliate-api.sh"
fi

# Test 5: OPTIONS (CORS Preflight)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_test "CORS Preflight (OPTIONS)" \
    "curl -i -s -X OPTIONS $BASE_URL/api/affiliate/create-character" \
    "204"

# Summary
echo ""
echo "===================================="
echo "📊 Test Summary"
echo "===================================="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi

