#!/bin/bash

# Test script to verify base64 image storage in affiliate API

API_KEY=process.env.TEST_API_KEY
BASE_URL="http://localhost:3000"

# Small 1x1 red pixel PNG as base64 (for testing)
BASE64_IMAGE="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="

echo "=============================================="
echo "Testing Affiliate API with Base64 Avatar"
echo "=============================================="
echo ""
echo "API URL: ${BASE_URL}/api/affiliate/create-character"
echo "Base64 Image: ${BASE64_IMAGE:0:60}..."
echo ""

# Make the API call
RESPONSE=$(curl -s -X POST "${BASE_URL}/api/affiliate/create-character" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "{
    \"character\": {
      \"name\": \"Base64Test_$(date +%s)\",
      \"bio\": [\"A test character with base64 avatar.\"],
      \"avatar_url\": \"${BASE64_IMAGE}\"
    },
    \"affiliateId\": \"clone-your-crush\",
    \"metadata\": {
      \"source\": \"test-script-base64\",
      \"vibe\": \"playful\",
      \"imageUrls\": [\"${BASE64_IMAGE}\"]
    }
  }")

echo "API Response:"
echo "${RESPONSE}" | jq . 2>/dev/null || echo "${RESPONSE}"
echo ""

# Extract character ID from response
CHARACTER_ID=$(echo "${RESPONSE}" | jq -r '.characterId' 2>/dev/null)

if [ "${CHARACTER_ID}" != "null" ] && [ -n "${CHARACTER_ID}" ]; then
  echo "=============================================="
  echo "Character created successfully!"
  echo "Character ID: ${CHARACTER_ID}"
  echo "=============================================="
  echo ""
  echo "Querying database to verify base64 avatar..."
  echo ""

  # Query the database
  docker exec eliza-local-db psql -U eliza_dev -d eliza_dev -c "
    SELECT
      id,
      name,
      CASE
        WHEN avatar_url LIKE 'data:image%' THEN 'BASE64 (' || LENGTH(avatar_url) || ' chars)'
        ELSE COALESCE(avatar_url, 'NULL')
      END as avatar_url_type,
      CASE
        WHEN character_data->'affiliate'->'imageUrls'->>0 LIKE 'data:image%' THEN 'BASE64'
        ELSE 'URL/NULL'
      END as imageUrls_type
    FROM user_characters
    WHERE id = '${CHARACTER_ID}'::uuid;
  "

  echo ""
  echo "Avatar URL preview (first 100 chars):"
  docker exec eliza-local-db psql -U eliza_dev -d eliza_dev -t -c "
    SELECT LEFT(avatar_url, 100) FROM user_characters WHERE id = '${CHARACTER_ID}'::uuid;
  "
else
  echo "=============================================="
  echo "ERROR: Failed to create character"
  echo "=============================================="
  echo "Response: ${RESPONSE}"
fi
