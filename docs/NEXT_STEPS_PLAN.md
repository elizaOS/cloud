# AI Workflow Builder - Next Steps Plan

> Generated: 2026-01-28
> Status: Post-MVP Analysis & Planning

---

## Executive Summary

We've built the **foundation** of an AI Workflow Builder. Workflows can be generated and the execution framework exists. However, **execution is failing** and several critical features are missing for a usable product.

**Current Success Rate: 0%** (1 execution, 1 failure)

---

## Part 1: Deep Analysis

### What's Built & Working

| Component | Status | Notes |
|-----------|--------|-------|
| Workflow Generation | ✅ Working | OpenAI GPT-4o generates code |
| Workflow Studio UI | ✅ Working | Create, list, view workflows |
| Messaging Center UI | ✅ Working | View SMS/iMessage conversations |
| Google OAuth | ✅ Working | Connect/disconnect flow |
| Twilio Connection | ✅ Working | Credentials stored |
| Blooio Connection | ⚠️ Partial | 404 errors on validation |
| Database | ✅ Working | All migrations applied |
| Token Refresh Service | ✅ Exists | Code written but untested |

### What's NOT Working

| Issue | Severity | Root Cause |
|-------|----------|------------|
| Workflow execution fails | 🔴 Critical | Google credentials not found/expired |
| Execution plan incomplete | 🔴 Critical | AI only generates 1 step |
| No input parameters | 🟠 High | Can't provide phone/email at runtime |
| No triggers | 🟠 High | Workflows can't auto-run |
| No error feedback | 🟠 High | Users don't know why it failed |
| Blooio validation | 🟡 Medium | API returning 404 |
| Character counter bug | 🟢 Low | UI state sync issue |

---

## Part 2: Root Cause Analysis

### Why Execution Failed

```
User clicks "Run" → execute/route.ts
    ↓
workflowExecutorService.execute()
    ↓
Read execution_plan from workflow: [{ step: 1, serviceId: "google", operation: "calendar.list_events" }]
    ↓
executeAction("google", "calendar.list_events")
    ↓
this.listCalendarEvents()
    ↓
this.getGoogleCredentials() → googleTokenService.getValidToken()
    ↓
❌ FAILED - Token not found or expired
```

**Likely causes:**
1. `platform_credentials.access_token_secret_id` is NULL or wrong
2. Token expired and refresh failed silently
3. Secret decryption failed

### Why AI Generated Incomplete Plan

User Intent: *"When I receive an SMS asking about my calendar, check my Google Calendar and respond with my availability for today."*

**What the user expected:**
```
Step 1: [trigger] Receive SMS (Twilio)
Step 2: [action] List calendar events (Google)
Step 3: [action] Send SMS reply (Twilio)
```

**What AI generated:**
```
Step 1: [action] List calendar events (Google)
```

**Why?** The `dependency-resolver.ts` only identifies the PRIMARY action. It doesn't understand:
- Triggers (SMS received)
- Response actions (reply via SMS)
- Multi-step flows

---

## Part 3: Prioritized Plan

### 🔴 Phase 0: Fix Critical Blockers (Do First)

**Goal:** Make ONE workflow execute successfully

#### 0.1 Debug Google Credentials Flow
```
Priority: P0
Effort: 2-4 hours
```

- [ ] Add detailed logging to `workflow-executor/index.ts`
- [ ] Check `platform_credentials` table for valid `access_token_secret_id`
- [ ] Verify `secrets` table has the token
- [ ] Test token decryption manually
- [ ] Test Google API call with hardcoded token

#### 0.2 Fix Execution Plan Mapping
```
Priority: P0
Effort: 1-2 hours
```

Current issue: `google.calendar.list_events` vs `google.listCalendarEvents`

- [ ] Check what format dependency-resolver outputs
- [ ] Update executeAction() switch cases to match
- [ ] Add logging for unmatched operations

#### 0.3 Add Execution Logging
```
Priority: P0
Effort: 1-2 hours
```

- [ ] Log each step before/after execution
- [ ] Log credential fetch results
- [ ] Log API response or error details
- [ ] Store logs in execution record

---

### 🟠 Phase 1: Make Execution Usable (Core MVP)

**Goal:** Users can execute workflows with inputs and see results

#### 1.1 Input Parameters UI
```
Priority: P1
Effort: 4-6 hours
```

When executing a workflow, allow users to provide:
- Phone numbers (to/from)
- Email addresses
- Custom text/body
- Date ranges

**UI Design:**
```
┌─────────────────────────────────────┐
│  Execute Workflow                    │
├─────────────────────────────────────┤
│  📧 To Email: [____________]         │
│  📱 Phone:    [____________]         │
│  📝 Message:  [____________]         │
│                                      │
│  [Cancel]              [▶ Execute]   │
└─────────────────────────────────────┘
```

#### 1.2 Dry Run Mode
```
Priority: P1
Effort: 2-3 hours
```

- [ ] Add "Test Run" button to workflow detail
- [ ] Execute with `dryRun: true` flag
- [ ] Show what WOULD happen without calling real APIs
- [ ] Display simulated results

#### 1.3 Execution Result Display
```
Priority: P1
Effort: 3-4 hours
```

Show step-by-step results:
```
┌─────────────────────────────────────┐
│  Execution Results                   │
├─────────────────────────────────────┤
│  ✅ Step 1: google.listCalendarEvents│
│     Found 5 events                   │
│     Duration: 342ms                  │
│                                      │
│  ❌ Step 2: twilio.sendSms           │
│     Error: Invalid phone number      │
│     Duration: 12ms                   │
└─────────────────────────────────────┘
```

