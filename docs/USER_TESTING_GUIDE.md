# User Testing Guide - AI Workflow Builder Features

This guide explains how to manually test all the features we built, what inputs to provide, and what outputs to expect.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Testing Connection UIs](#testing-connection-uis)
   - [Google Services](#1-google-services-connection)
   - [Twilio SMS & Voice](#2-twilio-sms--voice-connection)
   - [Blooio iMessage](#3-blooio-imessage-connection)
3. [Testing Webhook Endpoints](#testing-webhook-endpoints)
   - [Twilio Webhook](#4-twilio-webhook)
   - [Blooio Webhook](#5-blooio-webhook)
4. [Testing API Endpoints](#testing-api-endpoints)
5. [Database Verification](#database-verification)
6. [Expected Behaviors](#expected-behaviors)

---

## Prerequisites

### Environment Variables Required

Add these to your `.env.local` file:

```bash
# Google OAuth (for Gmail, Calendar, Contacts)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/google/callback

# Twilio (for SMS/MMS/Voice)
# Note: These are stored per-user in the database, not as env vars

# Blooio (for iMessage)
# Note: These are stored per-user in the database, not as env vars

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/eliza_cloud
```

### Start the Application

```bash
cd eliza-cloud-v2
bun run dev
```

Server should be running at `http://localhost:3000`

---

## Testing Connection UIs

### 1. Google Services Connection

**Location:** `http://localhost:3000/dashboard/settings?tab=connections`

**What You'll See:**
- A card titled "Google Services" with Gmail, Calendar, and Contacts icons
- "Connect with Google" button (blue)
- Description: "Connect your Google account to enable AI-powered email, calendar, and contact management"

**How to Test:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Connections tab | Google Services card is visible |
| 2 | Click "Connect with Google" | Redirects to Google OAuth consent screen |
| 3 | Complete OAuth flow | Redirects back to settings page |
| 4 | Verify connection | Card shows "Connected" status with email address |

**Expected Output When Connected:**
```
✓ Connected
user@gmail.com
Scopes: Gmail, Calendar, Contacts

Available Automations:
• Send emails on your behalf
• Create and manage calendar events
• Access contact information
```

**If Not Configured (Missing GOOGLE_CLIENT_ID):**
- Button click shows error toast: "Google OAuth is not configured"
- API returns 500 error

---

### 2. Twilio SMS & Voice Connection

**Location:** `http://localhost:3000/dashboard/settings?tab=connections`

**What You'll See:**
- A card titled "Twilio SMS & Voice" with phone icon
- Form fields:
  - Account SID (text input)
  - Auth Token (password input)
  - Twilio Phone Number (text input with +1 format hint)
- "Connect Twilio" button

**How to Test:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Connections tab | Twilio card is visible |
| 2 | Enter Account SID | e.g., `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| 3 | Enter Auth Token | e.g., `your_auth_token_here` |
| 4 | Enter Phone Number | e.g., `+15551234567` |
| 5 | Click "Connect Twilio" | Shows loading state, then success/error |

**Expected Output When Connected:**
```
✓ Connected
+1 (555) 123-4567
Account: ACxxxx...xxxx

Webhook Status: ✓ Configured
https://yourapp.com/api/webhooks/twilio/[orgId]

Available Automations:
• Send and receive SMS messages
• Send MMS with images
• Handle voice calls
```

**Validation Errors:**
- Empty Account SID: "Account SID is required"
- Invalid format: "Account SID must start with 'AC'"
- Empty Auth Token: "Auth Token is required"
- Invalid phone: "Please enter a valid phone number"

---

### 3. Blooio iMessage Connection

**Location:** `http://localhost:3000/dashboard/settings?tab=connections`

**What You'll See:**
- A card titled "iMessage (Blooio)" with message bubble icon
- Form fields:
  - Blooio API Key (password input)
  - iMessage Phone Number (text input)
- "Connect iMessage" button

**How to Test:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Connections tab | Blooio card is visible |
| 2 | Enter Blooio API Key | e.g., `bloo_xxxxxxxxxxxx` |
| 3 | Enter Phone Number | e.g., `+15559876543` |
| 4 | Click "Connect iMessage" | Shows loading state, then success/error |

**Expected Output When Connected:**
```
✓ Connected
+1 (555) 987-6543

Webhook Status: ✓ Configured
https://yourapp.com/api/webhooks/blooio/[orgId]

Available Automations:
• Send and receive iMessages
• Rich media support (images, videos)
• Read receipts and typing indicators
```

---

## Testing Webhook Endpoints

### 4. Twilio Webhook

**Endpoint:** `POST /api/webhooks/twilio/[orgId]`

**How to Test with cURL:**

```bash
# Replace [orgId] with your actual organization ID
curl -X POST "http://localhost:3000/api/webhooks/twilio/YOUR_ORG_ID" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SM1234567890abcdef" \
  -d "From=+15559876543" \
  -d "To=+15551234567" \
  -d "Body=Hello from test!" \
  -d "AccountSid=ACtest123" \
  -d "NumMedia=0"
```

**Expected Response (TwiML):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thanks for your message! I'll process it shortly.</Message>
</Response>
```

**Health Check:**
```bash
curl "http://localhost:3000/api/webhooks/twilio/YOUR_ORG_ID"
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "twilio-webhook",
  "organizationId": "YOUR_ORG_ID"
}
```

---

### 5. Blooio Webhook

**Endpoint:** `POST /api/webhooks/blooio/[orgId]`

**How to Test with cURL:**

```bash
# Replace [orgId] with your actual organization ID
curl -X POST "http://localhost:3000/api/webhooks/blooio/YOUR_ORG_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message.received",
    "message_id": "bloo_123456",
    "sender": "+15559876543",
    "text": "Hello from iMessage!",
    "timestamp": "2024-01-27T12:00:00Z",
    "protocol": "imessage",
    "attachments": []
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Message processed"
}
```

**Health Check:**
```bash
curl "http://localhost:3000/api/webhooks/blooio/YOUR_ORG_ID"
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "blooio-webhook",
  "organizationId": "YOUR_ORG_ID"
}
```

---

## Testing API Endpoints

### Status Endpoints

Test each connection status:

```bash
# Get your API key from Settings > APIs tab first

# Google Status
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/v1/google/status"

# Expected: {"connected": false} or {"connected": true, "email": "user@gmail.com", ...}

# Twilio Status
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/v1/twilio/status"

# Expected: {"connected": false} or {"connected": true, "phoneNumber": "+15551234567", ...}

# Blooio Status
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/v1/blooio/status"

# Expected: {"connected": false} or {"connected": true, "phoneNumber": "+15559876543", ...}
```

### Connect Endpoints

```bash
# Connect Twilio
curl -X POST "http://localhost:3000/api/v1/twilio/connect" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "accountSid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "authToken": "your_auth_token",
    "phoneNumber": "+15551234567"
  }'

# Expected: {"success": true, "message": "Twilio connected successfully"}

# Connect Blooio
curl -X POST "http://localhost:3000/api/v1/blooio/connect" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "bloo_xxxxxxxxxxxx",
    "phoneNumber": "+15559876543"
  }'

# Expected: {"success": true, "message": "Blooio connected successfully"}
```

### Disconnect Endpoints

```bash
# Disconnect Google
curl -X DELETE "http://localhost:3000/api/v1/google/disconnect" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Disconnect Twilio
curl -X DELETE "http://localhost:3000/api/v1/twilio/disconnect" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Disconnect Blooio
curl -X DELETE "http://localhost:3000/api/v1/blooio/disconnect" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Expected: {"success": true}
```

---

## Database Verification

### Check Tables Exist

```bash
psql $DATABASE_URL -c "\dt"
```

**Expected Tables:**
- `agent_phone_numbers`
- `phone_message_log`
- `generated_workflows`
- `workflow_executions`
- `user_mcps`
- `mcp_usage`

### View Table Structure

```bash
# Phone number mappings
psql $DATABASE_URL -c "\d agent_phone_numbers"

# Message logs
psql $DATABASE_URL -c "\d phone_message_log"

# Generated workflows
psql $DATABASE_URL -c "\d generated_workflows"
```

### Query Test Data

```bash
# Check connected services
psql $DATABASE_URL -c "SELECT platform, created_at FROM platform_credentials WHERE organization_id = 'YOUR_ORG_ID'"

# Check phone number registrations
psql $DATABASE_URL -c "SELECT phone_number, provider, is_active FROM agent_phone_numbers WHERE organization_id = 'YOUR_ORG_ID'"

# Check message history
psql $DATABASE_URL -c "SELECT direction, from_number, to_number, status, created_at FROM phone_message_log ORDER BY created_at DESC LIMIT 10"
```

---

## Expected Behaviors

### Success Scenarios

| Action | Expected Behavior |
|--------|-------------------|
| Connect Google | Redirects to Google OAuth, stores tokens, shows connected status |
| Connect Twilio | Validates credentials, stores securely, shows phone number |
| Connect Blooio | Validates API key, stores securely, shows phone number |
| Receive SMS | Logs message, routes to agent, sends response |
| Receive iMessage | Logs message, routes to agent, sends response |
| Disconnect service | Removes credentials, shows disconnected status |

### Error Scenarios

| Error | Expected Behavior |
|-------|-------------------|
| Invalid Twilio credentials | Shows error toast: "Invalid Twilio credentials" |
| Missing API key | Returns 401 Unauthorized |
| Invalid phone number | Shows validation error on form |
| Webhook without org | Returns 400 Bad Request |
| Google OAuth not configured | Returns 500 with message about missing config |

### Loading States

- Buttons show spinner during API calls
- Cards show skeleton loaders while fetching status
- Forms disable submit during processing

### Toast Notifications

- **Success:** Green toast with checkmark
- **Error:** Red toast with X icon
- **Info:** Blue toast with info icon

---

## Troubleshooting

### Common Issues

1. **"Google OAuth is not configured"**
   - Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env.local`
   - Restart the dev server

2. **"Invalid Twilio credentials"**
   - Verify Account SID starts with "AC"
   - Check Auth Token is correct
   - Ensure phone number is in E.164 format (+15551234567)

3. **"Webhook not receiving messages"**
   - Verify webhook URL is publicly accessible (use ngrok for local testing)
   - Check Twilio/Blooio dashboard for webhook configuration
   - Verify organization ID in webhook URL

4. **"Database table doesn't exist"**
   - Run migrations: `bun run db:migrate`

### Debug Commands

```bash
# Check server logs
tail -f logs/server.log

# Test database connection
psql $DATABASE_URL -c "SELECT 1"

# Check API health
curl http://localhost:3000/api/health

# View recent errors
grep -i error logs/server.log | tail -20
```

---

## Test Checklist

Use this checklist to verify all features:

- [ ] **Settings Page**
  - [ ] Connections tab loads without errors
  - [ ] All 3 connection cards visible (Google, Twilio, Blooio)
  - [ ] Tab navigation works correctly

- [ ] **Google Connection**
  - [ ] "Connect with Google" button visible
  - [ ] OAuth redirect works (if configured)
  - [ ] Status shows correctly after connection
  - [ ] Disconnect removes connection

- [ ] **Twilio Connection**
  - [ ] Form fields accept input
  - [ ] Validation messages show for invalid input
  - [ ] Connect stores credentials
  - [ ] Status shows phone number when connected
  - [ ] Disconnect removes connection

- [ ] **Blooio Connection**
  - [ ] Form fields accept input
  - [ ] Validation messages show for invalid input
  - [ ] Connect stores credentials
  - [ ] Status shows phone number when connected
  - [ ] Disconnect removes connection

- [ ] **Webhooks**
  - [ ] Twilio webhook responds to POST requests
  - [ ] Blooio webhook responds to POST requests
  - [ ] Health check endpoints return OK

- [ ] **Database**
  - [ ] All tables created
  - [ ] Credentials stored securely
  - [ ] Message logs recording properly

---

## Running Automated Tests

```bash
# Run all integration tests
cd eliza-cloud-v2
bun test tests/integration/

# Run specific test files
bun test tests/integration/message-router.test.ts
bun test tests/integration/connection-apis.test.ts
bun test tests/integration/webhooks-e2e.test.ts
bun test tests/integration/phone-mapping-e2e.test.ts
bun test tests/integration/workflow-executor-e2e.test.ts
```

---

## Questions?

If you encounter issues not covered here, check:
1. Server console for error messages
2. Browser console for JavaScript errors
3. Network tab for failed API requests
4. Database logs for query errors
