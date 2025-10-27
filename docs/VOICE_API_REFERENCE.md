# Voice API Reference

Complete reference for Eliza Cloud's Voice Generation and Voice Cloning APIs. All voice services are powered by ElevenLabs and accessible through the API Explorer at `/dashboard/api-explorer`.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Voice Generation APIs](#voice-generation-apis)
  - [Text-to-Speech](#text-to-speech)
  - [Speech-to-Text](#speech-to-text)
  - [List Available Voices](#list-available-voices)
- [Voice Cloning APIs](#voice-cloning-apis)
  - [Clone Voice](#clone-voice)
  - [List User Voices](#list-user-voices)
  - [Get Voice Details](#get-voice-details)
  - [Update Voice](#update-voice)
  - [Delete Voice](#delete-voice)
- [Rate Limits](#rate-limits)
- [Error Codes](#error-codes)
- [Examples](#examples)

---

## Overview

The Voice APIs provide two main categories of services:

1. **Voice Generation**: Real-time text-to-speech and speech-to-text conversion
2. **Voice Cloning**: Create and manage custom AI voice clones from audio samples

All endpoints require authentication and are available through both session auth and API keys (where applicable).

---

## Authentication

Voice APIs support two authentication methods:

### Session Authentication

Standard authentication for logged-in users through Privy:

```bash
# Automatically handled by the browser session
# No additional headers required when using the web interface
```

### API Key Authentication

For programmatic access, use Bearer token authentication:

```bash
Authorization: Bearer eliza_your_api_key_here
```

**Note**: Some endpoints (like voice cloning) may be session-only for security reasons.

---

## Voice Generation APIs

### Text-to-Speech

Convert text to realistic speech audio.

**Endpoint**: `POST /api/elevenlabs/tts`

**Request Body**:

```json
{
  "text": "Hello! This is a sample text-to-speech conversion.",
  "voiceId": "21m00Tcm4TlvDq8ikWAM",
  "modelId": "eleven_flash_v2_5"
}
```

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| text | string | Yes | Text to convert (max 5000 characters) |
| voiceId | string | No | ElevenLabs voice ID or custom voice |
| modelId | string | No | Voice model (default: eleven_flash_v2_5) |

**Available Models**:

- `eleven_flash_v2_5` - Fast, high-quality (recommended)
- `eleven_turbo_v2_5` - Ultra-fast with good quality
- `eleven_multilingual_v2` - Supports multiple languages
- `eleven_monolingual_v1` - English only, legacy

**Response**:

- Streaming audio response (audio/mpeg)
- Headers: `Content-Type: audio/mpeg`, `Transfer-Encoding: chunked`

**Rate Limit**: 100 requests/minute

**Example**:

```bash
curl -X POST https://cloud.eliza.ai/api/elevenlabs/tts \
  -H "Authorization: Bearer eliza_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Welcome to Eliza Cloud voice generation.",
    "modelId": "eleven_flash_v2_5"
  }' \
  --output speech.mp3
```

---

### Speech-to-Text

Transcribe audio files to text.

**Endpoint**: `POST /api/elevenlabs/stt`

**Request**: multipart/form-data

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| audio | File | Yes | Audio file (mp3, wav, m4a, webm, ogg) |
| languageCode | string | No | ISO 639-1 code (e.g., "en", "es") |

**File Requirements**:

- Maximum size: 25MB
- Supported formats: MP3, WAV, M4A, WebM, OGG
- Audio-only files (video containers with audio tracks accepted)

**Response**:

```json
{
  "transcript": "This is the transcribed text from the audio file.",
  "duration_ms": 1234
}
```

**Rate Limit**: 50 requests/minute

**Important**: Requires a paid ElevenLabs plan (Starter tier or higher). Free tier does not support STT.

**Example**:

```bash
curl -X POST https://cloud.eliza.ai/api/elevenlabs/stt \
  -H "Authorization: Bearer eliza_your_api_key" \
  -F "audio=@recording.mp3" \
  -F "languageCode=en"
```

---

### List Available Voices

Get all pre-built ElevenLabs voices.

**Endpoint**: `GET /api/elevenlabs/voices`

**Response**:

```json
{
  "voices": [
    {
      "voice_id": "21m00Tcm4TlvDq8ikWAM",
      "name": "Rachel",
      "category": "premade",
      "description": "Young American female voice",
      "preview_url": "https://..."
    }
  ]
}
```

**Example**:

```bash
curl https://cloud.eliza.ai/api/elevenlabs/voices \
  -H "Authorization: Bearer eliza_your_api_key"
```

---

## Voice Cloning APIs

### Clone Voice

Create a custom voice clone from audio samples.

**Endpoint**: `POST /api/elevenlabs/voices/clone`

**Request**: multipart/form-data

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | Name for the voice |
| description | string | No | Optional description |
| cloneType | string | Yes | "instant" or "professional" |
| file0 | File | Yes | First audio sample |
| file1-9 | File | No | Additional samples (up to 10 total) |
| settings | string | No | JSON string of voice settings |

**Clone Types**:

| Type         | Cost        | Duration    | Quality   | Use Case                           |
| ------------ | ----------- | ----------- | --------- | ---------------------------------- |
| Instant      | 50 credits  | ~30 seconds | Good      | Quick prototyping, testing         |
| Professional | 500 credits | 1-3 hours   | Excellent | Production use, high quality needs |

**Audio Requirements**:

- File count: 1-10 files
- Total size: Max 100MB
- Format: MP3, WAV, M4A, WebM, OGG
- Quality: Clear speech, minimal background noise
- Duration: 1-10 minutes of audio recommended

**Response**:

```json
{
  "success": true,
  "voice": {
    "id": "voice_abc123",
    "elevenlabsVoiceId": "elab_xyz789",
    "name": "My Custom Voice",
    "cloneType": "instant",
    "status": "processing",
    "sampleCount": 3
  },
  "job": {
    "id": "job_123",
    "status": "processing",
    "progress": 0
  },
  "creditsDeducted": 50,
  "newBalance": 950,
  "estimatedCompletionTime": "30 seconds"
}
```

**Rate Limit**: 10 requests/hour

**Example**:

```bash
curl -X POST https://cloud.eliza.ai/api/elevenlabs/voices/clone \
  -H "Authorization: Bearer eliza_your_api_key" \
  -F "name=My Custom Voice" \
  -F "description=Professional narrator voice" \
  -F "cloneType=instant" \
  -F "file0=@sample1.mp3" \
  -F "file1=@sample2.mp3" \
  -F "file2=@sample3.mp3"
```

---

### List User Voices

Get all custom voices owned by your organization.

**Endpoint**: `GET /api/elevenlabs/voices/user`

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| includeInactive | boolean | false | Include disabled voices |
| cloneType | string | - | Filter by "instant" or "professional" |
| limit | number | 50 | Max results (1-100) |
| offset | number | 0 | Pagination offset |

**Response**:

```json
{
  "success": true,
  "voices": [
    {
      "id": "voice_abc123",
      "elevenlabsVoiceId": "elab_xyz789",
      "name": "My Custom Voice",
      "cloneType": "instant",
      "sampleCount": 3,
      "usageCount": 42,
      "audioQualityScore": 0.95,
      "lastUsedAt": "2025-10-27T10:30:00Z",
      "isActive": true,
      "createdAt": "2025-10-20T10:00:00Z"
    }
  ],
  "total": 5,
  "limit": 50,
  "offset": 0,
  "hasMore": false
}
```

**Example**:

```bash
curl "https://cloud.eliza.ai/api/elevenlabs/voices/user?limit=20&cloneType=instant" \
  -H "Authorization: Bearer eliza_your_api_key"
```

---

### Get Voice Details

Retrieve detailed information about a specific voice.

**Endpoint**: `GET /api/elevenlabs/voices/{id}`

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Voice ID |

**Response**:

```json
{
  "success": true,
  "voice": {
    "id": "voice_abc123",
    "elevenlabsVoiceId": "elab_xyz789",
    "name": "My Custom Voice",
    "description": "Professional narrator voice",
    "cloneType": "instant",
    "sampleCount": 3,
    "totalAudioDurationSeconds": 180,
    "audioQualityScore": 0.95,
    "usageCount": 42,
    "lastUsedAt": "2025-10-27T10:30:00Z",
    "isActive": true,
    "isPublic": false,
    "createdAt": "2025-10-20T10:00:00Z",
    "updatedAt": "2025-10-27T09:15:00Z"
  }
}
```

**Example**:

```bash
curl https://cloud.eliza.ai/api/elevenlabs/voices/voice_abc123 \
  -H "Authorization: Bearer eliza_your_api_key"
```

---

### Update Voice

Modify a voice's properties.

**Endpoint**: `PATCH /api/elevenlabs/voices/{id}`

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Voice ID to update |

**Request Body** (all fields optional):

```json
{
  "name": "Updated Voice Name",
  "description": "Updated description",
  "settings": {
    "stability": 0.6,
    "similarity_boost": 0.8
  },
  "isActive": true
}
```

**Response**:

```json
{
  "success": true,
  "voice": {
    "id": "voice_abc123",
    "name": "Updated Voice Name",
    "isActive": true,
    "updatedAt": "2025-10-27T12:00:00Z"
  }
}
```

**Example**:

```bash
curl -X PATCH https://cloud.eliza.ai/api/elevenlabs/voices/voice_abc123 \
  -H "Authorization: Bearer eliza_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Updated Voice",
    "isActive": true
  }'
```

---

### Delete Voice

Permanently delete a cloned voice.

**Endpoint**: `DELETE /api/elevenlabs/voices/{id}`

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Voice ID to delete |

**Response**:

```json
{
  "success": true,
  "message": "Voice deleted successfully"
}
```

**Warning**: This action is permanent and cannot be undone. The voice will be removed from both Eliza Cloud and ElevenLabs.

**Example**:

```bash
curl -X DELETE https://cloud.eliza.ai/api/elevenlabs/voices/voice_abc123 \
  -H "Authorization: Bearer eliza_your_api_key"
```

---

## Rate Limits

| Endpoint               | Rate Limit          |
| ---------------------- | ------------------- |
| Text-to-Speech         | 100 requests/minute |
| Speech-to-Text         | 50 requests/minute  |
| List Voices            | Unlimited           |
| Clone Voice            | 10 requests/hour    |
| Other Voice Management | Unlimited           |

Rate limits are per organization. Exceeding limits returns `429 Too Many Requests`.

---

## Error Codes

| Code | Description           | Resolution                               |
| ---- | --------------------- | ---------------------------------------- |
| 400  | Bad Request           | Check request parameters and format      |
| 401  | Unauthorized          | Verify API key or session                |
| 402  | Payment Required      | Insufficient credits or paid plan needed |
| 404  | Not Found             | Voice ID doesn't exist or not accessible |
| 429  | Rate Limit Exceeded   | Wait and retry with backoff              |
| 500  | Internal Server Error | Contact support if persists              |

---

## Examples

### Complete Workflow: Clone Voice and Generate Speech

```bash
#!/bin/bash

API_KEY="eliza_your_api_key"
BASE_URL="https://cloud.eliza.ai"

# Step 1: Clone a voice
echo "Creating voice clone..."
CLONE_RESPONSE=$(curl -X POST "$BASE_URL/api/elevenlabs/voices/clone" \
  -H "Authorization: Bearer $API_KEY" \
  -F "name=My AI Voice" \
  -F "cloneType=instant" \
  -F "file0=@sample1.mp3" \
  -F "file1=@sample2.mp3")

VOICE_ID=$(echo $CLONE_RESPONSE | jq -r '.voice.id')
ELEVENLABS_ID=$(echo $CLONE_RESPONSE | jq -r '.voice.elevenlabsVoiceId')

echo "Voice created: $VOICE_ID"
echo "Waiting for processing (30 seconds for instant clone)..."
sleep 30

# Step 2: Check voice status
echo "Checking voice status..."
curl "$BASE_URL/api/elevenlabs/voices/$VOICE_ID" \
  -H "Authorization: Bearer $API_KEY" | jq .

# Step 3: Generate speech with custom voice
echo "Generating speech with cloned voice..."
curl -X POST "$BASE_URL/api/elevenlabs/tts" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"text\": \"Hello, this is my custom AI voice clone!\",
    \"voiceId\": \"$ELEVENLABS_ID\",
    \"modelId\": \"eleven_flash_v2_5\"
  }" \
  --output custom_voice_output.mp3

echo "Audio saved to custom_voice_output.mp3"

# Step 4: List all my voices
echo "My cloned voices:"
curl "$BASE_URL/api/elevenlabs/voices/user?limit=10" \
  -H "Authorization: Bearer $API_KEY" | jq '.voices[] | {id, name, usageCount}'
```

### Node.js Example

```typescript
import axios from "axios";
import FormData from "form-data";
import fs from "fs";

const API_KEY = "eliza_your_api_key";
const BASE_URL = "https://cloud.eliza.ai";

// Text-to-Speech
async function textToSpeech(text: string, voiceId?: string) {
  const response = await axios.post(
    `${BASE_URL}/api/elevenlabs/tts`,
    {
      text,
      voiceId,
      modelId: "eleven_flash_v2_5",
    },
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      responseType: "arraybuffer",
    }
  );

  fs.writeFileSync("output.mp3", response.data);
  console.log("Audio saved to output.mp3");
}

// Clone Voice
async function cloneVoice(name: string, files: string[]) {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("cloneType", "instant");

  files.forEach((file, index) => {
    formData.append(`file${index}`, fs.createReadStream(file));
  });

  const response = await axios.post(
    `${BASE_URL}/api/elevenlabs/voices/clone`,
    formData,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        ...formData.getHeaders(),
      },
    }
  );

  return response.data;
}

// Usage
async function main() {
  // Clone a voice
  const cloneResult = await cloneVoice("My Voice", [
    "./sample1.mp3",
    "./sample2.mp3",
  ]);

  console.log("Voice cloned:", cloneResult.voice.id);

  // Wait for processing
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Generate speech with cloned voice
  await textToSpeech(
    "Hello from my cloned voice!",
    cloneResult.voice.elevenlabsVoiceId
  );
}

main().catch(console.error);
```

### Python Example

```python
import requests
import time

API_KEY = "eliza_your_api_key"
BASE_URL = "https://cloud.eliza.ai"

headers = {
    "Authorization": f"Bearer {API_KEY}"
}

# Text-to-Speech
def text_to_speech(text, voice_id=None):
    response = requests.post(
        f"{BASE_URL}/api/elevenlabs/tts",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "text": text,
            "voiceId": voice_id,
            "modelId": "eleven_flash_v2_5"
        },
        stream=True
    )

    with open("output.mp3", "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)

    print("Audio saved to output.mp3")

# Clone Voice
def clone_voice(name, files):
    files_data = [
        ("file" + str(i), open(f, "rb"))
        for i, f in enumerate(files)
    ]

    response = requests.post(
        f"{BASE_URL}/api/elevenlabs/voices/clone",
        headers=headers,
        data={
            "name": name,
            "cloneType": "instant"
        },
        files=files_data
    )

    return response.json()

# Usage
if __name__ == "__main__":
    # Clone voice
    result = clone_voice("My Voice", [
        "sample1.mp3",
        "sample2.mp3"
    ])

    print(f"Voice cloned: {result['voice']['id']}")

    # Wait for processing
    time.sleep(30)

    # Generate speech
    text_to_speech(
        "Hello from my cloned voice!",
        result['voice']['elevenlabsVoiceId']
    )
```

---

## Support

For issues or questions:

- 📚 Documentation: [https://docs.eliza.ai](https://docs.eliza.ai)
- 🐛 Issues: [GitHub Issues](https://github.com/elizaOS/eliza-cloud-v2/issues)
- 💬 Community: [Discord](https://discord.gg/eliza)

---

**Last Updated**: October 27, 2025
**API Version**: 1.0.0
