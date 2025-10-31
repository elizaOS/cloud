#!/bin/bash

echo "🧪 Testing free tier with 5 consecutive requests..."
echo

API_KEY="eliza_bd17e026be1f0014026f51758d8193e5e43aaf480064e5372c93d095c446965a"

for i in {1..5}; do
  echo "Request $i:"

  response=$(curl -s -X POST http://localhost:3000/api/v1/chat/completions \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"model\": \"gpt-4o-mini\", \"messages\": [{\"role\": \"user\", \"content\": \"Test $i\"}], \"max_tokens\": 10}")

  if echo "$response" | grep -q '"error"'; then
    error_msg=$(echo "$response" | jq -r '.error.message')
    echo "  ❌ ERROR: $error_msg"
    echo
  else
    content=$(echo "$response" | jq -r '.choices[0].message.content' 2>/dev/null)
    echo "  ✅ SUCCESS: $content"
    echo
  fi

  sleep 0.3
done

echo "✅ Test completed"
