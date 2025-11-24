# 📋 POST-INTEGRATION TODO LIST

## 🎯 Current Status: Integration Complete ✅

The code is ready, tested, and integrated. Here's what you need to do before production:

---

## 🔥 IMMEDIATE (Before Testing)

### 1. ✅ Verify Chat UI Integration Works
**Priority:** CRITICAL  
**Time:** 10 minutes  
**Action:**
```bash
# Start server
bun run dev

# Visit a chat page and verify ElizaChatInterface loads
open "http://localhost:3000/dashboard/chat"
```
**Check:**
- [ ] Chat interface loads without errors
- [ ] Can send messages
- [ ] Messages appear correctly
- [ ] No console errors

---

### 2. ✅ Test Full Affiliate Flow End-to-End
**Priority:** CRITICAL  
**Time:** 15 minutes  
**Action:**
```bash
# Generate test API key
bun run create-affiliate-key "test-flow" \
  --user-id "YOUR_USER_ID" \
  --org-id "YOUR_ORG_ID"

# Save the key
export TEST_API_KEY="eliza_..."

# Create test character
curl -X POST http://localhost:3000/api/affiliate/create-character \
  -H "Authorization: Bearer $TEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "character": {
      "name": "Test Character",
      "bio": ["Testing the flow"]
    },
    "affiliateId": "test-flow"
  }' | jq '.'

# Copy characterId and visit
open "http://localhost:3000/chat/CHARACTER_ID?intro=true"
```

**Test Checklist:**
- [ ] Character intro page loads
- [ ] Character name/bio displays correctly
- [ ] "Start Chatting" button works
- [ ] Email modal appears
- [ ] "Skip" creates anonymous session
- [ ] Chat interface loads
- [ ] Message counter shows (10/10)
- [ ] Can send messages
- [ ] Counter decrements (9/10, 8/10...)
- [ ] Soft prompt appears at 5 messages
- [ ] Hard paywall appears at 10 messages
- [ ] Signup flow works

---

### 3. ✅ Test with Missing UI Components
**Priority:** HIGH  
**Time:** 5 minutes  
**Issue:** You might not have shadcn Alert/Progress components

**Action:**
```bash
# Check if Alert exists
ls components/ui/alert.tsx

# If not found, install:
bunx shadcn@latest add alert

# Check if Progress exists
ls components/ui/progress.tsx

# If not found, install:
bunx shadcn@latest add progress

# Restart server and test again
```

**Check:**
- [ ] No "module not found" errors
- [ ] Counter displays properly
- [ ] Alerts show correctly

---

## 🚀 BEFORE PRODUCTION DEPLOYMENT

### 4. ✅ Generate Production API Key for CloneUrCrush
**Priority:** CRITICAL  
**Time:** 5 minutes  
**Action:**
```bash
# Generate production key
bun run create-affiliate-key "clone-your-crush" \
  --user-id "YOUR_USER_ID" \
  --org-id "YOUR_ORG_ID" \
  --rate-limit 1000 \
  --description "CloneUrCrush production integration"

# SAVE THE KEY SECURELY!
```

**Output to save:**
```
API Key: eliza_abc123...
Key ID: xyz-789...
```

**Send to CloneUrCrush team:**
- [ ] API key
- [ ] API endpoint URL
- [ ] Documentation (AFFILIATE_SETUP.md)

---

### 5. ✅ Update Environment Variables for Production
**Priority:** CRITICAL  
**Time:** 10 minutes  
**File:** `.env.local` (production)

**Update these:**
```bash
# Change from localhost to production URL
NEXT_PUBLIC_ELIZA_CLOUD_URL=https://yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_API_URL=https://yourdomain.com

# Ensure these are production values
DATABASE_URL=postgresql://prod_user:prod_pass@prod_host:5432/prod_db
STRIPE_SECRET_KEY=sk_live_...  # Not sk_test_
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...  # Not pk_test_

# Production Privy
NEXT_PUBLIC_PRIVY_APP_ID=your_prod_privy_app_id
PRIVY_APP_SECRET=your_prod_privy_secret
```

