#!/bin/bash

# Test script to emulate clone-your-crush affiliate API call with imageUrls
# This verifies that imageUrls are properly stored in the database

API_KEY="eliza_b1eb140047ea31d9c1783b29ceade064a5594c8a6e12b2844050477fc047da61"
BASE_URL="http://localhost:3000"

# Test image URLs (using Vercel Blob storage format)
IMAGE_URL_1="https://abcdef123456.public.blob.vercel-storage.com/crush-avatars/test-image-1.jpg"
IMAGE_URL_2="https://abcdef123456.public.blob.vercel-storage.com/crush-avatars/test-image-2.jpg"
IMAGE_URL_3="https://abcdef123456.public.blob.vercel-storage.com/crush-avatars/test-image-3.jpg"

echo "=============================================="
echo "Testing Affiliate API with imageUrls"
echo "=============================================="
echo ""
echo "API URL: ${BASE_URL}/api/affiliate/create-character"
echo "Image URLs being sent:"
echo "  1. ${IMAGE_URL_1}"
echo "  2. ${IMAGE_URL_2}"
echo "  3. ${IMAGE_URL_3}"
echo ""

# Make the API call
RESPONSE=$(curl -s -X POST "${BASE_URL}/api/affiliate/create-character" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "{
    \"character\": {
      \"name\": \"TestCrush_$(date +%s)\",
      \"bio\": [\"A flirty personality.\", \"Playful and teasing.\"],
      \"lore\": [\"Has a special connection with the user.\"],
      \"style\": {
        \"all\": [\"Be flirty and playful\"],
        \"chat\": [\"Use casual language\"]
      }
    },
    \"affiliateId\": \"clone-your-crush\",
    \"metadata\": {
      \"source\": \"test-script\",
      \"vibe\": \"flirty\",
      \"backstory\": \"Test character for imageUrls verification\",
      \"instagram\": \"testuser\",
      \"twitter\": \"testuser\",
      \"imageUrls\": [
        \"${IMAGE_URL_1}\",
        \"${IMAGE_URL_2}\",
        \"${IMAGE_URL_3}\"
      ],
      \"socialContent\": \"This is test social content for the character.\"
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
  echo "Now querying database to verify imageUrls..."
  echo ""

  # Query the database using docker
  docker exec eliza-local-db psql -U eliza_dev -d eliza_dev -c "
    SELECT
      id,
      name,
      avatar_url,
      character_data->'affiliate'->'imageUrls' as image_urls,
      jsonb_array_length(character_data->'affiliate'->'imageUrls') as image_count
    FROM user_characters
    WHERE id = '${CHARACTER_ID}'::uuid;
  "

  echo ""
  echo "Full affiliate data:"
  docker exec eliza-local-db psql -U eliza_dev -d eliza_dev -c "
    SELECT character_data->'affiliate' as affiliate_data
    FROM user_characters
    WHERE id = '${CHARACTER_ID}'::uuid;
  " | head -20
else
  echo "=============================================="
  echo "ERROR: Failed to create character"
  echo "=============================================="
fi
