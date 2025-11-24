# 🚀 Affiliate Integration Setup Guide

## Quick Start

This guide walks you through setting up the affiliate integration for CloneUrCrush → ElizaOS Cloud.

---

## 📋 Prerequisites

- ElizaOS Cloud running locally or in production
- Database migrations completed (`bun run db:migrate`)
- At least one organization and user in the database
- Privy authentication configured

---

## 🔧 Setup Steps

### Step 1: Generate Affiliate API Key

Run the script to create an API key for CloneUrCrush:

```bash
bun run create-affiliate-key "clone-your-crush"
```

**Output:**
```
🔐 Creating Affiliate API Key
──────────────────────────────────────────────────

📋 Finding organization...
   Found: My Organization (abc-123...)

👤 Finding user...
   Found: admin@example.com (def-456...)

🔑 Generating API key...
   ✅ API key created successfully!

==================================================
📋 API KEY DETAILS
==================================================

Affiliate Name:  clone-your-crush
API Key ID:      xyz-789...
Key Prefix:      eliza_abc...
Rate Limit:      100 requests/hour
Permissions:     affiliate:create-character
Status:          ✅ Active

==================================================
⚠️  IMPORTANT: Save this API key now!
   It will NOT be shown again.
==================================================

API Key:
eliza_abc123def456...

✅ Done! Share this key with the clone-your-crush team.
```

**⚠️ IMPORTANT:** Copy the API key immediately - it won't be shown again!

---

### Step 2: Configure CloneUrCrush Landing Page

Send these instructions to the CloneUrCrush team:

#### **Update their `.env.local`:**

```bash
# ElizaOS Cloud Configuration
NEXT_PUBLIC_ELIZA_CLOUD_URL=http://localhost:3000  # or production URL
ELIZA_CLOUD_API_KEY=eliza_abc123def456...          # API key from Step 1
ELIZA_AFFILIATE_ID=clone-your-crush
```

#### **Update their API route:**

File: `app/api/create-crush/route.ts`

```typescript
const response = await fetch(
  `${process.env.NEXT_PUBLIC_ELIZA_CLOUD_URL}/api/affiliate/create-character`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.ELIZA_CLOUD_API_KEY}`,
    },
    body: JSON.stringify({
      character: elizaCharacter,
      affiliateId: process.env.ELIZA_AFFILIATE_ID,
      metadata: {
        source: "clone-your-crush",
        vibe: body.vibe,
        backstory: body.backstory,
      },
    }),
  }
);

const result = await response.json();

if (result.success) {
  // Use the redirectUrl or build your own
  return NextResponse.json({
    success: true,
    characterId: result.characterId,
    sessionId: result.sessionId,
    redirectUrl: result.redirectUrl,
  });
}
```

---

### Step 3: Test the Integration Locally

#### **Start ElizaOS Cloud:**

```bash
cd eliza-cloud-v2
bun install
bun run dev
```

#### **Start CloneUrCrush Landing Page:**

```bash
cd cloneurcrush-landing/launch-ui
npm install
npm run dev
```

#### **Test the Flow:**

1. Go to `http://localhost:3005` (landing page)
2. Fill out the form (name, vibe, etc.)
3. Submit
4. Should see `/connecting` animation
5. Redirects to `http://localhost:3000/chat/[characterId]`
6. Should see character intro page with "Start Chatting" button
7. Click button → Email modal appears
8. Enter email OR skip
9. Chat interface loads

---

## 🧪 Testing Checklist

- [ ] API key authenticates successfully
- [ ] Character is created in database
- [ ] Session is created for anonymous user
- [ ] Redirect URL is correct
- [ ] Intro page displays character info
- [ ] Email modal appears and works
- [ ] Skip option creates anonymous session
- [ ] Chat interface loads with character
- [ ] Messages send and receive responses
- [ ] Free message count decreases
- [ ] Signup prompt appears after 5 messages
- [ ] Paywall appears at 10 messages
- [ ] Email signup migrates session data

---

## 📊 Monitoring

