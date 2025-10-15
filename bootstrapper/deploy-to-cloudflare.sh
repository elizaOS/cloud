#!/bin/bash
# Deploy bootstrapper image to Cloudflare's Container Registry
# Usage: ./deploy-to-cloudflare.sh [version]

set -e

VERSION="${1:-v1.0.0}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "🚀 ElizaOS Bootstrapper - Cloudflare Deployment"
echo "================================================"
echo ""

# Check if Wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ Error: Wrangler is not installed${NC}"
    echo ""
    echo "Install Wrangler with:"
    echo "  npm install -g wrangler"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Wrangler is installed${NC}"

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Error: Docker is not running${NC}"
    echo ""
    echo "Please start Docker Desktop or Docker Engine"
    exit 1
fi

echo -e "${GREEN}✅ Docker is running${NC}"
echo ""

# Check if logged in to Cloudflare
echo "🔐 Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Cloudflare${NC}"
    echo "Running: wrangler login"
    echo ""
    wrangler login
else
    ACCOUNT_INFO=$(wrangler whoami)
    echo -e "${GREEN}✅ Already authenticated${NC}"
    echo "$ACCOUNT_INFO"
fi

echo ""
echo "📦 Configuration:"
echo "  - Image: elizaos-bootstrapper"
echo "  - Version: ${VERSION}"
echo "  - Registry: registry.cloudflare.com"
echo ""

# Get account ID
ACCOUNT_ID=$(wrangler whoami | grep -oP 'Account ID: \K[a-f0-9]+' || echo "")
if [ -z "$ACCOUNT_ID" ]; then
    # Try alternative method
    ACCOUNT_ID=$(wrangler whoami | grep "Account ID" | awk '{print $3}' || echo "")
fi

if [ -n "$ACCOUNT_ID" ]; then
    echo -e "${BLUE}ℹ️  Account ID: ${ACCOUNT_ID}${NC}"
    echo ""
fi

# Build and push using Wrangler
echo "🏗️  Building Docker image..."
echo "Image: elizaos-bootstrapper:${VERSION}"

# Build and push in one command
echo ""
echo "📤 Building and pushing to Cloudflare registry..."
wrangler containers build -p -t elizaos-bootstrapper:${VERSION} . || {
    echo ""
    echo -e "${RED}❌ Failed to build and push image${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Ensure Dockerfile exists in current directory"
    echo "  2. Check Docker is running: docker info"
    echo "  3. Verify Cloudflare login: wrangler whoami"
    echo "  4. Check Dockerfile builds locally: docker build -t test ."
    exit 1
}

echo ""
echo -e "${GREEN}✅ Image pushed to Cloudflare registry${NC}"

# Tag as latest
echo ""
echo "🏷️  Tagging as latest..."
# We need to push the latest tag separately
docker tag elizaos-bootstrapper:${VERSION} elizaos-bootstrapper:latest
wrangler containers push elizaos-bootstrapper:latest || {
    echo -e "${YELLOW}⚠️  Warning: Failed to push 'latest' tag${NC}"
    echo "The versioned tag was pushed successfully"
}

echo ""
echo "📋 Listing images in Cloudflare registry..."
wrangler containers images list || {
    echo -e "${YELLOW}⚠️  Could not list images${NC}"
}

echo ""
echo -e "${GREEN}✅ Deployment successful!${NC}"
echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo ""

if [ -n "$ACCOUNT_ID" ]; then
    FULL_IMAGE_PATH="registry.cloudflare.com/${ACCOUNT_ID}/elizaos-bootstrapper:${VERSION}"
    echo "1. Update your production .env file:"
    echo "   BOOTSTRAPPER_IMAGE_TAG=${FULL_IMAGE_PATH}"
    echo ""
    echo "   Or use 'latest':"
    echo "   BOOTSTRAPPER_IMAGE_TAG=registry.cloudflare.com/${ACCOUNT_ID}/elizaos-bootstrapper:latest"
else
    echo "1. Get your account ID:"
    echo "   wrangler whoami"
    echo ""
    echo "2. Update your production .env file:"
    echo "   BOOTSTRAPPER_IMAGE_TAG=registry.cloudflare.com/YOUR_ACCOUNT_ID/elizaos-bootstrapper:${VERSION}"
fi

echo ""
echo "2. Verify image is in Cloudflare registry:"
echo "   wrangler containers images list"
echo ""
echo "3. Deploy your platform:"
echo "   cd /Users/cjft/Documents/git/eliza/eliza-cloud-v2"
echo "   npm run build && npm start"
echo ""
echo "4. Test deployment:"
echo "   cd your-elizaos-project"
echo "   elizaos deploy --name test-agent"
echo ""
echo "=========================================="
echo ""
echo -e "${BLUE}📚 Documentation:${NC}"
echo "  - CLOUDFLARE_CORRECT_DEPLOYMENT.md"
echo "  - Cloudflare Docs: https://developers.cloudflare.com/containers/"
echo ""

