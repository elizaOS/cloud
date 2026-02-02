# Eliza App Authentication & Messaging Specification

**Status**: Ready for Implementation
**Date**: 2026-02-02
**Scope**: Telegram + iMessage authentication flows for eliza-app

---

## 1. Overview

Eliza App allows users to chat with an AI agent via two channels:
- **iMessage** - Text +14245074963
- **Telegram** - DM the bot after OAuth

Each new user gets **$1.00 USD credits** which limits message count until they upgrade.

### Design Principles

1. **Frictionless iMessage**: Users can text immediately, no signup required
2. **Bot Protection for Telegram**: Require phone number to prevent bot abuse
3. **Cross-Platform Memory**: Same user across channels shares conversation history
4. **Phone as Identity Anchor**: Phone number links accounts across platforms

---

## 2. Authentication Flows

### 2.1 iMessage Flow (Auto-Provision)

```
┌─────────────────────────────────────────────────────────────────┐
│                     iMESSAGE FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User texts +14245074963 from their iPhone                   │
│     └── Blooio receives message with sender phone number        │
│                                                                 │
│  2. Backend webhook receives message                            │
│     └── Extract sender identifier (phone or Apple ID email)     │
│     └── Normalize: phone to E.164, email to lowercase           │
│                                                                 │
│  3. Lookup user by phone number                                 │
│     ├── EXISTS: Use existing user (may have Telegram linked)    │
│     └── NOT EXISTS: Auto-create user + org with $1 credits      │
│                                                                 │
│  4. Process message with agent                                  │
│     └── Room ID: SHA256("eliza-app:imessage:room:{agent}:{phone}") │
│     └── Entity ID: user.id (unified for cross-platform)         │
│                                                                 │
│  5. Send response via Blooio API                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why no verification needed:**
- iMessage sender phone is carrier-verified
- You cannot spoof the sender in iMessage
- Apple validates phone ownership through carrier

**Apple ID Email Support:**
- iMessage allows sending from Apple ID email addresses
- We auto-provision these users by email (similar to phone users)
- Cross-platform linking: Users can later do Telegram OAuth to link phone

### 2.2 Telegram Flow (OAuth + Phone Required)

```
┌─────────────────────────────────────────────────────────────────┐
│                    TELEGRAM FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User visits eliza.app/get-started                          │
│     └── Selects "Connect with Telegram"                         │
│                                                                 │
│  2. Telegram Login Widget                                       │
│     └── User authenticates via Telegram app/browser             │
│     └── Returns: id, username, first_name, photo_url, hash      │
│                                                                 │
│  3. Phone Number Input (MANDATORY)                              │
│     └── User enters phone number                                │
│     └── Validates E.164 format                                  │
│     └── Purpose: Prevent Telegram bots from abusing             │
│                                                                 │
│  4. Backend creates/links user                                  │
│     ├── Phone exists (iMessage user): Link Telegram to user     │
│     ├── Telegram exists: Update phone if not set                │
│     └── Neither exists: Create new user + org with $1 credits   │
│                                                                 │
│  5. Return JWT session token                                    │
│     └── User redirected to dashboard                            │
│                                                                 │
│  6. User can now DM the Telegram bot                            │
│     └── Webhook looks up by telegram_id                         │
│     └── Entity ID: user.id (unified for cross-platform)         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why phone required for Telegram:**
- Telegram accounts can be created by bots
- No carrier verification like iMessage
- Phone number adds friction that deters automated abuse
- Enables cross-platform linking with iMessage

### 2.3 Cross-Platform Linking

