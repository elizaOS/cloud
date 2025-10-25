# Voice Cloning Quick Start Guide

This is a condensed guide to get voice cloning up and running quickly. For full details, see [VOICE_CLONING_IMPLEMENTATION.md](./VOICE_CLONING_IMPLEMENTATION.md).

## 🎯 What You're Getting

Voice cloning allows your users to:

- **Clone their own voice** in 30 seconds with 1-3 minutes of audio
- **Create professional-grade voices** with 30+ minutes of audio
- **Use cloned voices** for TTS generation
- **Manage voice library** with easy CRUD operations
- **Track usage** and costs per voice

## 💰 Pricing Overview

| Feature               | Credits        | Time      | Quality              |
| --------------------- | -------------- | --------- | -------------------- |
| Instant Clone         | 500            | ~30s      | Good (90% use cases) |
| Professional Clone    | 5,000          | 1-3 hours | Studio-grade         |
| Voice Update          | 50             | Instant   | -                    |
| Sample Upload         | 10/file        | ~5s       | -                    |
| TTS with Custom Voice | Standard + 10% | Standard  | Same as base TTS     |

## 🚀 Quick Implementation (4 Steps)

### Step 1: Database Setup (5 minutes)

Run the migration to create three new tables:

```bash
# Create migration file
cat > db/migrations/$(date +%Y%m%d%H%M%S)_voice_cloning.sql << 'EOF'
-- See db/schemas/user-voices.ts for full schema
CREATE TABLE user_voices (...);
CREATE TABLE voice_cloning_jobs (...);
CREATE TABLE voice_samples (...);
EOF

# Run migration
bun run db:migrate
```

The schemas are already created in `db/schemas/user-voices.ts`.

### Step 2: Export New Services (2 minutes)

Update `lib/services/index.ts`:

```typescript
export { voiceCloningService } from "./voice-cloning";
export type { CreateVoiceCloneParams } from "./voice-cloning";
```

### Step 3: Test API Endpoint (3 minutes)

```bash
# Start dev server
bun run dev

# Test voice cloning (use a small audio file for testing)
curl -X POST http://localhost:3000/api/elevenlabs/voices/clone \
  -H "Cookie: your-auth-cookie" \
  -F "name=My Test Voice" \
  -F "cloneType=instant" \
  -F "file1=@sample-audio.mp3"

# List user voices
curl http://localhost:3000/api/elevenlabs/voices/user \
  -H "Cookie: your-auth-cookie"
```

### Step 4: Add UI (Optional, ~1 hour)

Create a basic voice cloning page at `app/dashboard/voices/page.tsx`:

```typescript
// See UI/UX Flow section in main implementation doc
// Components needed:
// - Voice cloning wizard (upload + settings)
// - Voice list/manager
// - Voice preview player
// - Integration into existing TTS interface
```

## 📊 Key Files Created/Modified

### New Files

- ✅ `docs/VOICE_CLONING_IMPLEMENTATION.md` - Complete implementation guide
- ✅ `db/schemas/user-voices.ts` - Database schemas
- ✅ `lib/services/voice-cloning.ts` - Voice cloning service
- ✅ `app/api/elevenlabs/voices/clone/route.ts` - Clone API endpoint
- ✅ `app/api/elevenlabs/voices/user/route.ts` - List voices endpoint

### Modified Files

- ✅ `lib/services/elevenlabs.ts` - Added voice cloning methods
- ✅ `lib/pricing-constants.ts` - Added voice cloning costs

### Still Needed

- ⏳ Database migration SQL file
- ⏳ Additional API endpoints (GET/:id, DELETE/:id, PATCH/:id)
- ⏳ UI components
- ⏳ Export services from index
- ⏳ Tests

## 🔑 Key Integration Points

### 1. Credit System

Voice cloning integrates seamlessly with your existing credit system:

```typescript
// Check balance
if (org.credit_balance < cost) {
  return error("Insufficient credits");
}

// Deduct before processing
await creditsService.deductCredits({
  amount: cost,
  description: "Voice cloning",
});

// Refund on failure
await creditsService.addCredits({
  amount: cost,
  type: "refund",
});
```

### 2. Usage Tracking

Automatically tracks all voice operations:

```typescript
await usageService.create({
  type: "voice_cloning",
  model: cloneType,
  provider: "elevenlabs",
  input_cost: cost,
  is_successful: true,
});
```

### 3. Using Custom Voices in TTS

Update your TTS endpoint to support custom voices:

```typescript
// In app/api/elevenlabs/tts/route.ts
const voiceId = body.voiceId; // Can be custom or default
const voice = await voiceCloningService.getVoiceById(voiceId, org.id);

if (voice) {
  // Increment usage counter
  await voiceCloningService.incrementUsageCount(voiceId);

  // Apply custom voice markup (10%)
  cost = Math.ceil(cost * CUSTOM_VOICE_TTS_MARKUP);
}

// Use the voice for TTS
const audio = await elevenlabs.textToSpeech({
  text,
  voiceId: voice?.elevenlabsVoiceId || voiceId,
});
```