#### 1.4 Better Error Messages
```
Priority: P1
Effort: 2-3 hours
```

Instead of "Execution failed", show:
- Which step failed
- Why it failed (human readable)
- How to fix it (reconnect Google, check phone number, etc.)

---

### 🟡 Phase 2: Triggers & Automation

**Goal:** Workflows run automatically based on events

#### 2.1 SMS Trigger
```
Priority: P2
Effort: 4-6 hours
```

When SMS received via Twilio webhook:
1. Match to phone number mapping
2. Find workflows with SMS trigger for that number
3. Execute workflow with SMS content as input

**Database change:**
```sql
ALTER TABLE generated_workflows 
ADD COLUMN trigger_type VARCHAR(50),
ADD COLUMN trigger_config JSONB;
```

#### 2.2 Schedule Trigger
```
Priority: P2
Effort: 4-6 hours
```

Run workflows on a schedule:
- Every hour
- Daily at specific time
- Weekly

**Implementation:** Use Vercel Cron or external scheduler

#### 2.3 Email Trigger (Future)
```
Priority: P3
Effort: 8-12 hours
```

Poll Gmail for new emails matching criteria:
- From specific sender
- With specific subject
- In specific label

---

### 🟢 Phase 3: Enhanced AI Generation

**Goal:** AI generates complete, multi-step workflows

#### 3.1 Multi-Step Plans
```
Priority: P2
Effort: 6-8 hours
```

Update prompt engineering to generate:
- Trigger step (optional)
- Multiple action steps
- Response/output step

**Example output:**
```json
{
  "trigger": { "type": "sms", "config": { "contains": "calendar" } },
  "steps": [
    { "action": "google.listCalendarEvents", "params": { "timeMin": "today" } },
    { "action": "twilio.sendSms", "params": { "body": "{{steps.1.summary}}" } }
  ]
}
```

#### 3.2 Variable Passing
```
Priority: P2
Effort: 4-6 hours
```

Pass output from one step to next:
- `{{trigger.body}}` - SMS content
- `{{steps.1.events}}` - Calendar events from step 1
- `{{input.phone}}` - User-provided input

#### 3.3 Conditional Logic
```
Priority: P3
Effort: 8-12 hours
```

Add if/else branching:
```
IF events.length > 0:
  Send "You have {n} events"
ELSE:
  Send "Your calendar is clear"
```

---

### 🔵 Phase 4: Polish & Production

**Goal:** Production-ready features

| Feature | Priority | Effort |
|---------|----------|--------|
| Workflow templates | P3 | 4-6h |
| Workflow versioning | P3 | 4-6h |
| Usage analytics | P3 | 4-6h |
| Rate limiting | P3 | 2-3h |
| Error alerting | P3 | 2-3h |
| Documentation | P3 | 4-6h |

---

## Part 4: Recommended Immediate Actions

### Today's Focus

```
┌────────────────────────────────────────────────────┐
│  1. Debug Google Credentials (2 hours)              │
│     - Check platform_credentials table              │
│     - Verify access_token_secret_id exists          │
│     - Test token decryption                         │
│                                                     │
│  2. Fix Operation Mapping (1 hour)                  │
│     - Match execution plan format to switch cases   │
│     - Add "google.calendar.list_events" mapping     │
│                                                     │
│  3. Add Execution Logging (1 hour)                  │
│     - Log every step to console                     │
│     - Log credential fetch results                  │
│                                                     │
│  4. Re-test Execution (30 min)                      │
│     - Run the same workflow                         │
│     - Verify success or get specific error          │
└────────────────────────────────────────────────────┘
```

### This Week's Goals

1. **Phase 0 Complete** - At least one workflow executes successfully
2. **Input Parameters UI** - Users can provide phone/email
3. **Execution Results Display** - See what happened step-by-step

---

## Part 5: Technical Debt

| Item | Risk | Action |
|------|------|--------|
| No unit tests for executor | High | Add tests after stabilizing |
| Hardcoded operation names | Medium | Create enum/constant file |
| No retry logic | Medium | Add for API failures |
| Secrets stored unencrypted in tests | Low | Use test encryption key |

---

## Part 6: Architecture Decisions Needed

### Decision 1: Workflow Execution Location

**Option A:** Execute in API route (current)
- ✅ Simple
- ❌ 60s timeout limit
- ❌ Blocks API

**Option B:** Background job queue
- ✅ No timeout
- ✅ Retries
- ❌ More complex

**Recommendation:** Start with Option A, migrate to B when needed

### Decision 2: Trigger Implementation

**Option A:** Polling (check for triggers periodically)
- ✅ Simple
- ❌ Not real-time
- ❌ Wastes resources

**Option B:** Webhooks (immediate on event)
- ✅ Real-time
- ✅ Efficient
- ❌ Requires webhook setup

**Recommendation:** Use webhooks for SMS/iMessage (already have), polling for email

---

## Summary

| Phase | Status | Next Step |
|-------|--------|-----------|
| Phase 0: Fix Blockers | 🔴 Not Started | Debug Google credentials |
| Phase 1: Core MVP | 🔴 Not Started | Waiting on Phase 0 |
| Phase 2: Triggers | 🔴 Not Started | After Phase 1 |
| Phase 3: Enhanced AI | 🔴 Not Started | After Phase 2 |
| Phase 4: Production | 🔴 Not Started | After Phase 3 |

**Estimated time to working MVP:** 2-3 days of focused work on Phases 0 and 1.