```
┌─────────────────────────────────────────────────────────────────┐
│                 CROSS-PLATFORM SCENARIOS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SCENARIO A: iMessage first, then Telegram                      │
│  ─────────────────────────────────────────                      │
│  1. User texts from +15551234567 → user created with phone      │
│  2. User does Telegram OAuth with same phone                    │
│  3. Backend links telegram_id to existing user                  │
│  4. Same user.id = shared memory across both channels           │
│                                                                 │
│  SCENARIO B: Telegram first, then iMessage                      │
│  ─────────────────────────────────────────                      │
│  1. User does Telegram OAuth with phone +15551234567            │
│  2. User texts from same phone via iMessage                     │
│  3. Backend finds user by phone_number                          │
│  4. Same user.id = shared memory across both channels           │
│                                                                 │
│  SCENARIO C: Different phones (no linking)                      │
│  ─────────────────────────────────────────                      │
│  1. User does Telegram OAuth with phone +15551111111            │
│  2. User texts from +15552222222 via iMessage                   │
│  3. Two separate users, two separate conversations              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Model

### 3.1 User Table (existing, extended)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key, used as entityId |
| `telegram_id` | TEXT (unique) | Telegram user ID |
| `telegram_username` | TEXT | @username |
| `telegram_first_name` | TEXT | Display name |
| `telegram_photo_url` | TEXT | Profile photo |
| `phone_number` | TEXT (unique, E.164) | Phone for iMessage + linking |
| `phone_verified` | BOOLEAN | Legacy, not used |
| `email` | TEXT (unique) | Apple ID email (blocked for auth) |
| `organization_id` | UUID (FK) | User's organization |
| `is_active` | BOOLEAN | Account status |

### 3.2 Organization (auto-created)

| Field | Value |
|-------|-------|
| `name` | "User {username}" or "User {phone}" |
| `slug` | "{username}-{timestamp}{random}" |
| `credit_balance` | 1.00 USD |

### 3.3 Entity ID Strategy

```
entityId = user.id (UUID from database)

NOT: SHA256("eliza-app:telegram:user:{telegramId}")
NOT: SHA256("eliza-app:imessage:user:{phone}")

This ensures:
- Same user on Telegram and iMessage → same entityId
- Memory operations (session_summaries, long_term_memories) unified
- Cross-platform conversation continuity
```

### 3.4 Room ID Strategy

```
Telegram: SHA256("eliza-app:telegram:room:{agentId}:{telegramUserId}")
iMessage: SHA256("eliza-app:imessage:room:{agentId}:{phoneNumber}")

Rooms are platform-specific:
- Telegram conversation in one room
- iMessage conversation in another room
- But same entityId links them for memory
```

---

## 4. API Endpoints

### 4.1 Telegram OAuth

```
POST /api/eliza-app/auth/telegram

Request:
{
  "id": 123456789,
  "first_name": "John",
  "username": "johndoe",
  "photo_url": "https://...",
  "auth_date": 1706886400,
  "hash": "abc123...",
  "phone_number": "+15551234567"  // REQUIRED
}

Response (200):
{
  "user": { id, telegram_id, phone_number, name, organization_id },
  "session": { token, expires_at },
  "is_new_user": true
}

Response (400):
{ "error": "Phone number is required", "code": "PHONE_REQUIRED" }

Response (401):
{ "error": "Invalid authentication data", "code": "INVALID_AUTH" }

Response (409):
{ "error": "Phone number already linked to another account", "code": "PHONE_CONFLICT" }
```

### 4.2 Telegram Webhook

```
POST /api/eliza-app/webhook/telegram
X-Telegram-Bot-Api-Secret-Token: {secret}

Telegram Update payload...

Logic:
1. Verify webhook secret
2. Extract telegram_id from message.from.id
3. Lookup user by telegram_id
4. If NOT found → Send: "Please connect at eliza.app/get-started"
5. If found → Process message, respond
```

### 4.3 Blooio (iMessage) Webhook

```
POST /api/eliza-app/webhook/blooio
X-Blooio-Signature: {signature}

Blooio webhook payload...

Logic:
1. Verify webhook signature
2. Extract sender identifier (phone or Apple ID email)
3. If email → Auto-provision by email (findOrCreateByEmail)
4. If phone → Normalize to E.164, auto-provision (findOrCreateByPhone)
5. Process message, respond
```

### 4.4 User Info

```
GET /api/eliza-app/user/me
Authorization: Bearer {token}

