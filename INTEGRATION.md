# CloneUrCrush → ElizaOS Cloud Integration Guide

## 📋 Overview

This document explains how to securely integrate the CloneUrCrush landing page with ElizaOS Cloud platform for character creation and chat functionality.

---

## 🔄 Current Flow

```
User fills form → Submit → API creates character → /connecting animation → Redirect to ElizaOS Cloud
```

### Current State (Landing Page)

**URL:** `https://cloneurcrush.com` (or your domain)

**Form Data Collected:**
- `name` - Character name/nickname (string)
- `vibe` - Personality type (playful | mysterious | romantic | bold | shy | flirty | intellectual | spicy)
- `backstory` - Optional relationship context (string)
- `instagram` - Optional Instagram handle (string)
- `twitter` - Optional X/Twitter handle (string)
- `photos` - Optional 1-3 images (File[])

**Current API Route:** `/api/create-crush`
- Location: `app/api/create-crush/route.ts`
- Currently returns: `{ characterId, sessionId }` (UUIDs)
- Status: **STUBBED** - needs real implementation

**Connecting Page:** `/connecting`
- Shows vibe-specific loading animation
- Current timeout: 6 seconds (commented out)
- Redirects to: `${ELIZA_CLOUD_URL}/chat/${characterId}?params...`

---

## 🎯 Integration Architecture

### Option 1: Affiliate API (Recommended)

ElizaOS Cloud should provide an **Affiliate API** that allows external apps to create characters and redirect users.

```
┌─────────────────────┐
│  CloneUrCrush       │
│  Landing Page       │
└──────────┬──────────┘
           │
           │ 1. POST /api/create-crush
           │    (form data)
           ▼
┌─────────────────────┐
│  Landing Page API   │
│  /api/create-crush  │
└──────────┬──────────┘
           │
           │ 2. POST /api/affiliate/create-character
           │    (ElizaOS format + affiliateId)
           ▼
┌─────────────────────┐
│  ElizaOS Cloud      │
│  localhost:3000     │
└──────────┬──────────┘
           │
           │ 3. Returns { characterId, sessionId }
           ▼
┌─────────────────────┐
│  /connecting page   │
│  Shows animation    │
└──────────┬──────────┘
           │
           │ 4. Redirect to chat
           │    localhost:3000/chat/${characterId}
           ▼
┌─────────────────────┐
│  ElizaOS Cloud      │
│  Chat Interface     │
└─────────────────────┘
```

---

## 🔐 Security Architecture

### Backend-Only Character Creation

**❌ DO NOT:**
- Send character data directly from frontend to ElizaOS Cloud
- Expose ElizaOS API keys in frontend code
- Trust frontend data without validation

**✅ DO:**
- All ElizaOS API calls go through YOUR backend (`/api/create-crush`)
- Validate and sanitize all user input server-side
- Use server-side API keys stored in environment variables
- Generate secure session tokens server-side

### Data Flow Security

```typescript
// Frontend (client-side)
FormData → POST /api/create-crush → { characterId, sessionId }

// Backend (server-side) - YOUR RESPONSIBILITY
1. Validate input (name length, vibe enum, sanitize strings)
2. Upload photos to YOUR cloud storage (S3, Cloudinary, etc.)
3. Build ElizaOS character object
4. Call ElizaOS Affiliate API with YOUR_API_KEY
5. Return characterId + sessionId to frontend
6. Frontend redirects to ElizaOS Cloud with these IDs
```

---

## 🛠️ Implementation Steps

### Step 1: Environment Variables

Create `.env.local` in your landing page:

```bash
# ElizaOS Cloud Configuration
NEXT_PUBLIC_ELIZA_CLOUD_URL=http://localhost:3000
ELIZA_CLOUD_API_KEY=your-secret-api-key-here
ELIZA_AFFILIATE_ID=clone-your-crush

# Image Upload (choose one)
# Option A: AWS S3
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_S3_BUCKET=cloneurcrush-photos
AWS_REGION=us-east-1

# Option B: Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Security
SESSION_SECRET=your-session-secret-for-jwt
```