**Checklist:**
- [ ] All URLs updated to production
- [ ] Using live Stripe keys (not test)
- [ ] Using production database
- [ ] Using production Privy app
- [ ] No localhost references

---

### 6. ✅ Configure CORS for Production
**Priority:** HIGH  
**Time:** 5 minutes  
**File:** `app/api/affiliate/create-character/route.ts`

**Current CORS (line ~369):**
```typescript
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*", // ⚠️ Too permissive!
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
```

**Update to:**
```typescript
export async function OPTIONS(request: NextRequest) {
  const allowedOrigins = [
    "https://cloneurcrush.com",
    "https://www.cloneurcrush.com",
    process.env.NEXT_PUBLIC_APP_URL || "",
  ];

  const origin = request.headers.get("origin") || "";
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}
```

**Checklist:**
- [ ] CORS restricted to known domains
- [ ] CloneUrCrush domain added
- [ ] Tested with production domain

---

### 7. ✅ Set Up Rate Limiting (Optional but Recommended)
**Priority:** MEDIUM  
**Time:** 15 minutes  
**Action:**

The current implementation has in-memory rate limiting. For production, consider:

**Option A: Keep In-Memory (Simple)**
- Already implemented in the code
- Works for single-server deployments
- Resets on server restart

**Option B: Use Redis (Scalable)**
```bash
# Install Upstash Redis SDK
bun add @upstash/redis

# Add to .env.local
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
```

**Update rate limiting code:**
```typescript
// lib/middleware/affiliate-rate-limit.ts
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function checkAffiliateRateLimit(apiKeyId: string) {
  const key = `rate-limit:${apiKeyId}`;
  const count = await redis.incr(key);
  
  if (count === 1) {
    await redis.expire(key, 3600); // 1 hour
  }
  
  return {
    allowed: count <= 100,
    remaining: Math.max(0, 100 - count),
  };
}
```

**Decision:**
- [ ] Keep in-memory (simpler)
- [ ] Use Redis (scalable)

---

### 8. ✅ Set Up Monitoring & Alerts
**Priority:** HIGH  
**Time:** 30 minutes  
**Action:**

**Set up error tracking:**
```bash
# Option 1: Sentry
bun add @sentry/nextjs

# Option 2: LogRocket
bun add logrocket logrocket-react
```

**Configure Sentry (recommended):**
```bash
# Add to .env.local
SENTRY_DSN=your_sentry_dsn
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn

# Initialize in app/layout.tsx
```

**Set up alerts for:**
- [ ] API errors (affiliate endpoint failures)
- [ ] Authentication failures
- [ ] Database errors
- [ ] Character creation failures
- [ ] High error rates

---

### 9. ✅ Add Analytics Tracking
**Priority:** MEDIUM  
**Time:** 20 minutes  
**Action:**

**Track these events:**

```typescript
// In app/api/affiliate/create-character/route.ts
// After successful character creation:
await analytics.track("affiliate_character_created", {
  affiliateId,
  characterId,
  source: metadata?.source,
  vibe: metadata?.vibe,
});

// In components/chat/character-intro-page.tsx
// When user arrives:
analytics.track("affiliate_intro_viewed", {
  characterId: character.id,
  source,
});

// In components/chat/email-capture-modal.tsx
// When user provides email:
analytics.track("affiliate_email_captured", {
  characterId,
  source,
});

// When user skips:
analytics.track("affiliate_anonymous_session", {
  characterId,
  source,
});

// In components/chat/chat-interface.tsx
// When paywall hit:
analytics.track("affiliate_paywall_shown", {
  characterId,
  messageCount,
  source,
});

// When user signs up:
analytics.track("affiliate_converted", {
  characterId,
  source,
});
```

**Checklist:**
- [ ] Analytics provider configured (PostHog, Mixpanel, etc.)
- [ ] Events tracked
- [ ] Conversion funnel set up
- [ ] Dashboard created

