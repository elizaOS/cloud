#!/bin/bash
# Test OpenAI Proxy Implementation
# Usage: ./scripts/test-openai-proxy.sh <API_KEY>
# Or: API_KEY=your_key ./scripts/test-openai-proxy.sh

set -e

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000/api/v1}"
API_KEY="${1:-${API_KEY}}"

# Validate API key is provided
if [ -z "$API_KEY" ]; then
  echo "❌ Error: API_KEY is required"
  echo "Usage: $0 <API_KEY>"
  echo "Or set the API_KEY environment variable: API_KEY=your_key $0"
  exit 1
fi

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Testing All OpenAI-Compatible Endpoints${NC}"
echo "==========================================="
echo "Base URL: $BASE_URL"
echo ""

# Test 1: List Models
echo -e "${YELLOW}1️⃣  GET /v1/models - List all available models${NC}"
echo "------------------------------------------------"
MODELS_RESPONSE=$(curl -s "$BASE_URL/models" -H "Authorization: Bearer $API_KEY")
MODEL_COUNT=$(echo "$MODELS_RESPONSE" | jq -r '.data | length' 2>/dev/null || echo "0")
if [ "$MODEL_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✅ Listed $MODEL_COUNT models${NC}"
  echo "$MODELS_RESPONSE" | jq -r '.data[:3] | .[] | "   - " + .id + " (" + .name + ")"'
  echo "   ... and $(($MODEL_COUNT - 3)) more"
else
  echo -e "${RED}❌ Failed to list models${NC}"
  echo "$MODELS_RESPONSE" | jq '.' || echo "$MODELS_RESPONSE"
fi
echo ""

# Test 2: Get Specific Model (with forward slash)
echo -e "${YELLOW}2️⃣  GET /v1/models/{model} - Get model details (with slash)${NC}"
echo "-----------------------------------------------------------"
MODEL_RESPONSE=$(curl -s "$BASE_URL/models/openai/gpt-4o-mini" -H "Authorization: Bearer $API_KEY")
MODEL_ID=$(echo "$MODEL_RESPONSE" | jq -r '.id // .error.message' 2>/dev/null)
if [[ "$MODEL_ID" == "openai/gpt-4o-mini" ]]; then
  echo -e "${GREEN}✅ Retrieved model: $MODEL_ID${NC}"
  echo "$MODEL_RESPONSE" | jq -r '"   Name: " + .name + "\n   Type: " + .type + "\n   Context: " + (.context_window | tostring)'
else
  echo -e "${RED}❌ Failed: $MODEL_ID${NC}"
fi
echo ""

# Test 3: Get Specific Model (URL-encoded)
echo -e "${YELLOW}3️⃣  GET /v1/models/{model} - Get model details (URL-encoded)${NC}"
echo "------------------------------------------------------------"
MODEL_RESPONSE=$(curl -s "$BASE_URL/models/openai%2Fgpt-4o-mini" -H "Authorization: Bearer $API_KEY")
MODEL_ID=$(echo "$MODEL_RESPONSE" | jq -r '.id // .error.message' 2>/dev/null)
if [[ "$MODEL_ID" == "openai/gpt-4o-mini" ]]; then
  echo -e "${GREEN}✅ Retrieved model: $MODEL_ID (URL-encoded slash works!)${NC}"
else
  echo -e "${RED}❌ Failed: $MODEL_ID${NC}"
fi
echo ""

# Test 4: Chat Completions (non-streaming)
echo -e "${YELLOW}4️⃣  POST /v1/chat/completions - Non-streaming chat${NC}"
echo "--------------------------------------------------"
CHAT_RESPONSE=$(curl -s "$BASE_URL/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{"role": "user", "content": "Say hello in 3 words"}],
    "stream": false
  }')
CHAT_CONTENT=$(echo "$CHAT_RESPONSE" | jq -r '.choices[0].message.content // .error.message' 2>/dev/null)
if [[ "$CHAT_CONTENT" != *"error"* ]] && [[ "$CHAT_CONTENT" != "null" ]]; then
  echo -e "${GREEN}✅ Chat completion successful${NC}"
  echo "   Response: $CHAT_CONTENT"
  echo "$CHAT_RESPONSE" | jq -r '"   Tokens: " + (.usage.total_tokens | tostring) + " (in: " + (.usage.prompt_tokens | tostring) + ", out: " + (.usage.completion_tokens | tostring) + ")"' 2>/dev/null || true
else
  echo -e "${RED}❌ Failed: $CHAT_CONTENT${NC}"
fi
echo ""

# Test 5: Chat Completions (streaming)
echo -e "${YELLOW}5️⃣  POST /v1/chat/completions - Streaming chat${NC}"
echo "----------------------------------------------"
STREAM_OUTPUT=$(curl -s -N "$BASE_URL/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{"role": "user", "content": "Count to 3"}],
    "stream": true
  }' | head -20)

if echo "$STREAM_OUTPUT" | grep -q "data:"; then
  echo -e "${GREEN}✅ Streaming response received${NC}"
  CHUNK_COUNT=$(echo "$STREAM_OUTPUT" | grep -c "data:" || echo "0")
  echo "   Received $CHUNK_COUNT chunks"
  # Extract first content delta
  FIRST_CONTENT=$(echo "$STREAM_OUTPUT" | grep "data:" | head -5 | grep -o '"content":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$FIRST_CONTENT" ]; then
    echo "   First content: $FIRST_CONTENT"
  fi
else
  echo -e "${RED}❌ No streaming data received${NC}"
fi
echo ""

# Test 6: Embeddings
echo -e "${YELLOW}6️⃣  POST /v1/embeddings - Generate embeddings${NC}"
echo "--------------------------------------------"
EMBED_RESPONSE=$(curl -s "$BASE_URL/embeddings" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/text-embedding-3-small",
    "input": "Hello world"
  }')
EMBED_DIMS=$(echo "$EMBED_RESPONSE" | jq -r '.data[0].embedding | length // .error.message' 2>/dev/null)
if [[ "$EMBED_DIMS" =~ ^[0-9]+$ ]]; then
  echo -e "${GREEN}✅ Embeddings generated successfully${NC}"
  echo "   Dimensions: $EMBED_DIMS"
  echo "$EMBED_RESPONSE" | jq -r '"   Tokens: " + (.usage.total_tokens | tostring)' 2>/dev/null || true
else
  echo -e "${RED}❌ Failed: $EMBED_DIMS${NC}"
fi
echo ""

# Test 7: Different providers
echo -e "${YELLOW}7️⃣  Multi-provider test${NC}"
echo "----------------------"
for model in "openai/gpt-4o-mini" "anthropic/claude-sonnet-4"; do
  echo "   Testing: $model"
  RESPONSE=$(curl -s "$BASE_URL/chat/completions" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"$model\",
      \"messages\": [{\"role\": \"user\", \"content\": \"Hi\"}],
      \"stream\": false,
      \"max_tokens\": 10
    }")
  CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content // .error.message' 2>/dev/null)
  if [[ "$CONTENT" != *"error"* ]] && [[ "$CONTENT" != "null" ]]; then
    echo -e "   ${GREEN}✅ $model working${NC}"
  else
    echo -e "   ${RED}❌ $model failed: $CONTENT${NC}"
  fi
done
echo ""

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✨ OpenAI Compatibility Test Complete${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Next steps:"
echo "  • Test with OpenAI SDKs (Python, Node, etc.)"
echo "  • Try function calling and vision features"
echo "  • Check analytics dashboard for usage tracking"
