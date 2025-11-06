# API Guide

Learn how to integrate elizaOS Platform into your applications using our REST API.

## Getting Started with the API

### Step 1: Get an API Key

1. Go to [API Keys](/dashboard/api-keys)
2. Click "Create New Key"
3. Give your key a name (e.g., "Production App")
4. Copy and save your key securely

**Important**: Your API key gives full access to your account. Keep it secret!

### Step 2: Make Your First Request

```bash
curl -X POST https://api.elizaos.com/v1/chat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### Step 3: Handle the Response

```json
{
  "id": "msg_123",
  "content": "Hello! How can I help you today?",
  "credits_used": 2,
  "model": "gpt-4"
}
```

## Authentication

All API requests require authentication with your API key:

```
Authorization: Bearer YOUR_API_KEY
```

Add this header to every request.

## Available Endpoints

### Chat Completions

Send messages and get AI responses:

```bash
POST /v1/chat
```

**Request Body**:
```json
{
  "messages": [
    {"role": "user", "content": "What's the weather like?"}
  ],
  "model": "gpt-4",
  "character_id": "optional_character_id"
}
```

**Response**:
```json
{
  "content": "I don't have access to real-time weather data...",
  "credits_used": 3
}
```

### Image Generation

Create images from text descriptions:

```bash
POST /v1/generate-image
```

**Request Body**:
```json
{
  "prompt": "A serene mountain landscape at sunset",
  "size": "1024x1024"
}
```

**Response**:
```json
{
  "image_url": "https://storage.elizaos.com/images/abc123.png",
  "credits_used": 10
}
```

### Video Generation

Generate videos from prompts:

```bash
POST /v1/generate-video
```

**Request Body**:
```json
{
  "prompt": "A cat playing with a ball of yarn",
  "duration": 5
}
```

**Response**:
```json
{
  "video_url": "https://storage.elizaos.com/videos/xyz789.mp4",
  "credits_used": 50,
  "status": "completed"
}
```

## Rate Limits

To ensure fair usage, we enforce rate limits:

- **Standard**: 60 requests per minute
- **Burst**: Up to 100 requests in short bursts
- **Daily**: 10,000 requests per day

If you hit a rate limit, wait and retry. The response headers show your limits:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1609459200
```

## Error Handling

The API returns standard HTTP status codes:

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request - Check your parameters |
| 401 | Unauthorized - Invalid API key |
| 402 | Payment Required - Insufficient credits |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Server Error - We're working on it |

**Error Response Format**:
```json
{
  "error": {
    "code": "insufficient_credits",
    "message": "You need 10 credits but have 5",
    "credits_required": 10,
    "credits_available": 5
  }
}
```

## Code Examples

### Python

```python
import requests

API_KEY = "your_api_key_here"
BASE_URL = "https://api.elizaos.com/v1"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Send a chat message
response = requests.post(
    f"{BASE_URL}/chat",
    headers=headers,
    json={
        "messages": [
            {"role": "user", "content": "Hello!"}
        ]
    }
)

print(response.json())
```

### JavaScript

```javascript
const API_KEY = 'your_api_key_here';
const BASE_URL = 'https://api.elizaos.com/v1';

async function chat(message) {
  const response = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: message }
      ]
    })
  });
  
  return await response.json();
}

chat('Hello!').then(console.log);
```

## Best Practices

### 1. Keep API Keys Secure

- Never commit keys to version control
- Use environment variables
- Rotate keys regularly
- Use different keys for dev/production

### 2. Handle Errors Gracefully

Always check for errors and handle them appropriately:

```javascript
try {
  const response = await chat('Hello');
  if (response.error) {
    console.error('API Error:', response.error.message);
  }
} catch (error) {
  console.error('Network Error:', error);
}
```

### 3. Monitor Your Usage

Track API usage to avoid surprises:

- Check [Analytics](/dashboard/analytics) regularly
- Set up low-credit alerts
- Monitor rate limit headers

### 4. Use Webhooks

For long-running operations (like video generation), use webhooks instead of polling:

```json
{
  "prompt": "Generate a video",
  "webhook_url": "https://your-app.com/webhook"
}
```

### 5. Implement Retries

Retry failed requests with exponential backoff:

```javascript
async function retryRequest(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, 2 ** i * 1000));
    }
  }
}
```

## Testing

### Sandbox Environment

Test your integration safely:

- Use test API keys (prefix: `test_`)
- No credits charged in test mode
- All features available
- Data cleared weekly

Get test keys in [API Keys](/dashboard/api-keys).

### API Explorer

Try the API directly in your browser:

1. Visit [API Explorer](/dashboard/api-explorer)
2. Select an endpoint
3. Fill in parameters
4. Click "Send Request"
5. View response

Perfect for testing before coding!

## SDKs & Libraries

Official SDKs coming soon for:

- Python
- JavaScript/TypeScript
- Ruby
- Go

Star us on GitHub to get notified!

## Advanced Features

### Streaming Responses

Get responses as they're generated:

```javascript
const response = await fetch(`${BASE_URL}/chat`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Hello!' }],
    stream: true
  })
});

const reader = response.body.getReader();
// Read chunks as they arrive
```

### Custom Characters

Use your own characters via API:

```json
{
  "messages": [...],
  "character_id": "char_abc123"
}
```

### Batch Requests

Process multiple requests efficiently:

```json
{
  "requests": [
    {"type": "chat", "data": {...}},
    {"type": "image", "data": {...}}
  ]
}
```

## Webhooks

Receive notifications about events:

### Setting Up Webhooks

1. Go to [API Keys](/dashboard/api-keys)
2. Click on your API key
3. Add webhook URL
4. Select events to receive

### Webhook Events

- `generation.completed` - Image/video ready
- `credits.low` - Credit balance below threshold
- `agent.message` - Your agent received a message

### Webhook Payload

```json
{
  "event": "generation.completed",
  "data": {
    "id": "gen_123",
    "type": "image",
    "url": "https://storage.elizaos.com/..."
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

## Support

Need help with the API?

- Full reference: [API Documentation](/docs/api-reference)
- Code examples: [GitHub](https://github.com/elizaos)
- Community: [Discord](https://discord.gg/elizaos)
- Email: api@elizaos.com

## Changelog

Stay updated on API changes:

- [API Changelog](/docs/api-changelog)
- Subscribe to updates in your account settings