### Step 2: Update API Route

Replace the stubbed code in `app/api/create-crush/route.ts`:

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

// Vibe descriptions for AI prompt generation
const VIBE_PROMPTS: Record<string, string> = {
  playful: "playful, teasing, loves jokes and lighthearted banter, mischievous energy",
  mysterious: "mysterious, keeps you guessing, intriguing, reveals little about herself",
  romantic: "romantic, sweet, affectionate, genuinely caring, uses loving language",
  bold: "confident, direct, takes charge, assertive, knows what she wants",
  shy: "shy, innocent, gets nervous around you, blushes easily, cute and timid",
  flirty: "flirty, suggestive, charming, knows how to tease, playfully seductive",
  intellectual: "intellectual, loves deep conversations, witty, thought-provoking",
  spicy: "explicit, passionate, no boundaries, sensual, sexually direct",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 1. VALIDATE INPUT
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const validVibes = ["playful", "mysterious", "romantic", "bold", "shy", "flirty", "intellectual", "spicy"];
    if (!body.vibe || !validVibes.includes(body.vibe)) {
      return NextResponse.json({ error: "Valid vibe is required" }, { status: 400 });
    }

    // 2. SANITIZE INPUTS (prevent injection attacks)
    const sanitizedName = body.name.trim().slice(0, 50);
    const sanitizedBackstory = body.backstory?.trim().slice(0, 500) || "";
    const sanitizedInstagram = body.instagram?.trim().replace(/[^a-zA-Z0-9._]/g, "").slice(0, 30) || "";
    const sanitizedTwitter = body.twitter?.trim().replace(/[^a-zA-Z0-9._]/g, "").slice(0, 30) || "";

    // 3. BUILD CHARACTER BIO
    const bioLines: string[] = [
      `A ${body.vibe} personality.`,
      VIBE_PROMPTS[body.vibe],
    ];

    if (sanitizedBackstory) {
      bioLines.push(`Backstory: ${sanitizedBackstory}`);
    }

    if (sanitizedInstagram) {
      bioLines.push(`Instagram: @${sanitizedInstagram} (reference for vibe/style)`);
    }

    if (sanitizedTwitter) {
      bioLines.push(`Twitter: @${sanitizedTwitter} (reference for vibe/style)`);
    }

    // 4. TODO: UPLOAD PHOTOS (if provided)
    // const photoUrls = await uploadPhotosToS3(body.photos);

    // 5. BUILD ELIZAOS CHARACTER OBJECT
    const sessionId = randomUUID();
    const elizaCharacter = {
      name: sanitizedName,
      bio: bioLines,
      lore: [
        `${sanitizedName} has a ${body.vibe} personality.`,
        sanitizedBackstory || `You have a special connection with the user.`,
      ],
      messageExamples: [
        [
          {
            user: "{{user1}}",
            content: { text: "Hey, how are you?" },
          },
          {
            user: sanitizedName,
            content: { text: getVibeSpecificGreeting(body.vibe) },
          },
        ],
      ],
      style: {
        all: [
          `Embody a ${body.vibe} personality`,
          "Keep responses concise and natural",
          "Be conversational, not robotic",
        ],
        chat: [
          "Use casual language",
          "Show personality in every message",
          "React emotionally to what the user says",
        ],
      },
      settings: {
        secrets: {},
        voice: {
          model: "en_US-female",
        },
      },
    };

    // 6. CALL ELIZAOS CLOUD AFFILIATE API
    const elizaCloudUrl = process.env.NEXT_PUBLIC_ELIZA_CLOUD_URL || "http://localhost:3000";
    const elizaApiKey = process.env.ELIZA_CLOUD_API_KEY;
    const affiliateId = process.env.ELIZA_AFFILIATE_ID || "clone-your-crush";

    if (!elizaApiKey) {
      console.error("ELIZA_CLOUD_API_KEY not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const response = await fetch(`${elizaCloudUrl}/api/affiliate/create-character`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${elizaApiKey}`,
      },
      body: JSON.stringify({
        character: elizaCharacter,
        affiliateId,
        sessionId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("ElizaOS Cloud API error:", errorData);
      throw new Error(errorData.error || "Failed to create character in ElizaOS Cloud");
    }

    const result = await response.json();

    if (!result.success || !result.characterId) {
      throw new Error("Invalid response from ElizaOS Cloud");
    }

    // 7. RETURN CHARACTER ID & SESSION ID TO FRONTEND
    return NextResponse.json({
      success: true,
      characterId: result.characterId,
      sessionId,
      message: "Character created successfully",
    });

  } catch (error) {
    console.error("Error in create-crush API:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Helper: Generate vibe-specific greeting
function getVibeSpecificGreeting(vibe: string): string {
  const greetings: Record<string, string> = {
    playful: "Heyy! I was just thinking about you 😊",
    mysterious: "...hi. Didn't expect to see you here.",
    romantic: "Hi sweetheart 💕 I've been waiting for you",
    bold: "Hey. Glad you finally showed up.",
    shy: "Oh! Um... hi there 😳",
    flirty: "Well well, look who it is 😏",
    intellectual: "Hello! I've been pondering something interesting...",
    spicy: "Hey babe... been waiting for you 🔥",
  };
  return greetings[vibe] || "Hey there!";
}
```

---

## 🔗 Redirect Configuration

### Update `/connecting` page

In `app/connecting/page.tsx`, uncomment and update the redirect:

```typescript
useEffect(() => {
  // ... existing animation code ...

  // Redirect to ElizaOS Cloud after animation
  const elizaCloudUrl = process.env.NEXT_PUBLIC_ELIZA_CLOUD_URL || "http://localhost:3000";
  
  setTimeout(() => {
    // Build redirect URL with all context
    const redirectUrl = new URL(`${elizaCloudUrl}/chat/${characterId}`);
    redirectUrl.searchParams.set("source", "clone-your-crush");
    redirectUrl.searchParams.set("session", sessionId);
    redirectUrl.searchParams.set("name", name);
    redirectUrl.searchParams.set("vibe", vibe);
    
    // Redirect to ElizaOS Cloud
    window.location.href = redirectUrl.toString();
  }, 6000); // 6 seconds for animation

  // ... cleanup ...
}, [characterId, sessionId, name, vibe]);
```

**Final redirect URL format:**
```
http://localhost:3000/chat/abc-123-def?source=clone-your-crush&session=xyz-789&name=Luna&vibe=flirty
```

---

## 📸 Image Upload Implementation

### Option A: AWS S3 (Recommended for production)

```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function uploadPhotosToS3(photos: File[]): Promise<string[]> {
  const uploadPromises = photos.map(async (photo) => {
    const buffer = Buffer.from(await photo.arrayBuffer());
    const key = `characters/${randomUUID()}-${photo.name}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: key,
        Body: buffer,
        ContentType: photo.type,
        ACL: "public-read",
      })
    );

    return `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${key}`;
  });

  return Promise.all(uploadPromises);
}
```

### Option B: Cloudinary (Easier setup)

```typescript
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

async function uploadPhotosToCloudinary(photos: File[]): Promise<string[]> {
  const uploadPromises = photos.map(async (photo) => {
    const buffer = Buffer.from(await photo.arrayBuffer());
    const base64 = buffer.toString("base64");
    const dataUri = `data:${photo.type};base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "cloneurcrush",
      transformation: [
        { width: 800, height: 800, crop: "limit" },
        { quality: "auto" },
      ],
    });

    return result.secure_url;
  });

  return Promise.all(uploadPromises);
}
```

---

## 🎭 ElizaOS Cloud Requirements

### Expected Affiliate API Endpoint

ElizaOS Cloud should implement this endpoint:

**POST** `http://localhost:3000/api/affiliate/create-character`

**Headers:**
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_API_KEY"
}
```

**Request Body:**
```json
{
  "character": {
    "name": "Luna",
    "bio": [
      "A flirty personality.",
      "flirty, suggestive, charming, knows how to tease, playfully seductive"
    ],
    "lore": [
      "Luna has a flirty personality.",
      "We met at a coffee shop and always had chemistry."
    ],
    "messageExamples": [ /* ... */ ],
    "style": {
      "all": ["Embody a flirty personality"],
      "chat": ["Use casual language"]
    },
    "settings": {
      "secrets": {},
      "voice": { "model": "en_US-female" }
    }
  },
  "affiliateId": "clone-your-crush",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (Success):**
```json
{
  "success": true,
  "characterId": "char_abc123def456",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Character created successfully"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Invalid API key"
}
```

### Expected Chat Endpoint

**GET** `http://localhost:3000/chat/:characterId?source=clone-your-crush&session=:sessionId&name=:name&vibe=:vibe`

**What ElizaOS Cloud should do:**
1. Load the character by `characterId`
2. Create/resume a chat session using `sessionId`
3. Show character name from `name` parameter
4. Apply vibe-specific UI theme (optional)
5. Track analytics: source = "clone-your-crush"
6. Show paywall/upgrade prompt if needed

---

## 🔒 Security Best Practices

### 1. API Key Management
```bash
# NEVER commit these to git
ELIZA_CLOUD_API_KEY=sk_live_... 

# Use different keys for development/production
# Dev: sk_test_...
# Prod: sk_live_...
```

### 2. Rate Limiting
```typescript
// Add to your API route
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500, // Max 500 users per interval
});

export async function POST(request: NextRequest) {
  const ip = request.ip ?? "127.0.0.1";
  
  try {
    await limiter.check(5, ip); // 5 requests per minute per IP
  } catch {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 }
    );
  }
  
  // ... rest of API logic
}
```

### 3. Input Validation
```typescript
import { z } from "zod";

const CreateCrushSchema = z.object({
  name: z.string().min(1).max(50),
  vibe: z.enum(["playful", "mysterious", "romantic", "bold", "shy", "flirty", "intellectual", "spicy"]),
  backstory: z.string().max(500).optional(),
  instagram: z.string().regex(/^[a-zA-Z0-9._]{0,30}$/).optional(),
  twitter: z.string().regex(/^[a-zA-Z0-9._]{0,30}$/).optional(),
});

// In API route
const validatedData = CreateCrushSchema.parse(body);
```

### 4. Session Security
```typescript
import jwt from "jsonwebtoken";

// Sign session with JWT
const sessionToken = jwt.sign(
  {
    characterId: result.characterId,
    sessionId,
    createdAt: Date.now(),
  },
  process.env.SESSION_SECRET!,
  { expiresIn: "24h" }
);

// ElizaOS Cloud should verify this token
```

### 5. CORS Configuration
```typescript
// In next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "http://localhost:3000" }, // ElizaOS Cloud URL
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};
```

---

## 📊 Analytics & Tracking

### Track Conversion Funnel

```typescript
// In your API route, log key events

// 1. Form submission
analytics.track("form_submitted", {
  vibe: body.vibe,
  hasBackstory: !!body.backstory,
  hasPhotos: body.photos?.length || 0,
  hasSocials: !!(body.instagram || body.twitter),
});

// 2. Character created
analytics.track("character_created", {
  characterId: result.characterId,
  sessionId,
  vibe: body.vibe,
});

// 3. Redirect to chat (on /connecting page)
analytics.track("redirected_to_cloud", {
  characterId,
  sessionId,
  timeOnConnecting: Date.now() - startTime,
});

// 4. ElizaOS Cloud should track:
// - chat_started
// - first_message_sent
// - payment_prompt_shown
// - payment_completed
```

---

## 🧪 Testing the Integration

### Local Development Setup

1. **Start ElizaOS Cloud:**
```bash
cd path/to/elizaos-cloud
npm run dev
# Running on http://localhost:3000
```

2. **Start Landing Page:**
```bash
cd path/to/cloneurcrush-landing/launch-ui
npm run dev
# Running on http://localhost:3005 (or different port)
```

3. **Test Flow:**
```
http://localhost:3005 → Fill form → Submit
  ↓
http://localhost:3005/connecting → Animation plays
  ↓
http://localhost:3000/chat/char_123?source=clone-your-crush&session=...
```

### Manual Testing Checklist

- [ ] Form validation works (required fields)
- [ ] All 8 vibes create different character personalities
- [ ] Photos upload successfully (if implemented)
- [ ] Social media handles are sanitized
- [ ] API returns valid characterId
- [ ] /connecting animation plays for 6 seconds
- [ ] Redirect to ElizaOS Cloud succeeds
- [ ] Character appears correctly in chat
- [ ] Session persists (refresh doesn't lose character)
- [ ] Error handling works (invalid input, API down, etc.)

---

## 🚨 Error Handling

### Frontend Error States

```typescript
// In BuildYourCrushSection component
const [error, setError] = useState<string>("");

try {
  const response = await fetch("/api/create-crush", { /* ... */ });
  
  if (!response.ok) {
    if (response.status === 429) {
      setError("Too many requests. Please wait a moment and try again.");
    } else if (response.status === 500) {
      setError("Server error. Our team has been notified. Please try again.");
    } else {
      setError("Something went wrong. Please check your inputs and try again.");
    }
    return;
  }
  
  // Success - redirect to /connecting
} catch (err) {
  setError("Network error. Please check your connection and try again.");
}
```

### Backend Error Handling

```typescript
// In /api/create-crush
try {
  // Call ElizaOS Cloud API
  const response = await fetch(elizaCloudUrl, { /* ... */ });
  
  if (!response.ok) {
    // Log error for debugging
    console.error("ElizaOS Cloud error:", {
      status: response.status,
      statusText: response.statusText,
      url: elizaCloudUrl,
    });
    
    // Return user-friendly error
    return NextResponse.json(
      { error: "Failed to create your character. Please try again." },
      { status: 502 }
    );
  }
} catch (error) {
  // Network error (ElizaOS Cloud is down)
  console.error("Failed to connect to ElizaOS Cloud:", error);
  
  return NextResponse.json(
    { error: "Service temporarily unavailable. Please try again in a moment." },
    { status: 503 }
  );
}
```

---

## 🎯 Production Checklist

Before going live:

### Landing Page:
- [ ] Update `NEXT_PUBLIC_ELIZA_CLOUD_URL` to production URL
- [ ] Set up proper API key rotation
- [ ] Enable rate limiting on `/api/create-crush`
- [ ] Set up error monitoring (Sentry, LogRocket, etc.)
- [ ] Configure image CDN (CloudFront, Cloudflare)
- [ ] Add CSRF protection
- [ ] Enable HTTPS only
- [ ] Set up analytics tracking

### ElizaOS Cloud:
- [ ] Implement affiliate API endpoint
- [ ] Set up API key authentication
- [ ] Add session management
- [ ] Configure CORS for landing page domain
- [ ] Set up paywall/upgrade prompts
- [ ] Track conversion metrics
- [ ] Handle character quotas/limits per affiliate
- [ ] Add webhook for payment events

### Infrastructure:
- [ ] Set up CDN for static assets
- [ ] Configure auto-scaling for traffic spikes
- [ ] Set up database backups
- [ ] Enable DDoS protection
- [ ] Set up monitoring/alerting
- [ ] Create runbook for common issues

---

## 📚 Additional Resources

### ElizaOS Character Schema
Reference: https://elizaos.github.io/docs/api/characters

### Example Character Object:
```json
{
  "name": "Luna",
  "bio": ["Flirty and playful personality"],
  "lore": ["Background story"],
  "messageExamples": [/* conversation examples */],
  "style": {
    "all": ["personality traits"],
    "chat": ["conversation style"]
  },
  "topics": ["things she likes to talk about"],
  "adjectives": ["descriptive words"],
  "settings": {
    "secrets": {},
    "voice": { "model": "en_US-female" }
  }
}
```

---

## 🤝 Support

If you encounter issues:

1. Check logs in `/api/create-crush` route
2. Verify ElizaOS Cloud is running on localhost:3000
3. Test affiliate API endpoint directly with curl/Postman
4. Check environment variables are set correctly
5. Review CORS configuration

---

**Last Updated:** [Current Date]  
**Version:** 1.0.0  
**Status:** Ready for Implementation

