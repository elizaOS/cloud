# Voice Cloning Implementation Guide

**Date**: October 24, 2025  
**Status**: 📋 Planning Phase  
**Type**: Feature Enhancement

## Executive Summary

This document outlines the complete implementation strategy for integrating ElevenLabs Voice Cloning features into Eliza Cloud v2, enabling users to create, manage, and utilize custom cloned voices.

---

## Table of Contents

1. [Current State](#current-state)
2. [Voice Cloning Features](#voice-cloning-features)
3. [Architecture Design](#architecture-design)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Service Layer](#service-layer)
7. [Pricing Strategy](#pricing-strategy)
8. [Security Considerations](#security-considerations)
9. [UI/UX Flow](#uiux-flow)
10. [Implementation Phases](#implementation-phases)

---

## Current State

### ✅ Existing Integration

- **TTS**: Text-to-speech with voice selection
- **STT**: Speech-to-text transcription
- **Voice Listing**: Fetch available ElevenLabs voices
- **Credit System**: Robust payment and usage tracking
- **Auth System**: API keys and session-based authentication

### ❌ Missing Components

- Voice cloning API endpoints
- Database schema for user-owned voices
- Audio file upload and processing
- Voice management UI
- Pricing for voice operations

---

## Voice Cloning Features

### 1. Instant Voice Cloning (IVC)

**Characteristics:**

- **Audio Required**: 1-3 minutes of clear speech
- **Processing Time**: ~30 seconds - 2 minutes
- **Quality**: Good (suitable for 90% of use cases)
- **Use Cases**:
  - Personal voice assistants
  - Content creation
  - Gaming characters
  - Prototyping

**Recommended Credit Cost**: 500 credits

### 2. Professional Voice Cloning (PVC)

**Characteristics:**

- **Audio Required**: 30+ minutes of professional recordings
- **Processing Time**: Several hours (async job)
- **Quality**: Exceptional studio-grade
- **Use Cases**:
  - Commercial applications
  - Professional audiobooks
  - High-quality brand voices
  - Production-grade content

**Recommended Credit Cost**: 5000 credits

---

## Architecture Design

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend Layer                        │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ Voice Upload UI│  │ Voice Manager│  │ Voice Settings  │ │
│  └────────────────┘  └──────────────┘  └─────────────────┘ │
└───────────────────────────────┬─────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                         API Layer                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  /api/elevenlabs/voices/clone (POST)                   │ │
│  │  /api/elevenlabs/voices/user (GET)                     │ │
│  │  /api/elevenlabs/voices/:id (GET, DELETE, PATCH)      │ │
│  │  /api/elevenlabs/voices/:id/samples (POST, DELETE)    │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                      Service Layer                           │
│  ┌──────────────────────┐  ┌───────────────────────────┐   │
│  │ ElevenLabsService    │  │ VoiceCloningService       │   │
│  │ - createVoiceClone() │  │ - uploadSamples()         │   │
│  │ - deleteVoice()      │  │ - processCloning()        │   │
│  │ - getVoiceDetails()  │  │ - validateAudio()         │   │
│  └──────────────────────┘  └───────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                      Data Layer                              │
│  ┌──────────────────────┐  ┌───────────────────────────┐   │
│  │ user_voices table    │  │ voice_cloning_jobs table  │   │
│  │ - Stores voice info  │  │ - Tracks async jobs       │   │
│  └──────────────────────┘  └───────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Tables

#### 1. `user_voices` Table

Stores information about user-owned cloned voices.

```sql
CREATE TABLE user_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- ElevenLabs Integration
  elevenlabs_voice_id TEXT NOT NULL UNIQUE,

  -- Voice Metadata
  name TEXT NOT NULL,
  description TEXT,
  clone_type TEXT NOT NULL CHECK (clone_type IN ('instant', 'professional')),

  -- Settings
  settings JSONB DEFAULT '{}'::jsonb NOT NULL,
  -- Example settings:
  -- {
  --   "stability": 0.5,
  --   "similarity_boost": 0.75,
  --   "style": 0,
  --   "use_speaker_boost": true,
  --   "language": "en"
  -- }

  -- Metadata
  sample_count INTEGER DEFAULT 0 NOT NULL,
  total_audio_duration_seconds INTEGER,
  audio_quality_score DECIMAL(3, 2), -- 0.00 - 10.00

  -- Usage Tracking
  usage_count INTEGER DEFAULT 0 NOT NULL,
  last_used_at TIMESTAMP,

  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,
  is_public BOOLEAN DEFAULT false NOT NULL, -- Allow sharing in gallery

  -- Cost Tracking
  creation_cost INTEGER NOT NULL, -- Credits spent to create

  -- Audit
  created_at TIMESTAMP DEFAULT now() NOT NULL,
  updated_at TIMESTAMP DEFAULT now() NOT NULL,

  CONSTRAINT user_voices_organization_id_fk
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT user_voices_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes
CREATE INDEX idx_user_voices_organization ON user_voices(organization_id);
CREATE INDEX idx_user_voices_user ON user_voices(user_id);
CREATE INDEX idx_user_voices_elevenlabs_id ON user_voices(elevenlabs_voice_id);
CREATE INDEX idx_user_voices_active ON user_voices(is_active) WHERE is_active = true;
CREATE INDEX idx_user_voices_public ON user_voices(is_public) WHERE is_public = true;
```

#### 2. `voice_cloning_jobs` Table

Tracks voice cloning operations (especially for async professional clones).

```sql
CREATE TABLE voice_cloning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Job Details
  job_type TEXT NOT NULL CHECK (job_type IN ('instant', 'professional')),
  voice_name TEXT NOT NULL,
  voice_description TEXT,

  -- Status
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

  -- Results
  user_voice_id UUID REFERENCES user_voices(id) ON DELETE SET NULL,
  elevenlabs_voice_id TEXT,

  -- Error Handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0 NOT NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  -- Example metadata:
  -- {
  --   "sample_files": ["file1.mp3", "file2.wav"],
  --   "total_duration": 180,
  --   "language": "en"
  -- }

  -- Timestamps
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now() NOT NULL,
  updated_at TIMESTAMP DEFAULT now() NOT NULL,

  CONSTRAINT voice_cloning_jobs_organization_fk
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT voice_cloning_jobs_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes
CREATE INDEX idx_voice_cloning_jobs_organization ON voice_cloning_jobs(organization_id);
CREATE INDEX idx_voice_cloning_jobs_user ON voice_cloning_jobs(user_id);
CREATE INDEX idx_voice_cloning_jobs_status ON voice_cloning_jobs(status);
CREATE INDEX idx_voice_cloning_jobs_created ON voice_cloning_jobs(created_at DESC);
```

#### 3. `voice_samples` Table

Stores metadata about uploaded audio samples (actual files stored in Vercel Blob).

```sql
CREATE TABLE voice_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_voice_id UUID REFERENCES user_voices(id) ON DELETE CASCADE,
  job_id UUID REFERENCES voice_cloning_jobs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- File Details
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL, -- bytes
  file_type TEXT NOT NULL, -- audio/mpeg, audio/wav, etc.
  blob_url TEXT NOT NULL, -- Vercel Blob storage URL

  -- Audio Metadata
  duration_seconds DECIMAL(10, 2),
  sample_rate INTEGER,
  channels INTEGER,
  quality_score DECIMAL(3, 2), -- 0.00 - 10.00

  -- Processing
  is_processed BOOLEAN DEFAULT false NOT NULL,
  transcription TEXT, -- Optional: what was said in the sample

  -- Audit
  created_at TIMESTAMP DEFAULT now() NOT NULL,

  CONSTRAINT voice_samples_user_voice_fk
    FOREIGN KEY (user_voice_id) REFERENCES user_voices(id),
  CONSTRAINT voice_samples_job_fk
    FOREIGN KEY (job_id) REFERENCES voice_cloning_jobs(id),
  CONSTRAINT voice_samples_organization_fk
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT voice_samples_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes
CREATE INDEX idx_voice_samples_user_voice ON voice_samples(user_voice_id);
CREATE INDEX idx_voice_samples_job ON voice_samples(job_id);
CREATE INDEX idx_voice_samples_organization ON voice_samples(organization_id);
CREATE INDEX idx_voice_samples_user ON voice_samples(user_id);
```

### Migration Files

Create migration files:

- `db/migrations/XXXX_create_user_voices_table.sql`
- `db/migrations/XXXX_create_voice_cloning_jobs_table.sql`
- `db/migrations/XXXX_create_voice_samples_table.sql`

---

## API Endpoints

### 1. Create Voice Clone

**Endpoint**: `POST /api/elevenlabs/voices/clone`

**Request Body**:

```typescript
{
  name: string;
  description?: string;
  cloneType: 'instant' | 'professional';
  files: File[]; // Audio files
  settings?: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
    language?: string;
  };
}
```

**Response**:

```typescript
{
  success: true;
  voice: {
    id: string;
    elevenlabsVoiceId: string;
    name: string;
    cloneType: 'instant' | 'professional';
    status: 'processing' | 'completed';
    jobId?: string; // For professional clones
  };
  creditsDeducted: number;
  estimatedCompletionTime?: string; // For async jobs
}
```

**Credit Cost**:

- Instant: 500 credits
- Professional: 5000 credits

---

### 2. List User Voices

**Endpoint**: `GET /api/elevenlabs/voices/user`

**Query Parameters**:

```typescript
{
  includeInactive?: boolean;
  cloneType?: 'instant' | 'professional';
  limit?: number;
  offset?: number;
}
```

**Response**:

```typescript
{
  success: true;
  voices: Array<{
    id: string;
    elevenlabsVoiceId: string;
    name: string;
    description: string;
    cloneType: "instant" | "professional";
    sampleCount: number;
    usageCount: number;
    isActive: boolean;
    createdAt: string;
    lastUsedAt: string;
  }>;
  total: number;
}
```

---

### 3. Get Voice Details

**Endpoint**: `GET /api/elevenlabs/voices/:id`

**Response**:

```typescript
{
  success: true;
  voice: {
    id: string;
    elevenlabsVoiceId: string;
    name: string;
    description: string;
    cloneType: "instant" | "professional";
    settings: object;
    sampleCount: number;
    totalAudioDurationSeconds: number;
    audioQualityScore: number;
    usageCount: number;
    lastUsedAt: string;
    isActive: boolean;
    createdAt: string;
    samples: Array<{
      id: string;
      fileName: string;
      durationSeconds: number;
      qualityScore: number;
    }>;
  }
}
```

---

### 4. Update Voice

**Endpoint**: `PATCH /api/elevenlabs/voices/:id`

**Request Body**:

```typescript
{
  name?: string;
  description?: string;
  settings?: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
  };
  isActive?: boolean;
}
```

**Response**:

```typescript
{
  success: true;
  voice: VoiceDetails;
}
```

---

### 5. Delete Voice

**Endpoint**: `DELETE /api/elevenlabs/voices/:id`

**Response**:

```typescript
{
  success: true;
  message: "Voice deleted successfully";
}
```

**Note**: Deletes from both ElevenLabs and local database. Should require confirmation.

---

### 6. Get Cloning Job Status

**Endpoint**: `GET /api/elevenlabs/voices/jobs/:jobId`

**Response**:

```typescript
{
  success: true;
  job: {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number; // 0-100
    voiceName: string;
    cloneType: 'instant' | 'professional';
    startedAt: string;
    estimatedCompletionAt?: string;
    completedAt?: string;
    errorMessage?: string;
    voiceId?: string; // Available when completed
  };
}
```

---

## Service Layer

### Enhanced `ElevenLabsService`

Add to `lib/services/elevenlabs.ts`:

```typescript
export interface VoiceCloneOptions {
  name: string;
  description?: string;
  files: File[];
  labels?: Record<string, string>;
}

export interface VoiceCloneResult {
  voiceId: string;
  name: string;
}

export class ElevenLabsService {
  // ... existing methods ...

  /**
   * Create an instant voice clone
   */
  async createInstantVoiceClone(
    options: VoiceCloneOptions
  ): Promise<VoiceCloneResult> {
    logger.info(`[ElevenLabs] Creating instant voice clone: ${options.name}`);

    try {
      const voice = await this.client.voices.clone({
        name: options.name,
        description: options.description,
        files: options.files,
      });

      return {
        voiceId: voice.voice_id,
        name: voice.name,
      };
    } catch (error) {
      logger.error("[ElevenLabs] Error creating voice clone:", error);
      throw error;
    }
  }

  /**
   * Create a professional voice clone
   * Note: This is async on ElevenLabs side, returns immediately
   */
  async createProfessionalVoiceClone(
    options: VoiceCloneOptions
  ): Promise<VoiceCloneResult> {
    logger.info(
      `[ElevenLabs] Creating professional voice clone: ${options.name}`
    );

    try {
      const voice = await this.client.voices.createProfessionalClone({
        name: options.name,
        description: options.description,
        files: options.files,
      });

      return {
        voiceId: voice.voice_id,
        name: voice.name,
      };
    } catch (error) {
      logger.error("[ElevenLabs] Error creating professional clone:", error);
      throw error;
    }
  }

  /**
   * Delete a voice by ID
   */
  async deleteVoice(voiceId: string): Promise<void> {
    logger.info(`[ElevenLabs] Deleting voice: ${voiceId}`);

    try {
      await this.client.voices.delete(voiceId);
    } catch (error) {
      logger.error("[ElevenLabs] Error deleting voice:", error);
      throw error;
    }
  }

  /**
   * Get voice details from ElevenLabs
   */
  async getVoiceById(voiceId: string) {
    try {
      return await this.client.voices.get(voiceId);
    } catch (error) {
      logger.error("[ElevenLabs] Error fetching voice:", error);
      throw error;
    }
  }

  /**
   * Update voice settings
   */
  async updateVoiceSettings(
    voiceId: string,
    settings: {
      name?: string;
      description?: string;
      stability?: number;
      similarityBoost?: number;
    }
  ) {
    logger.info(`[ElevenLabs] Updating voice settings: ${voiceId}`);

    try {
      return await this.client.voices.edit(voiceId, settings);
    } catch (error) {
      logger.error("[ElevenLabs] Error updating voice:", error);
      throw error;
    }
  }
}
```

### New `VoiceCloningService`

Create `lib/services/voice-cloning.ts`:

```typescript
import { db } from "@/db/client";
import { userVoices, voiceCloningJobs, voiceSamples } from "@/db/schemas";
import { eq, and, desc } from "drizzle-orm";
import { getElevenLabsService } from "./elevenlabs";
import { uploadFile } from "@/lib/blob";
import type { VoiceCloneOptions } from "./elevenlabs";

export interface CreateVoiceCloneParams {
  organizationId: string;
  userId: string;
  name: string;
  description?: string;
  cloneType: "instant" | "professional";
  files: File[];
  settings?: Record<string, unknown>;
}

export class VoiceCloningService {
  /**
   * Create a voice clone (instant or professional)
   */
  async createVoiceClone(params: CreateVoiceCloneParams) {
    const {
      organizationId,
      userId,
      name,
      description,
      cloneType,
      files,
      settings = {},
    } = params;

    // Validate files
    this.validateAudioFiles(files);

    // Create job record
    const [job] = await db
      .insert(voiceCloningJobs)
      .values({
        organization_id: organizationId,
        user_id: userId,
        job_type: cloneType,
        voice_name: name,
        voice_description: description,
        status: "processing",
        metadata: {
          file_count: files.length,
          total_size: files.reduce((sum, f) => sum + f.size, 0),
        },
        started_at: new Date(),
      })
      .returning();

    try {
      // Upload files to Vercel Blob for backup
      const uploadedFiles = await Promise.all(
        files.map(async (file) => {
          const blob = await uploadFile(file, {
            folder: `voice-samples/${organizationId}/${job.id}`,
          });

          // Store sample metadata
          await db.insert(voiceSamples).values({
            job_id: job.id,
            organization_id: organizationId,
            user_id: userId,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
            blob_url: blob.url,
          });

          return file;
        })
      );

      // Create voice clone in ElevenLabs
      const elevenlabs = getElevenLabsService();
      const result =
        cloneType === "instant"
          ? await elevenlabs.createInstantVoiceClone({
              name,
              description,
              files: uploadedFiles,
            })
          : await elevenlabs.createProfessionalVoiceClone({
              name,
              description,
              files: uploadedFiles,
            });

      // Create user_voices record
      const [userVoice] = await db
        .insert(userVoices)
        .values({
          organization_id: organizationId,
          user_id: userId,
          elevenlabs_voice_id: result.voiceId,
          name,
          description,
          clone_type: cloneType,
          settings,
          sample_count: files.length,
          creation_cost: cloneType === "instant" ? 500 : 5000,
        })
        .returning();

      // Update job as completed
      await db
        .update(voiceCloningJobs)
        .set({
          status: "completed",
          user_voice_id: userVoice.id,
          elevenlabs_voice_id: result.voiceId,
          progress: 100,
          completed_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(voiceCloningJobs.id, job.id));

      return { userVoice, job };
    } catch (error) {
      // Update job as failed
      await db
        .update(voiceCloningJobs)
        .set({
          status: "failed",
          error_message:
            error instanceof Error ? error.message : "Unknown error",
          updated_at: new Date(),
        })
        .where(eq(voiceCloningJobs.id, job.id));

      throw error;
    }
  }

  /**
   * Get user's voices
   */
  async getUserVoices(params: {
    organizationId: string;
    userId?: string;
    includeInactive?: boolean;
  }) {
    const conditions = [eq(userVoices.organization_id, params.organizationId)];

    if (params.userId) {
      conditions.push(eq(userVoices.user_id, params.userId));
    }

    if (!params.includeInactive) {
      conditions.push(eq(userVoices.is_active, true));
    }

    return db
      .select()
      .from(userVoices)
      .where(and(...conditions))
      .orderBy(desc(userVoices.created_at));
  }

  /**
   * Get voice by ID
   */
  async getVoiceById(voiceId: string, organizationId: string) {
    const [voice] = await db
      .select()
      .from(userVoices)
      .where(
        and(
          eq(userVoices.id, voiceId),
          eq(userVoices.organization_id, organizationId)
        )
      );

    return voice;
  }

  /**
   * Delete voice
   */
  async deleteVoice(voiceId: string, organizationId: string) {
    // Get voice record
    const voice = await this.getVoiceById(voiceId, organizationId);
    if (!voice) {
      throw new Error("Voice not found");
    }

    // Delete from ElevenLabs
    const elevenlabs = getElevenLabsService();
    await elevenlabs.deleteVoice(voice.elevenlabs_voice_id);

    // Soft delete from database
    await db
      .update(userVoices)
      .set({
        is_active: false,
        updated_at: new Date(),
      })
      .where(eq(userVoices.id, voiceId));
  }

  /**
   * Validate audio files
   */
  private validateAudioFiles(files: File[]): void {
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
    const ALLOWED_TYPES = [
      "audio/mpeg",
      "audio/wav",
      "audio/mp3",
      "audio/x-wav",
    ];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File ${file.name} exceeds maximum size of 10MB`);
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error(
          `File ${file.name} has invalid type. Allowed: MP3, WAV`
        );
      }
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string, organizationId: string) {
    const [job] = await db
      .select()
      .from(voiceCloningJobs)
      .where(
        and(
          eq(voiceCloningJobs.id, jobId),
          eq(voiceCloningJobs.organization_id, organizationId)
        )
      );

    return job;
  }
}

export const voiceCloningService = new VoiceCloningService();
```

---

## Pricing Strategy

### Recommended Credit Costs

Based on ElevenLabs API costs and market positioning:

| Operation                    | Credits            | USD Equivalent\* | Notes                                |
| ---------------------------- | ------------------ | ---------------- | ------------------------------------ |
| **Instant Voice Clone**      | 500                | $0.50            | 1-3 min audio, ~30s processing       |
| **Professional Voice Clone** | 5,000              | $5.00            | 30+ min audio, async processing      |
| **Voice Update/Edit**        | 50                 | $0.05            | Update name, settings                |
| **TTS with Custom Voice**    | Standard TTS + 10% | -                | Small premium for custom voice       |
| **Voice Sample Upload**      | 10 per file        | $0.01            | Additional samples to existing voice |
| **Voice Deletion**           | Free               | -                | No cost to delete                    |

\*Assuming 1000 credits = $1.00 USD

### Update `lib/pricing-constants.ts`

Add new constants:

```typescript
/**
 * Voice Cloning Costs
 */
export const VOICE_CLONE_INSTANT_COST = 500;
export const VOICE_CLONE_PROFESSIONAL_COST = 5000;
export const VOICE_SAMPLE_UPLOAD_COST = 10;
export const VOICE_UPDATE_COST = 50;
export const CUSTOM_VOICE_TTS_MARKUP = 1.1; // 10% markup for using custom voices
```

---

## Security Considerations

### 1. **Audio Content Validation**

- Scan uploaded files for malware
- Validate file headers (not just MIME type)
- Limit file sizes (10MB per file max)
- Check total upload size per request

### 2. **Rate Limiting**

- Max 5 voice clones per day per organization
- Max 10 professional clones per month
- Prevent abuse with exponential backoff

### 3. **Content Moderation**

- Require terms of service acceptance
- Log all voice cloning operations
- Implement reporting mechanism for misuse
- Add watermarking/attribution options

### 4. **Privacy & Consent**

```typescript
// Add to user_voices table
consent_confirmed: boolean NOT NULL DEFAULT false;
consent_type: 'self' | 'authorized' | 'licensed';
consent_metadata: jsonb;
```

### 5. **Access Control**

- Users can only access voices from their organization
- API keys need explicit permission for voice operations
- Implement voice sharing controls (private/team/public)

### 6. **Audit Trail**

- Log all voice creations, updates, deletions
- Track usage per voice
- Monitor for suspicious patterns

---

## UI/UX Flow

### 1. Voice Cloning Wizard

**Step 1: Choose Clone Type**

```
┌─────────────────────────────────────────────────────────┐
│         Create Your Custom Voice                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────┐  ┌─────────────────────────┐ │
│  │  Instant Clone       │  │  Professional Clone     │ │
│  │  ────────────        │  │  ─────────────────      │ │
│  │  500 credits         │  │  5,000 credits          │ │
│  │  1-3 min audio       │  │  30+ min audio          │ │
│  │  ~30s processing     │  │  Hours processing       │ │
│  │  Good quality        │  │  Studio quality         │ │
│  │  [Select ▶]          │  │  [Select ▶]             │ │
│  └──────────────────────┘  └─────────────────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Step 2: Upload Audio Samples**

```
┌─────────────────────────────────────────────────────────┐
│         Upload Voice Samples                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Tips for best results:                                 │
│  ✓ Clear, high-quality audio                            │
│  ✓ Minimal background noise                             │
│  ✓ Natural speaking tone                                │
│  ✓ Varied content and emotions                          │
│                                                          │
│  ┌─────────────────────────────────────────────┐        │
│  │   Drag & drop audio files here              │        │
│  │   or click to browse                         │        │
│  │                                              │        │
│  │   Supported: MP3, WAV (max 10MB each)       │        │
│  └─────────────────────────────────────────────┘        │
│                                                          │
│  Files: sample1.mp3 (2.3 MB) ✓                         │
│         sample2.wav (4.1 MB) ✓                         │
│                                                          │
│  Total duration: 2:47 / 3:00 min required               │
│  [Add More Files]  [Continue ▶]                         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Step 3: Configure Voice**

```
┌─────────────────────────────────────────────────────────┐
│         Configure Your Voice                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Voice Name*                                            │
│  [My Voice                                     ]        │
│                                                          │
│  Description                                            │
│  [A clone of my voice for content creation    ]        │
│                                                          │
│  Advanced Settings (Optional)                           │
│  ▼ Voice Characteristics                                │
│     Stability:        [████████░░] 0.75                 │
│     Similarity:       [██████████] 1.0                  │
│     Style:            [████░░░░░░] 0.4                  │
│     Speaker Boost:    [✓] Enabled                       │
│                                                          │
│  ☐ Make voice discoverable in gallery                   │
│  ☑ I have rights to use this voice                      │
│                                                          │
│  Cost: 500 credits (Current balance: 12,450)           │
│  [Cancel]  [Create Voice ▶]                             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 2. Voice Manager Dashboard

```
┌─────────────────────────────────────────────────────────┐
│  My Custom Voices                    [+ Create New]     │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │ My Voice                                 [⋮]    │   │
│  │ Instant Clone • Created Oct 24, 2025             │   │
│  │ ────────────────────────────────────────         │   │
│  │ Used 42 times • Last used 2 hours ago            │   │
│  │ 3 samples • 2:47 duration • Quality: 8.5/10     │   │
│  │ [Preview] [Use in TTS] [Edit] [Delete]          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Professional Narrator                    [⋮]    │   │
│  │ Professional Clone • Created Oct 20, 2025        │   │
│  │ ────────────────────────────────────────         │   │
│  │ Used 158 times • Last used yesterday             │   │
│  │ 25 samples • 47:12 duration • Quality: 9.8/10   │   │
│  │ [Preview] [Use in TTS] [Edit] [Delete]          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 3. Integration in TTS Interface

Update the existing TTS UI to include custom voices:

```typescript
// In components/text/text-generation-form.tsx

// Add voice selector dropdown
<Select>
  <SelectTrigger>
    <SelectValue placeholder="Select voice" />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectLabel>My Custom Voices</SelectLabel>
      {customVoices.map(voice => (
        <SelectItem key={voice.id} value={voice.elevenlabsVoiceId}>
          {voice.name} ({voice.cloneType})
        </SelectItem>
      ))}
    </SelectGroup>
    <SelectGroup>
      <SelectLabel>ElevenLabs Voices</SelectLabel>
      {defaultVoices.map(voice => (
        <SelectItem key={voice.voice_id} value={voice.voice_id}>
          {voice.name}
        </SelectItem>
      ))}
    </SelectGroup>
  </SelectContent>
</Select>
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal**: Database and basic service layer

- [ ] Create database migration files
- [ ] Run migrations to create tables
- [ ] Create Drizzle schemas for new tables
- [ ] Create repositories for data access
- [ ] Update `ElevenLabsService` with cloning methods
- [ ] Create `VoiceCloningService`
- [ ] Add pricing constants
- [ ] Write unit tests for services

**Deliverables**:

- Database tables created
- Service layer implemented
- Tests passing

---

### Phase 2: API Layer (Week 1-2)

**Goal**: RESTful API endpoints

- [ ] Create `/api/elevenlabs/voices/clone` endpoint
- [ ] Create `/api/elevenlabs/voices/user` endpoint
- [ ] Create `/api/elevenlabs/voices/:id` CRUD endpoints
- [ ] Create `/api/elevenlabs/voices/jobs/:jobId` endpoint
- [ ] Implement credit checking and deduction
- [ ] Add usage tracking
- [ ] Implement rate limiting
- [ ] Add validation and error handling
- [ ] Write API integration tests

**Deliverables**:

- All API endpoints functional
- Credit system integrated
- API tests passing

---

### Phase 3: UI Components (Week 2-3)

**Goal**: User interface for voice cloning

- [ ] Create Voice Cloning Wizard component
- [ ] Create Voice Manager dashboard page
- [ ] Create Voice Settings component
- [ ] Update TTS interface to include custom voices
- [ ] Add voice preview functionality
- [ ] Create job status polling mechanism
- [ ] Implement file upload with progress
- [ ] Add error handling and user feedback
- [ ] Design responsive layouts

**Deliverables**:

- UI components complete
- Voice cloning workflow functional
- User can create, manage, and use custom voices

---

### Phase 4: Polish & Security (Week 3-4)

**Goal**: Production readiness

- [ ] Implement audio file validation
- [ ] Add content moderation hooks
- [ ] Implement rate limiting per organization
- [ ] Add audit logging
- [ ] Create admin panel for voice management
- [ ] Add analytics and monitoring
- [ ] Implement consent and terms acceptance
- [ ] Add voice sharing capabilities
- [ ] Performance optimization
- [ ] Security audit
- [ ] Load testing

**Deliverables**:

- Production-ready feature
- Security measures in place
- Monitoring and analytics active

---

### Phase 5: Documentation & Launch (Week 4)

**Goal**: Public release

- [ ] Update API documentation
- [ ] Create user guides and tutorials
- [ ] Create video demos
- [ ] Update billing documentation
- [ ] Create marketing materials
- [ ] Soft launch to beta users
- [ ] Collect feedback
- [ ] Make improvements
- [ ] Public announcement

**Deliverables**:

- Documentation complete
- Feature launched
- User feedback collected

---

## Testing Strategy

### Unit Tests

- Service methods
- Validation logic
- Credit calculations
- Pricing logic

### Integration Tests

- API endpoints
- Database operations
- ElevenLabs API interactions
- Credit system

### E2E Tests

- Complete voice cloning workflow
- Voice management operations
- TTS with custom voices
- Error scenarios

### Performance Tests

- File upload handling
- Concurrent voice cloning
- Database query performance
- API response times

---

## Monitoring & Analytics

### Metrics to Track

1. **Usage Metrics**
   - Voice clones created (instant vs professional)
   - Total voices per organization
   - TTS requests using custom voices
   - Most popular voice types

2. **Performance Metrics**
   - Average cloning time
   - Success/failure rates
   - File upload times
   - API response times

3. **Business Metrics**
   - Credits spent on voice cloning
   - Revenue from voice features
   - User adoption rate
   - Feature usage trends

### Alerting

Set up alerts for:

- High failure rates (>5%)
- Long processing times (>5 min for instant)
- Credit system errors
- ElevenLabs API errors
- High storage usage

---

## Future Enhancements

### V2 Features

- [ ] Voice marketplace (users can sell/share voices)
- [ ] Voice mixing (combine multiple voices)
- [ ] Emotion/tone controls
- [ ] Real-time voice morphing
- [ ] Voice style transfer
- [ ] Multi-speaker support
- [ ] Voice versioning
- [ ] A/B testing for voices
- [ ] Voice analytics dashboard
- [ ] API webhooks for job completion

### Advanced Features

- [ ] Voice training with custom datasets
- [ ] Voice fine-tuning
- [ ] Voice quality enhancement
- [ ] Automatic sample collection from conversations
- [ ] Voice backup and restore
- [ ] Voice templates library
- [ ] Collaborative voice projects

---

## Rollout Strategy

### Beta Phase (Week 1-2)

- Enable for 10-20 trusted users
- Monitor closely for issues
- Collect detailed feedback
- Iterate quickly

### Limited Release (Week 3-4)

- Enable for all users with credit limits
- Max 2 instant clones per week
- Max 1 professional clone per month
- Gather usage data

### General Availability (Week 5+)

- Remove beta flags
- Full feature access
- Regular pricing
- Marketing push

---

## Success Criteria

### Technical Success

- ✓ <1% error rate
- ✓ <30s average processing for instant clones
- ✓ 100% credit accounting accuracy
- ✓ 99.9% API uptime

### Business Success

- ✓ 30% user adoption in first month
- ✓ 1000+ voices created in first quarter
- ✓ $10k+ revenue from voice features
- ✓ 4.5+ star rating from users

### User Success

- ✓ Intuitive workflow (>90% completion rate)
- ✓ High-quality results (>8/10 satisfaction)
- ✓ Clear pricing (<5% pricing complaints)
- ✓ Good documentation (<10 support tickets/week)

---

## Conclusion

Voice cloning is a powerful feature that can significantly enhance your platform's value proposition. This implementation plan provides a comprehensive roadmap from database design through UI/UX to production deployment.

### Key Takeaways:

1. **Start Simple**: Begin with instant voice cloning, add professional later
2. **Credit Integration**: Leverage existing credit system for seamless billing
3. **Security First**: Implement content validation and consent management
4. **User Experience**: Make the workflow intuitive and rewarding
5. **Monitor Everything**: Track usage, performance, and business metrics

### Next Steps:

1. Review this document with the team
2. Prioritize Phase 1 tasks
3. Set up project tracking
4. Begin database migrations
5. Start coding!

---

**Questions or Feedback?**
Contact the development team or create an issue in the repository.

**Last Updated**: October 24, 2025