Response:
{
  "user": { id, telegram_id, phone_number, name },
  "organization": { id, name, credit_balance }
}
```

---

## 5. Frontend Changes Required

**Location:** `/Users/benjaminberta/0xbbjoker/elizaOS/cloud-new/eliza-app/src/app/get-started/page.tsx`

### 5.1 Remove OTP Flow

**Remove these types/steps:**
```typescript
// Remove from OnboardingStep type:
| "OTP_VERIFY"

// Keep these:
| "SELECT_METHOD"
| "PHONE_INPUT"      // Rename purpose: now for Telegram + phone, not iMessage OTP
| "TELEGRAM_OAUTH"
| "IMESSAGE_SUCCESS" // Rename to "SUCCESS" - shows both options
```

**Remove state:**
```typescript
// DELETE these:
const [otpValue, setOtpValue] = useState("");
const [isSendingOTP, setIsSendingOTP] = useState(false);
const [isVerifyingOTP, setIsVerifyingOTP] = useState(false);
const [otpError, setOtpError] = useState<string | null>(null);
const otpInputRef = useRef<HTMLInputElement>(null);
```

**Remove handlers:**
```typescript
// DELETE these functions:
handlePhoneSubmit()     // Was for sending OTP
handleVerifyOTP()       // Was for verifying OTP
handleOTPChange()       // Was for OTP input
handleResendOTP()       // Was for resending OTP
```

**Remove from auth-context.tsx:**
```typescript
// DELETE these from useAuth hook:
sendPhoneOTP
verifyPhoneOTP
```

### 5.2 New Flow Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    GET STARTED PAGE FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SELECT_METHOD                                                  │
│  ├── "Telegram" button → TELEGRAM_OAUTH                         │
│  └── "iMessage" button → IMESSAGE_DIRECT (show number + link)   │
│                                                                 │
│  TELEGRAM_OAUTH                                                 │
│  └── Telegram Login Widget → on success → PHONE_INPUT           │
│                                                                 │
│  PHONE_INPUT (after Telegram OAuth)                             │
│  └── Country + phone input → Submit                             │
│  └── Calls POST /api/eliza-app/auth/telegram with:              │
│      { ...telegramData, phone_number }                          │
│  └── On success → SUCCESS                                       │
│                                                                 │
│  IMESSAGE_DIRECT (no signup needed)                             │
│  └── Shows Eliza's phone number                                 │
│  └── "Open iMessage" button with deep link:                     │
│      sms:+14245074963&body=Hey Eliza, what can you do?          │
│  └── Copy number button                                         │
│  └── "I have Telegram too" link → TELEGRAM_OAUTH                │
│                                                                 │
│  SUCCESS (after Telegram + phone)                               │
│  └── Shows both options:                                        │
│      - Telegram bot link                                        │
│      - iMessage number with deep link                           │
│  └── "Continue to dashboard" → /connected                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 iMessage Deep Link with Pre-populated Message

```typescript
const ELIZA_PHONE_NUMBER = "+14245074963";
const IMESSAGE_GREETING = "Hey Eliza, what can you do?";

// For the "Open iMessage" button:
const handleOpenMessages = () => {
  const encodedBody = encodeURIComponent(IMESSAGE_GREETING);
  window.location.href = `sms:${ELIZA_PHONE_NUMBER}&body=${encodedBody}`;
};
```

### 5.4 Telegram OAuth → Phone Input Flow

**Store Telegram auth data temporarily, then collect phone:**
```typescript
const [pendingTelegramData, setPendingTelegramData] = useState<TelegramAuthData | null>(null);

const handleTelegramAuth = useCallback(async (authData: TelegramAuthData) => {
  // Don't submit yet - need phone number first
  setPendingTelegramData(authData);
  setStep("PHONE_INPUT");
}, []);