---

### 10. ✅ Database Optimization
**Priority:** MEDIUM  
**Time:** 10 minutes  
**Action:**

**Add indexes for affiliate queries:**
```sql
-- For affiliate character lookups
CREATE INDEX idx_user_characters_affiliate 
ON user_characters((character_data->'affiliate'->>'affiliateId'));

-- For session lookups
CREATE INDEX idx_anonymous_sessions_token 
ON anonymous_sessions(session_token) 
WHERE is_active = true;

-- For API key lookups
CREATE INDEX idx_api_keys_permissions 
ON api_keys USING gin(permissions);

-- For character creation date queries
CREATE INDEX idx_user_characters_created 
ON user_characters(created_at DESC);
```

**Run migrations:**
```bash
# Add to db/migrations/
bun run db:push
```

**Checklist:**
- [ ] Indexes created
- [ ] Query performance tested
- [ ] No slow queries (check logs)

---

## 📊 POST-DEPLOYMENT

### 11. ✅ Monitor API Usage
**Priority:** HIGH  
**Time:** Ongoing  
**Action:**

**Create monitoring queries:**
```sql
-- Daily character creation stats
SELECT 
  DATE(created_at) as date,
  COUNT(*) as characters_created,
  COUNT(DISTINCT character_data->'affiliate'->>'affiliateId') as unique_affiliates
FROM user_characters
WHERE character_data->'affiliate' IS NOT NULL
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- API key usage
SELECT 
  name,
  usage_count,
  last_used_at,
  rate_limit,
  ROUND(100.0 * usage_count / rate_limit, 2) as usage_percentage
FROM api_keys
WHERE permissions @> '["affiliate:create-character"]'
ORDER BY usage_count DESC;

-- Conversion rates
SELECT 
  COUNT(*) FILTER (WHERE converted_at IS NULL) as anonymous,
  COUNT(*) FILTER (WHERE converted_at IS NOT NULL) as converted,
  ROUND(100.0 * COUNT(*) FILTER (WHERE converted_at IS NOT NULL) / COUNT(*), 2) as conversion_rate
FROM anonymous_sessions;

-- Message usage distribution
SELECT 
  message_count,
  COUNT(*) as sessions
FROM anonymous_sessions
GROUP BY message_count
ORDER BY message_count;
```

**Set up:**
- [ ] Daily monitoring dashboard
- [ ] Weekly reports
- [ ] Alert thresholds

---

### 12. ✅ Test Session Migration
**Priority:** HIGH  
**Time:** 15 minutes  
**Action:**

**Test the migration flow:**
```bash
# 1. Create anonymous session via API
# 2. Send some messages (track session)
# 3. Sign up with email
# 4. Verify data migrated:

# Check if character transferred
SELECT user_id, character_data->'affiliate' as affiliate_info
FROM user_characters 
WHERE id = 'CHARACTER_ID';

# Check if session marked as converted
SELECT converted_at, is_active 
FROM anonymous_sessions 
WHERE session_token = 'SESSION_ID';
```

**Checklist:**
- [ ] Characters migrate correctly
- [ ] Chat history preserved
- [ ] Session marked as converted
- [ ] User can continue chatting

---

### 13. ✅ Document API for CloneUrCrush Team
**Priority:** HIGH  
**Time:** 15 minutes  
**Action:**

**Send them:**
1. **API Key** (from step 4)
2. **API Endpoint:**
   ```
   POST https://yourdomain.com/api/affiliate/create-character
   ```

3. **Example Request:**
   ```bash
   curl -X POST https://yourdomain.com/api/affiliate/create-character \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -d '{
       "character": {
         "name": "Luna",
         "bio": ["A flirty AI companion"],
         "style": {
           "all": ["Be flirty", "Be playful"],
           "chat": ["Use emojis"]
         }
       },
       "affiliateId": "clone-your-crush",
       "metadata": {
         "source": "landing-page",
         "vibe": "flirty"
       }
     }'
   ```