## 🧪 Testing Checklist

### Manual Testing

- [ ] Upload 1-3 minutes of audio
- [ ] Create instant voice clone
- [ ] Verify credits deducted (500)
- [ ] List user voices
- [ ] Generate TTS with custom voice
- [ ] Check usage tracking
- [ ] Delete voice
- [ ] Verify refund on failure

### Error Cases

- [ ] Insufficient credits
- [ ] Invalid audio format
- [ ] File too large
- [ ] Missing required fields
- [ ] Rate limiting
- [ ] Network errors

## 🛡️ Security Checklist

- [ ] Validate file types (only MP3/WAV)
- [ ] Limit file sizes (10MB per file)
- [ ] Limit total upload (100MB)
- [ ] Rate limit voice creation (5/day)
- [ ] Require consent acknowledgment
- [ ] Log all operations
- [ ] Prevent unauthorized access
- [ ] Sanitize user inputs

## 📈 Monitoring

Track these metrics from day 1:

```typescript
// Key metrics to monitor
const metrics = {
  voicesCreated: {
    instant: 0,
    professional: 0,
  },
  successRate: 0.98, // Should be >95%
  averageProcessingTime: 25, // seconds for instant
  creditsSpent: 0,
  mostPopularVoices: [],
  errorRate: 0.02, // Should be <5%
};
```

## 🎨 UI Components Needed

### Priority 1 (MVP)

1. **Voice Cloning Form**
   - File upload (drag & drop)
   - Voice name & description
   - Clone type selector
   - Settings (stability, similarity)
   - Credit balance display
   - Submit button

2. **Voice List/Manager**
   - Table/grid of user voices
   - Voice preview
   - Edit/Delete actions
   - Usage stats
   - Filters (active/inactive, type)

### Priority 2 (Enhancement)

3. **Voice Selector in TTS**
   - Dropdown with custom + default voices
   - Voice preview
   - Mark custom voices with badge

4. **Job Status Tracker**
   - Progress indicator for professional clones
   - Estimated completion time
   - Notifications on completion

## 🔄 Next Steps

1. **Review this guide** with your team
2. **Run database migrations** to create tables
3. **Test API endpoints** manually
4. **Build basic UI** for voice cloning
5. **Add to existing TTS interface**
6. **Beta test** with 5-10 users
7. **Monitor metrics** closely
8. **Iterate** based on feedback
9. **Launch** to all users

## 💡 Quick Tips

1. **Start with Instant Cloning**: It's faster and cheaper, perfect for MVP
2. **Use Existing Patterns**: Follow the same patterns as image/video generation
3. **Test with Small Files**: Use 30-second clips for development
4. **Monitor ElevenLabs Usage**: They have their own rate limits
5. **Cache Voice Lists**: Don't fetch from ElevenLabs every time
6. **Provide Clear Examples**: Show users what good audio samples look like
7. **Add Voice Preview**: Let users test before saving
8. **Implement Soft Delete**: Keep voice history for analytics

## 🆘 Troubleshooting

### Issue: Voice cloning fails silently

**Solution**: Check ElevenLabs API key and quota limits

### Issue: Audio files rejected

**Solution**: Validate file headers, not just MIME types

### Issue: Slow processing

**Solution**: Consider async job queue for professional clones

### Issue: High credit usage

**Solution**: Implement daily limits per organization

### Issue: Poor voice quality

**Solution**: Add audio quality validation before processing

## 📚 Resources

- **Full Implementation Guide**: [VOICE_CLONING_IMPLEMENTATION.md](./VOICE_CLONING_IMPLEMENTATION.md)
- **ElevenLabs API Docs**: https://elevenlabs.io/docs
- **ElevenLabs Voice Cloning**: https://elevenlabs.io/docs/product/voices/overview
- **Your Database Schemas**: `db/schemas/user-voices.ts`
- **Your Services**: `lib/services/voice-cloning.ts`

## 🎉 Success Criteria

You'll know it's working when:

- ✅ Users can upload audio and get a voice back in <1 minute
- ✅ Voices show up in TTS interface immediately
- ✅ Credits are deducted correctly
- ✅ Voice quality meets user expectations (>8/10 rating)
- ✅ Error rate is below 5%
- ✅ No security vulnerabilities
- ✅ Users are excited about the feature!

---

**Estimated Time to MVP**: 2-3 days for full-stack developer  
**Estimated Time to Production**: 1-2 weeks including testing and polish

**Questions?** Check the main implementation guide or search the codebase for examples.