const handlePhoneSubmitForTelegram = useCallback(async () => {
  if (!pendingTelegramData || !hasPhoneNumber) return;

  const fullPhone = getFullPhoneNumber();
  setIsTelegramLoading(true);

  try {
    // Call backend with BOTH telegram data AND phone
    const response = await elizacloudFetch('/api/eliza-app/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({
        ...pendingTelegramData,
        phone_number: fullPhone,
      }),
    });

    if (response.success) {
      localStorage.setItem('eliza_app_session', response.session.token);
      setStep("SUCCESS");
    } else {
      setError(response.error || "Failed to complete signup");
    }
  } catch {
    setError("Failed to complete signup. Please try again.");
  } finally {
    setIsTelegramLoading(false);
  }
}, [pendingTelegramData, hasPhoneNumber, getFullPhoneNumber]);
```

### 5.5 Updated UI Components

**SELECT_METHOD step - Update iMessage button:**
```tsx
{/* iMessage - Direct, no signup */}
<button
  onClick={() => setStep("IMESSAGE_DIRECT")}
  className="w-full h-[72px] bg-white/5 hover:bg-white/10 rounded-xl..."
>
  <MessageCircle className="size-6 text-[#34C759]" />
  <div>
    <p className="text-white font-medium">iMessage</p>
    <p className="text-sm text-white/50">Just text to start chatting</p>
  </div>
