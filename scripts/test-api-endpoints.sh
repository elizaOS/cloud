#!/bin/bash

# Stripe Credit Packs API Testing Script
# This script tests all API endpoints using curl

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Stripe Credit Packs API Tests${NC}"
echo -e "${BLUE}========================================${NC}"

# Configuration
BASE_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_...}"

echo -e "\n📋 Configuration:"
echo -e "  Base URL: ${BASE_URL}"
echo -e "  Stripe Key: ${STRIPE_SECRET_KEY:0:15}...\n"

# Function to print test header
print_test() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Test $1: $2${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Function to check if server is running
check_server() {
    echo -e "${YELLOW}Checking if server is running...${NC}"
    if curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}" | grep -q "200\|404"; then
        echo -e "${GREEN}✓ Server is running${NC}"
        return 0
    else
        echo -e "${RED}✗ Server is not running${NC}"
        echo -e "${YELLOW}💡 Please start the dev server: npm run dev${NC}"
        exit 1
    fi
}

# Test 1: Create Stripe Products via API
test_create_stripe_products() {
    print_test "1" "Create Stripe Products (via Stripe API)"
    
    if [ "$STRIPE_SECRET_KEY" = "sk_test_..." ]; then
        echo -e "${YELLOW}⏭️  Skipped: STRIPE_SECRET_KEY not configured${NC}"
        echo -e "${YELLOW}💡 Add your test key to .env.local:${NC}"
        echo -e "   STRIPE_SECRET_KEY=sk_test_your_key_here"
        return 0
    fi

    echo -e "Creating Small Credit Pack..."
    PRODUCT_RESPONSE=$(curl -s -X POST https://api.stripe.com/v1/products \
        -u "${STRIPE_SECRET_KEY}:" \
        -d "name=Small Credit Pack (Test)" \
        -d "description=50,000 credits for AI generations")
    
    PRODUCT_ID=$(echo "$PRODUCT_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -n "$PRODUCT_ID" ]; then
        echo -e "${GREEN}✓ Product created: ${PRODUCT_ID}${NC}"
        
        echo -e "Creating price..."
        PRICE_RESPONSE=$(curl -s -X POST https://api.stripe.com/v1/prices \
            -u "${STRIPE_SECRET_KEY}:" \
            -d "product=${PRODUCT_ID}" \
            -d "unit_amount=4999" \
            -d "currency=usd")
        
        PRICE_ID=$(echo "$PRICE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        
        if [ -n "$PRICE_ID" ]; then
            echo -e "${GREEN}✓ Price created: ${PRICE_ID} (\$49.99)${NC}"
            echo -e "\n📝 Save these IDs for seeding:"
            echo -e "   Product ID: ${PRODUCT_ID}"
            echo -e "   Price ID: ${PRICE_ID}"
        else
            echo -e "${RED}✗ Failed to create price${NC}"
        fi
    else
        echo -e "${RED}✗ Failed to create product${NC}"
        echo "$PRODUCT_RESPONSE"
    fi
}

# Test 2: List Credit Packs
test_list_credit_packs() {
    print_test "2" "GET /api/stripe/credit-packs"
    
    echo -e "Request:"
    echo -e "  ${BLUE}curl ${BASE_URL}/api/stripe/credit-packs${NC}\n"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/stripe/credit-packs")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    echo -e "Response:"
    echo -e "  Status: ${HTTP_CODE}"
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ Success${NC}"
        echo -e "\nBody:"
        echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
        
        # Count credit packs
        PACK_COUNT=$(echo "$BODY" | jq '.creditPacks | length' 2>/dev/null || echo "0")
        echo -e "\n📊 Found ${PACK_COUNT} credit pack(s)"
        
        if [ "$PACK_COUNT" -gt 0 ]; then
            echo -e "${GREEN}✓ Credit packs are available${NC}"
        else
            echo -e "${YELLOW}⚠️  No credit packs found. Have you run the seed script?${NC}"
            echo -e "${YELLOW}💡 Run: tsx scripts/seed-credit-packs.ts${NC}"
        fi
    else
        echo -e "${RED}✗ Failed${NC}"
        echo -e "\nBody:"
        echo "$BODY"
    fi
}

# Test 3: Create Checkout Session (will fail without auth, but tests endpoint)
test_create_checkout_session() {
    print_test "3" "POST /api/stripe/create-checkout-session"
    
    echo -e "Request:"
    echo -e "  ${BLUE}curl -X POST ${BASE_URL}/api/stripe/create-checkout-session${NC}"
    echo -e "  ${BLUE}-H 'Content-Type: application/json'${NC}"
    echo -e "  ${BLUE}-d '{\"creditPackId\": \"test-id\"}'${NC}\n"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        "${BASE_URL}/api/stripe/create-checkout-session" \
        -H "Content-Type: application/json" \
        -d '{"creditPackId": "test-id"}')
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    echo -e "Response:"
    echo -e "  Status: ${HTTP_CODE}"
    
    if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
        echo -e "${GREEN}✓ Endpoint exists (authentication required)${NC}"
    elif [ "$HTTP_CODE" = "404" ]; then
        echo -e "${YELLOW}⚠️  Endpoint not found (404)${NC}"
    elif [ "$HTTP_CODE" = "500" ]; then
        echo -e "${YELLOW}⚠️  Server error${NC}"
    fi
    
    echo -e "\nBody:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    
    echo -e "\n💡 To test fully, visit: ${BASE_URL}/dashboard/billing"
}

# Test 4: Webhook Endpoint
test_webhook_endpoint() {
    print_test "4" "POST /api/stripe/webhook"
    
    echo -e "Request:"
    echo -e "  ${BLUE}curl -X POST ${BASE_URL}/api/stripe/webhook${NC}"
    echo -e "  ${BLUE}-H 'Content-Type: application/json'${NC}"
    echo -e "  ${BLUE}-d '{\"test\": \"data\"}'${NC}\n"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        "${BASE_URL}/api/stripe/webhook" \
        -H "Content-Type: application/json" \
        -d '{"test": "data"}')
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    echo -e "Response:"
    echo -e "  Status: ${HTTP_CODE}"
    
    if [ "$HTTP_CODE" = "400" ]; then
        echo -e "${GREEN}✓ Endpoint exists (signature validation working)${NC}"
    elif [ "$HTTP_CODE" = "404" ]; then
        echo -e "${RED}✗ Endpoint not found${NC}"
    elif [ "$HTTP_CODE" = "500" ]; then
        echo -e "${YELLOW}⚠️  Server error${NC}"
    fi
    
    echo -e "\nBody:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    
    echo -e "\n💡 To test webhooks properly:"
    echo -e "   1. Install Stripe CLI: brew install stripe/stripe-cli/stripe"
    echo -e "   2. Login: stripe login"
    echo -e "   3. Forward webhooks: stripe listen --forward-to localhost:3000/api/stripe/webhook"
    echo -e "   4. Trigger event: stripe trigger checkout.session.completed"
}