### Check API Key Usage:

```sql
SELECT 
  name,
  key_prefix,
  usage_count,
  rate_limit,
  last_used_at,
  is_active
FROM api_keys
WHERE permissions @> '["affiliate:create-character"]';
```

### Check Character Creation Stats:

```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as characters_created
FROM user_characters
WHERE character_data->'affiliate'->>'affiliateId' = 'clone-your-crush'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Check Anonymous Sessions:

```sql
SELECT 
  COUNT(*) as total_sessions,
  COUNT(*) FILTER (WHERE is_active = true) as active_sessions,
  COUNT(*) FILTER (WHERE converted_at IS NOT NULL) as converted_sessions,
  AVG(message_count) as avg_messages_per_session
FROM anonymous_sessions;
```

---

## 🔐 Security Best Practices

### For ElizaOS Cloud:

- ✅ API keys are hashed in database
- ✅ Rate limiting enabled (100 req/hour default)
- ✅ Input validation with Zod schemas
- ✅ CORS configured for known domains
- ✅ All character data sanitized

### For CloneUrCrush:

- ✅ API key stored in `.env` (server-side only)
- ✅ Never expose key in frontend code
- ✅ Use HTTPS in production
- ✅ Validate user input before sending
- ✅ Handle errors gracefully

---

## 🚨 Troubleshooting

### Issue: "Invalid API key"

**Solution:**
- Check API key is correct in `.env.local`
- Verify key is active: `SELECT * FROM api_keys WHERE key_prefix = 'eliza_abc...'`
- Regenerate key if lost

### Issue: "Rate limit exceeded"

**Solution:**
- Check usage: `SELECT usage_count, rate_limit FROM api_keys WHERE ...`
- Increase rate limit: `UPDATE api_keys SET rate_limit = 200 WHERE ...`
- Wait for hourly reset

### Issue: "Character not found"

**Solution:**
- Verify character was created: `SELECT * FROM user_characters WHERE id = '...'`
- Check affiliate organization exists
- Review API logs for errors

### Issue: "Session expired"

**Solution:**
- Anonymous sessions expire after 7 days
- User needs to create new character
- Or sign up to keep data

---

## 📈 Scaling Considerations

### When Traffic Increases:

1. **Increase Rate Limits:**
   ```sql
   UPDATE api_keys 
   SET rate_limit = 1000 
   WHERE name LIKE 'Affiliate: %';
   ```

2. **Add Redis for Rate Limiting:**
   - Current implementation uses in-memory map
   - Migrate to Redis for distributed rate limiting
   - See `lib/middleware/rate-limit.ts`

3. **Enable Caching:**
   - Cache character data
   - Cache organization lookups
   - Use Redis or Vercel Edge Config

4. **Database Optimization:**
   - Add indexes on frequently queried fields
   - Consider read replicas for heavy loads
   - Archive old anonymous sessions

---

## 🎯 Next Steps

Once basic integration is working:

1. **Add Analytics:**
   - Track conversion funnel
   - Monitor affiliate performance
   - A/B test email modal copy

2. **Implement Webhooks:**
   - Notify CloneUrCrush of successful signups
   - Send character usage stats
   - Alert on quota limits

3. **Add Advanced Features:**
   - Custom character templates per affiliate
   - Revenue sharing tracking
   - White-label chat interface

4. **Production Deployment:**
   - Update URLs to production domains
   - Configure CORS for production
   - Set up monitoring (Sentry, DataDog, etc.)
   - Enable CDN for static assets

---

## 📞 Support

For issues or questions:
- Check logs: `bun run dev` output
- Database queries: `bun run db:studio`
- API testing: Use Postman or curl
- Contact: [Your support channel]

---

## 🔄 Updating the Integration

When making changes:

1. Test in local environment first
2. Deploy to staging
3. Run integration tests
4. Deploy to production
5. Monitor for errors
6. Communicate changes to CloneUrCrush team

---

**Last Updated:** [Current Date]  
**Version:** 1.0.0  
**Status:** ✅ Ready for Production