4. **Expected Response:**
   ```json
   {
     "success": true,
     "characterId": "abc-123...",
     "sessionId": "xyz-789...",
     "redirectUrl": "https://yourdomain.com/chat/abc-123?source=clone-your-crush&session=xyz-789"
   }
   ```

5. **Error Handling:**
   ```
   401: Invalid API key
   400: Invalid request body
   429: Rate limit exceeded
   500: Server error
   ```

6. **Files to send:**
   - [ ] `AFFILIATE_SETUP.md`
   - [ ] `AFFILIATE_IMPLEMENTATION.md`
   - [ ] API key
   - [ ] Support contact

---

## 🎨 OPTIONAL ENHANCEMENTS

### 14. 🔮 Add Vibe-Specific Themes (Optional)
**Priority:** LOW  
**Time:** 1 hour  
**Enhancement:**

**In character-intro-page.tsx:**
```typescript
const vibeThemes = {
  playful: "bg-gradient-to-br from-yellow-50 to-orange-50",
  mysterious: "bg-gradient-to-br from-purple-50 to-indigo-50",
  romantic: "bg-gradient-to-br from-pink-50 to-red-50",
  flirty: "bg-gradient-to-br from-rose-50 to-pink-50",
  // ... etc
};

const vibe = metadata?.vibe as string;
const themeClass = vibeThemes[vibe] || "bg-gradient-to-br from-background to-muted/20";
```

---

### 15. 🔮 Add Webhook for Conversions (Optional)
**Priority:** LOW  
**Time:** 1 hour  
**Enhancement:**

**Notify CloneUrCrush when users sign up:**
```typescript
// After successful signup and migration
await fetch("https://cloneurcrush.com/webhook/conversion", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    characterId,
    sessionId,
    convertedAt: new Date(),
    messageCount,
    source: "eliza-cloud",
  }),
});
```

---

### 16. 🔮 Add Revenue Sharing Dashboard (Optional)
**Priority:** LOW  
**Time:** 2 hours  
**Enhancement:**

**Track affiliate performance:**
- Characters created per affiliate
- Conversion rates
- Revenue generated
- Payout calculations

---

## ✅ FINAL CHECKLIST

### Pre-Production:
- [ ] Full flow tested locally
- [ ] UI components installed (Alert, Progress)
- [ ] Chat interface integration verified
- [ ] Production API key generated
- [ ] Environment variables updated
- [ ] CORS configured for production
- [ ] Rate limiting decision made

### Production:
- [ ] Deployed to production
- [ ] Database indexes created
- [ ] Monitoring set up
- [ ] Analytics configured
- [ ] Error tracking enabled
- [ ] API key sent to CloneUrCrush
- [ ] Documentation sent to CloneUrCrush

### Post-Launch:
- [ ] Monitor API usage daily
- [ ] Check error rates
- [ ] Review conversion metrics
- [ ] Collect user feedback
- [ ] Optimize based on data

---

## 🚨 CRITICAL PATH (Must Do)

If you only do these, you're good to ship:

1. ✅ Test full flow locally (Step 2)
2. ✅ Install missing UI components if needed (Step 3)
3. ✅ Generate production API key (Step 4)
4. ✅ Update environment variables (Step 5)
5. ✅ Configure CORS (Step 6)
6. ✅ Set up basic monitoring (Step 8)
7. ✅ Deploy to production
8. ✅ Send API key to CloneUrCrush (Step 13)

**Estimated Time: 2-3 hours**

---

## 📞 SUPPORT CHECKLIST

Create these for ongoing support:

- [ ] Runbook for common issues
- [ ] Escalation process
- [ ] Status page
- [ ] Support email/Slack channel
- [ ] FAQ for CloneUrCrush team

---

**Status:** 📋 TODO List Complete  
**Critical Items:** 8  
**Optional Items:** 3  
**Estimated Time to Production:** 3-4 hours

🚀 **You're almost there! Just need to test, configure, and deploy!**