# Test 5: Billing Page
test_billing_page() {
    print_test "5" "GET /dashboard/billing (HTML)"
    
    echo -e "Request:"
    echo -e "  ${BLUE}curl ${BASE_URL}/dashboard/billing${NC}\n"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" "${BASE_URL}/dashboard/billing")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    echo -e "Response:"
    echo -e "  Status: ${HTTP_CODE}"
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ Billing page accessible${NC}"
        echo -e "\n💡 Visit in browser: ${BASE_URL}/dashboard/billing"
    elif [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ]; then
        echo -e "${GREEN}✓ Page exists (redirects to login)${NC}"
    elif [ "$HTTP_CODE" = "404" ]; then
        echo -e "${RED}✗ Page not found${NC}"
    else
        echo -e "${YELLOW}⚠️  Unexpected status: ${HTTP_CODE}${NC}"
    fi
}

# Main execution
main() {
    check_server
    
    echo -e "\n${GREEN}Starting API tests...${NC}\n"
    
    # Run tests
    test_create_stripe_products
    test_list_credit_packs
    test_create_checkout_session
    test_webhook_endpoint
    test_billing_page
    
    # Summary
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}   Test Summary${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo -e "\n${GREEN}✓ All tests completed${NC}"
    echo -e "\n📋 Next Steps:"
    echo -e "  1. Check results above"
    echo -e "  2. If no credit packs found, run: tsx scripts/test-stripe-setup.ts"
    echo -e "  3. Visit billing page in browser: ${BASE_URL}/dashboard/billing"
    echo -e "  4. Complete a test purchase with card: 4242 4242 4242 4242"
    echo -e "\n💡 For local webhook testing:"
    echo -e "  stripe listen --forward-to localhost:3000/api/stripe/webhook"
}

# Run tests
main