</button>
```

**New IMESSAGE_DIRECT step:**
```tsx
{step === "IMESSAGE_DIRECT" && (
  <>
    <div className="w-16 h-16 rounded-full bg-[#34C759]/20 flex items-center justify-center mb-6">
      <MessageCircle className="size-8 text-[#34C759]" />
    </div>

    <h1 className="text-xl font-medium text-white text-center mb-2">
      Ready to chat!
    </h1>
    <p className="text-sm text-white/60 text-center mb-6">
      Just text this number to start talking with Eliza
    </p>

    {/* Phone number display */}
    <div className="w-full p-4 bg-white/5 border border-white/10 rounded-xl mb-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-lg font-mono text-white">+1 (424) 507-4963</span>
        <Button variant="ghost" size="sm" onClick={handleCopyNumber}>
          {copied ? <Check className="size-4 text-green-400" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>

    {/* Open iMessage with pre-populated message */}
    <Button
      onClick={handleOpenMessages}
      className="w-full h-[52px] rounded-xl bg-[#34C759] hover:bg-[#2DB84D] text-white font-medium gap-2"
    >
      <MessageCircle className="size-5" />
      Open iMessage
    </Button>

    {/* Option to also connect Telegram */}
    <button
      onClick={() => setStep("TELEGRAM_OAUTH")}
      className="w-full mt-4 text-sm text-white/60 hover:text-white/80"
    >
      I also want to use Telegram
    </button>
  </>
)}
```

**Updated PHONE_INPUT step (now for Telegram flow only):**
```tsx
{step === "PHONE_INPUT" && (
  <>
    <div className="w-12 h-12 rounded-xl bg-[#229ED9]/20 flex items-center justify-center mb-6">
      <TelegramIcon className="size-6 text-[#229ED9]" />
    </div>

    <h1 className="text-xl font-medium text-white text-center mb-2">
      Almost there!
    </h1>
    <p className="text-sm text-white/60 text-center mb-8">
      Enter your phone number to enable iMessage + prevent bots
    </p>

    {/* Country + phone input (same as before) */}
    ...

    <Button onClick={handlePhoneSubmitForTelegram} disabled={!hasPhoneNumber || isTelegramLoading}>
      {isTelegramLoading ? "Setting up..." : "Complete Setup"}
    </Button>
  </>
)}
```

### 5.6 Auth Context Cleanup

**File:** `eliza-app/src/lib/context/auth-context.tsx`

Remove OTP-related methods:
```typescript
// DELETE from AuthContextValue interface:
sendPhoneOTP: (phone: string) => Promise<{ success: boolean; error?: string }>;
verifyPhoneOTP: (phone: string, otp: string) => Promise<{ success: boolean; error?: string; elizaPhoneNumber?: string }>;

// DELETE the implementations of these functions
```

---

## 6. Backend Changes Required

### 6.1 Blooio Webhook - Enable Auto-Provision

**File:** `app/api/eliza-app/webhook/blooio/route.ts`

**Current (OAuth enforcement - lines 109-117):**
```typescript
// Look up user by phone number - they must have completed Telegram OAuth + phone registration
const userWithOrg = await elizaAppUserService.getByPhoneNumber(phoneNumber);
if (!userWithOrg?.organization) {
  await sendBlooioMessage(
    phoneNumber,
    "👋 Welcome! To chat with Eliza via iMessage, please sign up first:\n\nhttps://eliza.app/get-started\n\nEnter your phone number and connect with Telegram to get started."
  );
  return true; // Mark as processed - don't retry
}
const { organization } = userWithOrg;
```

**Change to (auto-provision):**
```typescript
// Auto-provision user from phone number (carrier-verified via iMessage)
const { user: userWithOrg, organization } = await elizaAppUserService.findOrCreateByPhone(phoneNumber);
```

**Why this works:**
- `findOrCreateByPhone` already exists in user-service.ts (line 247)
- Creates user + org with $1 credits if not exists
- Returns existing user if phone already registered
- Handles cross-platform: if user did Telegram first with same phone, returns that user

### 6.2 Telegram Webhook - Keep OAuth Enforcement

**File:** `app/api/eliza-app/webhook/telegram/route.ts`

**Keep current behavior (no changes needed):**
```typescript
const userWithOrg = await elizaAppUserService.getByTelegramId(telegramUserId);
if (!userWithOrg || !userWithOrg.organization) {
  await sendTelegramMessage(message.chat.id,
    "👋 Welcome! To chat with Eliza, please connect your Telegram first:\n\nhttps://eliza.app/get-started"
  );
  return true;
}
```

### 6.3 User Service - Cross-Platform Linking Enhancement

**File:** `lib/services/eliza-app/user-service.ts`

**Current `findOrCreateByTelegramWithPhone` (line 180) needs update:**

When a Telegram user provides a phone that already exists (iMessage user created first), we should link Telegram to that existing user instead of failing.

**Current behavior:** Checks for conflicts, creates new user if telegram doesn't exist
**Needed behavior:** If phone exists without telegram, link telegram to that user

```typescript
// In findOrCreateByTelegramWithPhone, after checking existingUser by telegram_id:
// Check if phone user exists (iMessage user created first)
const existingPhoneUser = await usersRepository.findByPhoneNumberWithOrganization(normalizedPhone);
if (existingPhoneUser && existingPhoneUser.organization) {
  // Link Telegram to existing phone user
  if (!existingPhoneUser.telegram_id) {
    await usersRepository.update(existingPhoneUser.id, {
      telegram_id: telegramId,
      telegram_username: telegramData.username,
      telegram_first_name: telegramData.first_name,
      telegram_photo_url: telegramData.photo_url,
      updated_at: new Date(),
    });

    // Refetch to get updated data
    const updatedUser = await usersRepository.findByPhoneNumberWithOrganization(normalizedPhone);
    return {
      user: updatedUser!,
      organization: updatedUser!.organization!,
      isNew: false,
    };
  }
}
```

### 6.4 Delete OTP Endpoints

**Already deleted (verify removed):**
- `app/api/eliza-app/auth/phone/send-otp/route.ts`
- `app/api/eliza-app/auth/phone/verify-otp/route.ts`
- `lib/services/eliza-app/otp-service.ts`

---

## 7. Implementation Tasks

### Phase 1: Backend (eliza-cloud-v2)

| # | File | Change |
|---|------|--------|
| 1.1 | `app/api/eliza-app/webhook/blooio/route.ts` | Line 109-117: Replace OAuth enforcement with `findOrCreateByPhone` |
| 1.2 | `lib/services/eliza-app/user-service.ts` | Line 180: Update `findOrCreateByTelegramWithPhone` to link Telegram to existing phone user |
| 1.3 | Verify deleted | `app/api/eliza-app/auth/phone/send-otp/route.ts` |
| 1.4 | Verify deleted | `app/api/eliza-app/auth/phone/verify-otp/route.ts` |
| 1.5 | Verify deleted | `lib/services/eliza-app/otp-service.ts` |
| 1.6 | Delete old tests | `tests/unit/eliza-app/otp-service.test.ts` |
| 1.7 | Delete old tests | `tests/unit/eliza-app/phone-auth-routes.test.ts` |

### Phase 2: Frontend (eliza-app)

| # | File | Change |
|---|------|--------|
| 2.1 | `src/app/get-started/page.tsx` | Remove `OTP_VERIFY` step and all OTP state/handlers |
| 2.2 | `src/app/get-started/page.tsx` | Add `IMESSAGE_DIRECT` step with phone number + deep link |
| 2.3 | `src/app/get-started/page.tsx` | Update `PHONE_INPUT` step to come AFTER Telegram OAuth |
| 2.4 | `src/app/get-started/page.tsx` | Store pending Telegram data, submit with phone |
| 2.5 | `src/app/get-started/page.tsx` | Add iMessage deep link: `sms:+14245074963&body=Hey Eliza, what can you do?` |
| 2.6 | `src/lib/context/auth-context.tsx` | Remove `sendPhoneOTP` and `verifyPhoneOTP` methods |

### Phase 3: Cleanup

| # | Action |
|---|--------|
| 3.1 | Delete `docs/PLAN-oauth-enforcement-unified-entityid.md` |
| 3.2 | Delete `tests/unit/eliza-app/otp-service.test.ts` (if exists) |
| 3.3 | Delete `tests/unit/eliza-app/phone-auth-routes.test.ts` (if exists) |
| 3.4 | Update `tests/unit/eliza-app/oauth-enforcement.test.ts` - remove references to OAuth enforcement on Blooio |

### Phase 4: Manual Testing (by user)

| Test | Expected |
|------|----------|
| iMessage: New user texts +14245074963 | Auto-provisioned, gets response, $1 credits |
| iMessage: Email sender (Apple ID only) | Rejection message |
| Telegram: DM bot without signup | Redirect message to eliza.app/get-started |
| Telegram: Complete OAuth + phone | Can DM bot, gets responses |
| Cross-platform: iMessage first → Telegram OAuth with same phone | Accounts linked, shared memory |
| Cross-platform: Telegram first → iMessage with same phone | Accounts linked, shared memory |
| Frontend: Click iMessage → shows number + "Open iMessage" | Opens Messages app with pre-filled message |
| Frontend: Telegram OAuth → phone input → submit | Creates account, redirects to success |

---

## 8. Security Considerations

| Concern | Mitigation |
|---------|------------|
| Telegram bot abuse | Phone number required (adds friction) |
| iMessage spoofing | Not possible - carrier verified |
| Apple ID email abuse | Rejected - not carrier verified |
| Rate limiting | Applied to all endpoints |
| Replay attacks | Telegram auth_date checked (24h window) |
| Webhook tampering | Signature verification (HMAC) |

---

## 9. Edge Cases

### 9.1 User changes phone number
- Old phone becomes available for new users
- Telegram account keeps old phone in database
- Manual intervention needed to update

### 9.2 Phone number already linked (conflict)
- Telegram OAuth with phone X, but X is already linked to another Telegram
- Return 409 Conflict error
- User must use different phone or contact support

### 9.3 User has both Telegram accounts
- Not supported - one phone can only link to one account
- First-come-first-served

### 9.4 Credits exhausted
- User can still message but agent may limit responses
- Handled by credit system (outside this spec)

---

## 10. Summary

| Channel | Registration | Phone Required | Auto-Provision | Cross-Platform |
|---------|--------------|----------------|----------------|----------------|
| iMessage | None | Inherent (sender) | Yes | Via phone match |
| Telegram | OAuth | Yes (input) | No (must register) | Via phone match |

**Key Changes from Current State:**
1. iMessage: Remove OAuth enforcement → auto-provision
2. Frontend: Remove OTP flow → phone input only after Telegram OAuth
3. Keep: Unified entityId = user.id
4. Keep: Telegram OAuth enforcement
