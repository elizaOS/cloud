# Workflow Triggers - Manual Testing Guide

## Overview

This document provides a comprehensive manual testing checklist for the **Workflow Triggers** feature implemented in this session. Use this guide to verify all functionality before production deployment.

---

## Table of Contents

1. [Prerequisites & Environment Setup](#1-prerequisites--environment-setup)
2. [Feature Summary](#2-feature-summary)
3. [Database Setup](#3-database-setup)
4. [UI Testing - Trigger Management](#4-ui-testing---trigger-management)
5. [API Testing - CRUD Operations](#5-api-testing---crud-operations)
6. [Webhook Testing - Trigger Execution](#6-webhook-testing---trigger-execution)
7. [Edge Cases & Error Scenarios](#7-edge-cases--error-scenarios)
8. [Known Issues & UX Improvements](#8-known-issues--ux-improvements)
9. [Environment Variables Reference](#9-environment-variables-reference)

---

## 1. Prerequisites & Environment Setup

### Required Environment Variables

Check your `.env` or `.env.local` file for these variables:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/elizaos` |
| `NEXTAUTH_SECRET` | ✅ Yes | NextAuth session secret | `your-secret-key` |
| `NEXTAUTH_URL` | ✅ Yes | App URL for auth | `http://localhost:3000` |

### Optional (For Full Webhook Testing)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `TWILIO_ACCOUNT_SID` | ⚠️ For Twilio | Twilio Account SID | `AC...` |
| `TWILIO_AUTH_TOKEN` | ⚠️ For Twilio | Twilio Auth Token | `...` |
| `BLOOIO_API_KEY` | ⚠️ For Blooio | Blooio API Key | `...` |

### Blockers Analysis

| Blocker | Impact | Workaround |
|---------|--------|------------|
| Missing `DATABASE_URL` | 🔴 Critical - Nothing works | Must set up PostgreSQL |
| Missing Twilio credentials | 🟡 Partial - Can't test real SMS | Use mock webhook calls via curl |
| Missing Blooio credentials | 🟡 Partial - Can't test real iMessage | Use mock webhook calls via curl |

### Setup Commands

```bash
# 1. Install dependencies
cd eliza-cloud-v2
bun install

# 2. Run database migrations
bun run db:push

# 3. Start development server
bun run dev

# 4. Verify server is running
curl http://localhost:3000/api/health
```

---

## 2. Feature Summary

### What Was Built

| Component | Description | Files |
|-----------|-------------|-------|
| **Database Schema** | `workflow_triggers` table with all trigger types | `db/schemas/workflow-triggers.ts` |
| **Repository** | CRUD operations for triggers | `db/repositories/workflow-triggers.ts` |
| **Service Layer** | Trigger matching & execution logic | `lib/services/workflow-triggers/index.ts` |
| **API Routes** | REST endpoints for trigger management | `app/api/v1/workflows/[id]/triggers/` |
| **UI Components** | TriggerList, TriggerDialog | `components/workflows/trigger-*.tsx` |
| **Webhook Integration** | Twilio & Blooio webhook handlers | `app/api/webhooks/*/` |

### Trigger Types Supported

| Type | Description | Config Fields |
|------|-------------|---------------|
| `message_keyword` | Match exact keywords (word boundary) | `keywords[]`, `caseSensitive` |
| `message_contains` | Match substring anywhere | `contains`, `caseSensitive` |
| `message_from` | Match specific sender phone numbers | `phoneNumbers[]` |
| `message_regex` | Match using regex pattern | `pattern`, `caseSensitive` |
| `schedule` | Cron-based scheduled execution | `schedule` (cron expression) |
| `webhook` | External HTTP webhook trigger | `webhookSecret` (optional) |

---

## 3. Database Setup

### Verify Migration Applied

```bash
# Check if workflow_triggers table exists
bun run db:push

# Or manually check in psql
psql $DATABASE_URL -c "SELECT * FROM workflow_triggers LIMIT 1;"
```

### Expected Table Structure

```sql
-- Should see these columns:
-- id, organization_id, workflow_id, created_by_user_id, name, description,
-- trigger_type, trigger_config, response_config, provider_filter, priority,
-- is_active, trigger_count, last_triggered_at, last_error, last_error_at,
-- created_at, updated_at
```

### Test: Create Trigger via SQL (Optional)

```sql
-- Only use this for debugging, normally use the UI/API
INSERT INTO workflow_triggers (
  organization_id, workflow_id, created_by_user_id, name, trigger_type, trigger_config
) VALUES (
  'your-org-id', 'your-workflow-id', 'your-user-id', 
  'Test Trigger', 'message_keyword', '{"keywords": ["test"]}'
);
```

---

## 4. UI Testing - Trigger Management

### 4.1 Navigate to Triggers Tab

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login to dashboard | Dashboard loads |
| 2 | Click "Workflows" in sidebar | Workflow list appears |
| 3 | Click on a workflow (must be "live" or "testing" status) | Workflow detail page opens |
| 4 | Click "Triggers" tab | Triggers tab shows (may show "No triggers configured") |

### 4.2 Create Keyword Trigger

| Step | Action | Expected Result | Input |
|------|--------|-----------------|-------|
| 1 | Click "Add Trigger" button | Dialog opens | - |
| 2 | Enter Name | Name field accepts input | `Schedule Request Trigger` |
| 3 | Enter Description (optional) | Description field accepts input | `Triggers on schedule keywords` |
| 4 | Select Trigger Type | Dropdown shows options | Select `Keyword Match` |
| 5 | Add keywords | Type keyword, click + or press Enter | `schedule`, `calendar`, `events` |
| 6 | Toggle Case Sensitive (optional) | Switch toggles | Leave OFF |
| 7 | Select Provider | Dropdown shows All/SMS/iMessage | `All Providers` |
| 8 | Set Priority | Number input | `10` |
| 9 | Toggle Send Response | Switch toggles | Leave ON |
| 10 | Enter Response Template (optional) | Textarea accepts input | `Your schedule: {{summary}}` |
| 11 | Toggle Active | Switch toggles | Leave ON |
| 12 | Click "Create" | Dialog closes, trigger appears in list | - |

### 4.3 Create Contains Trigger

| Step | Action | Input |
|------|--------|-------|
| 1 | Click "Add Trigger" | - |
| 2 | Name | `Appointment Trigger` |
| 3 | Trigger Type | `Contains Text` |
| 4 | Text to Match | `appointment` |
| 5 | Provider | `All Providers` |
| 6 | Click "Create" | - |

### 4.4 Create Regex Trigger

| Step | Action | Input |
|------|--------|-------|
| 1 | Click "Add Trigger" | - |
| 2 | Name | `Date Pattern Trigger` |
| 3 | Trigger Type | `Regex Pattern` |
| 4 | Pattern | `\d{1,2}/\d{1,2}/\d{4}` |
| 5 | Click "Create" | - |

### 4.5 Create From-Sender Trigger

| Step | Action | Input |
|------|--------|-------|
| 1 | Click "Add Trigger" | - |
| 2 | Name | `VIP Customer Trigger` |
| 3 | Trigger Type | `From Sender` |
| 4 | Add Phone Numbers | `+15551234567`, `+15559876543` |
| 5 | Priority | `100` (high priority for VIP) |
| 6 | Click "Create" | - |

### 4.6 Edit Trigger

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click edit icon (pencil) on a trigger | Edit dialog opens with pre-filled values |
| 2 | Verify Name field shows current value | Should NOT show "undefined" |
| 3 | Change Name | Name updates |
| 4 | Change Priority | Priority updates |
| 5 | Click "Update" | Dialog closes, list refreshes |

### 4.7 Toggle Trigger Active/Inactive

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find a trigger with Active toggle ON (checked) | Switch shows checked state |
| 2 | Click the toggle switch | Switch changes to OFF (unchecked) |
| 3 | Verify toast notification | Shows "Trigger disabled" |
| 4 | Click toggle again | Switch changes to ON (checked) |
| 5 | Verify toast notification | Shows "Trigger enabled" |

### 4.8 Delete Trigger

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click delete icon (trash) on a trigger | Browser confirm dialog appears |
| 2 | Click "OK" to confirm | Trigger removed from list |
| 3 | Verify toast notification | Shows "Trigger deleted" |

---

## 5. API Testing - CRUD Operations

### 5.1 Get Auth Token

```bash
# Option 1: Get from browser DevTools
# 1. Open browser DevTools (F12)
# 2. Go to Application > Cookies
# 3. Copy the session token

# Option 2: Create API key in dashboard
# 1. Go to Settings > API Keys
# 2. Create new key
# 3. Copy the key

# Set the token for testing
export AUTH_TOKEN="your-token-here"
export WORKFLOW_ID="your-workflow-id"
export BASE_URL="http://localhost:3000/api/v1"
```

### 5.2 List Triggers

```bash
curl -X GET "$BASE_URL/workflows/$WORKFLOW_ID/triggers" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" | jq
```

**Expected Response:**
```json
{
  "triggers": [
    {
      "id": "uuid",
      "workflowId": "uuid",
      "name": "Schedule Request Trigger",
      "triggerType": "message_keyword",
      "triggerConfig": { "keywords": ["schedule", "calendar"] },
      "isActive": true,
      "triggerCount": 0,
      "createdAt": "2024-01-28T..."
    }
  ]
}
```

### 5.3 Create Trigger

```bash
curl -X POST "$BASE_URL/workflows/$WORKFLOW_ID/triggers" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "API Test Trigger",
    "triggerType": "message_keyword",
    "triggerConfig": {
      "keywords": ["api", "test"],
      "caseSensitive": false
    },
    "responseConfig": {
      "sendResponse": true,
      "responseTemplate": "API trigger executed: {{result}}"
    },
    "providerFilter": "all",
    "priority": 5,
    "isActive": true
  }' | jq
```

**Expected Response (201 Created):**
```json
{
  "success": true,
  "trigger": {
    "id": "new-uuid",
    "name": "API Test Trigger",
    "triggerType": "message_keyword",
    "isActive": true
  }
}
```

### 5.4 Get Single Trigger

```bash
export TRIGGER_ID="your-trigger-id"

curl -X GET "$BASE_URL/workflows/$WORKFLOW_ID/triggers/$TRIGGER_ID" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq
```

### 5.5 Update Trigger

```bash
curl -X PATCH "$BASE_URL/workflows/$WORKFLOW_ID/triggers/$TRIGGER_ID" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Trigger Name",
    "isActive": false,
    "priority": 20
  }' | jq
```

**Expected Response:**
```json
{
  "success": true,
  "trigger": {
    "name": "Updated Trigger Name",
    "isActive": false,
    "priority": 20
  }
}
```

### 5.6 Delete Trigger

```bash
curl -X DELETE "$BASE_URL/workflows/$WORKFLOW_ID/triggers/$TRIGGER_ID" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Trigger deleted"
}
```

### 5.7 List Organization Triggers

```bash
curl -X GET "$BASE_URL/triggers" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq
```

---

## 6. Webhook Testing - Trigger Execution

### Prerequisites

1. Create at least one active trigger (e.g., keyword trigger with "help")
2. Note your organization ID
3. Have the dev server running

### 6.1 Test Twilio Webhook (Simulated)

```bash
export ORG_ID="your-org-id"

# Simulate incoming SMS with keyword "help"
curl -X POST "http://localhost:3000/api/webhooks/twilio/$ORG_ID" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SM123456789" \
  -d "AccountSid=AC123456789" \
  -d "From=+15551234567" \
  -d "To=+15559876543" \
  -d "Body=I need help with my schedule"
```

**Expected Response (TwiML):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Your schedule: [workflow output]</Message>
</Response>
```

### 6.2 Test Blooio Webhook (Simulated)

```bash
# Simulate incoming iMessage
curl -X POST "http://localhost:3000/api/webhooks/blooio/$ORG_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message.received",
    "message_id": "msg_123",
    "sender": "+15551234567",
    "text": "What is my schedule for today?",
    "protocol": "imessage"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "triggerId": "uuid",
  "workflowId": "uuid",
  "response": "Your schedule: ..."
}
```

### 6.3 Webhook Health Check

```bash
# Twilio health check
curl "http://localhost:3000/api/webhooks/twilio/$ORG_ID" | jq

# Blooio health check
curl "http://localhost:3000/api/webhooks/blooio/$ORG_ID" | jq
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "twilio-webhook",
  "organizationId": "your-org-id"
}
```

---

## 7. Edge Cases & Error Scenarios

### 7.1 Validation Errors

| Test | Input | Expected Error |
|------|-------|----------------|
| Missing name | `{ "triggerType": "message_keyword" }` | 400: "name is required" |
| Invalid trigger type | `{ "name": "X", "triggerType": "invalid" }` | 400: "Invalid triggerType" |
| Empty keywords | `{ "triggerType": "message_keyword", "triggerConfig": { "keywords": [] } }` | 400: "requires at least one keyword" |
| Invalid regex | `{ "triggerType": "message_regex", "triggerConfig": { "pattern": "[invalid(" } }` | 400: "Invalid regex pattern" |
| Duplicate name | Create two triggers with same name | 400: "already exists" |

### 7.2 Authorization Errors

| Test | Expected |
|------|----------|
| No auth header | 401 Unauthorized |
| Invalid token | 401 Unauthorized |
| Access other org's workflow | 403 Forbidden |

### 7.3 Not Found Errors

| Test | Expected |
|------|----------|
| Non-existent workflow ID | 404 Not Found |
| Non-existent trigger ID | 404 Not Found |

### 7.4 Message Edge Cases

| Test Message | Expected Behavior |
|--------------|-------------------|
| Empty message `""` | Should skip trigger matching, go to agent |
| Whitespace only `"   "` | Should skip trigger matching, go to agent |
| Very long message (1600+ chars) | Should process without error |
| Unicode/emoji `"help 🆘"` | Should match "help" keyword |
| Keyword as substring `"reschedule"` | Should NOT match "schedule" keyword |
| Multiple keywords `"help with schedule"` | Should match first matching trigger by priority |

---

## 8. Known Issues & UX Improvements

### Current Known Issues

| Issue | Severity | Description | Workaround |
|-------|----------|-------------|------------|
| Dialog doesn't close | Medium | Cancel/Close/Escape don't close the trigger dialog | Reload the page |
| No inline validation | Low | Required fields only show toast error, no inline red border | Check toast notifications |

### Recommended UX Improvements (Future)

1. **Inline form validation** - Show red border on invalid fields
2. **Dialog close fix** - Ensure Cancel/Close/Escape properly close dialog
3. **Trigger test button** - Button to test a trigger with sample message
4. **Execution history** - Show last N executions in trigger detail
5. **Bulk operations** - Enable/disable multiple triggers at once

---

## 9. Environment Variables Reference

### Complete .env Template

```env
# ===========================================
# REQUIRED - Application Won't Work Without
# ===========================================

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/elizaos_cloud"

# Authentication
NEXTAUTH_SECRET="your-secret-key-min-32-chars"
NEXTAUTH_URL="http://localhost:3000"

# ===========================================
# OPTIONAL - For Full Feature Testing
# ===========================================

# Twilio (for SMS webhook testing)
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."

# Blooio (for iMessage webhook testing)
BLOOIO_API_KEY="..."
BLOOIO_WEBHOOK_SECRET="..."

# ===========================================
# FOR E2E AUTOMATED TESTS
# ===========================================

# Test configuration
TEST_ORG_ID="your-org-uuid"
TEST_WORKFLOW_ID="your-workflow-uuid"
TEST_AUTH_TOKEN="your-api-token"
ELIZAOS_CLOUD_BASE_URL="http://localhost:3000/api/v1"
```

### Checking Environment Variables

```bash
# Check if DATABASE_URL is set
echo $DATABASE_URL

# Check all env vars (be careful, this shows secrets)
env | grep -E "(DATABASE|TWILIO|BLOOIO|NEXTAUTH)"

# Test database connection
psql $DATABASE_URL -c "SELECT 1;"
```

---

## Quick Test Checklist

### Minimum Viable Test (5 minutes)

- [ ] Server starts without errors (`bun run dev`)
- [ ] Can login to dashboard
- [ ] Can navigate to a workflow's Triggers tab
- [ ] Can create a keyword trigger
- [ ] Can toggle trigger on/off
- [ ] Can delete trigger

### Full Test (30 minutes)

- [ ] All UI tests in Section 4
- [ ] All API tests in Section 5
- [ ] Simulated webhook tests in Section 6
- [ ] Edge cases in Section 7

### Production Readiness (1 hour)

- [ ] Full test checklist above
- [ ] Test with real Twilio webhook (if credentials available)
- [ ] Test with real Blooio webhook (if credentials available)
- [ ] Load test: Create 50+ triggers, verify list performance
- [ ] Concurrent test: Multiple webhook calls at once

---

## Test Results Log

Use this section to record your test results:

| Date | Tester | Test | Result | Notes |
|------|--------|------|--------|-------|
| YYYY-MM-DD | Name | UI - Create Trigger | ✅/❌ | |
| | | UI - Edit Trigger | ✅/❌ | |
| | | UI - Toggle Trigger | ✅/❌ | |
| | | UI - Delete Trigger | ✅/❌ | |
| | | API - CRUD | ✅/❌ | |
| | | Webhook - Twilio | ✅/❌ | |
| | | Webhook - Blooio | ✅/❌ | |
| | | Edge Cases | ✅/❌ | |

---

*Generated: 2026-01-28*
*Feature: Workflow Triggers - Inbound Message Handling*
