# CLI Login Setup Guide

This guide covers the setup and implementation of the CLI login feature in ElizaOS Cloud.

## Overview

The CLI login feature allows ElizaOS CLI users to authenticate with the cloud platform and receive an API key for accessing cloud-hosted services.

## Architecture

### Components

1. **Database Schema** (`db/schemas/cli-auth-sessions.ts`)
   - Stores temporary authentication sessions
   - Links sessions to users and generated API keys
   - Includes security features like expiration and one-time key retrieval

2. **Repository** (`db/repositories/cli-auth-sessions.ts`)
   - CRUD operations for CLI auth sessions
   - Handles session lifecycle (pending → authenticated → expired)

3. **Service** (`lib/services/cli-auth-sessions.ts`)
   - Business logic for session management
   - API key generation and association
   - Security: clears plain keys after retrieval

4. **API Routes**
   - `POST /api/auth/cli-session` - Create new session
   - `GET /api/auth/cli-session/[sessionId]` - Poll for status and retrieve key
   - `POST /api/auth/cli-session/[sessionId]/complete` - Complete authentication

5. **Web Page** (`app/auth/cli-login/page.tsx`)
   - User-friendly interface for CLI authentication
   - Integrates with Privy for user authentication
   - Shows progress and completion status

6. **Cron Job** (`app/api/cron/cleanup-cli-sessions/route.ts`)
   - Cleans up expired sessions periodically
   - Prevents database bloat

## Database Migration

Run the migration to create the `cli_auth_sessions` table:

```bash
cd eliza-cloud-v2
# If using Drizzle push:
bun db:push

# Or apply the SQL migration directly:
psql $DATABASE_URL < db/migrations/0006_add_cli_auth_sessions.sql
```

The table schema:

```sql
CREATE TABLE cli_auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text UNIQUE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  api_key_id uuid,
  api_key_plain text,  -- Temporarily stores key for CLI retrieval
  status text DEFAULT 'pending' NOT NULL,
  expires_at timestamp NOT NULL,
  authenticated_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);
```

## Authentication Flow

### 1. Session Creation (CLI)

```typescript
// CLI generates session ID
const sessionId = generateSessionId(); // Cryptographically secure random

// CLI opens browser
const authUrl = `${cloudUrl}/auth/cli-login?session=${sessionId}`;
openBrowser(authUrl);
```

### 2. User Authentication (Browser)

```typescript
// User visits /auth/cli-login?session=<id>
// Page checks if user is authenticated via Privy
if (!authenticated) {
  // Show login button
  privy.login();
} else {
  // Complete authentication
  fetch(`/api/auth/cli-session/${sessionId}/complete`, {
    method: 'POST'
  });
}
```

### 3. API Key Generation (Cloud)

```typescript
// Server-side completion handler
async function completeAuthentication(sessionId, userId, orgId) {
  // Generate new API key
  const { apiKey, plainKey } = await apiKeysService.create({
    name: `CLI Login - ${new Date().toISOString()}`,
    organization_id: orgId,
    user_id: userId,
    // ... other params
  });

  // Store plain key temporarily in session
  await repository.markAuthenticated(
    sessionId,
    userId,
    apiKey.id,
    plainKey
  );

  return plainKey;
}
```

### 4. Key Retrieval (CLI)

```typescript
// CLI polls for completion
const response = await fetch(`${cloudUrl}/api/auth/cli-session/${sessionId}`);
const data = await response.json();

if (data.status === 'authenticated' && data.apiKey) {
  // Write to .env file
  await writeEnvFile('.env', {
    ELIZA_CLOUD_API_KEY: data.apiKey
  });
  
  // Plain key is cleared from session after retrieval (one-time use)
}
```

## Security Considerations

### Session Security

1. **Expiration**: Sessions expire after 10 minutes
2. **One-Time Retrieval**: API key can only be retrieved once
3. **Secure Randomness**: Session IDs use `crypto.randomBytes()`
4. **No Replay**: Once key is retrieved, it's cleared from the session

### API Key Security

1. **Hashing**: Keys are hashed with SHA-256 before storage
2. **Prefix**: Only key prefix is shown in UI for identification
3. **No Expiry**: CLI keys don't expire by default (can be revoked manually)
4. **Rate Limiting**: Keys have configurable rate limits

### CORS and Headers

The API endpoints are designed to work cross-origin:

```typescript
headers: {
  'Content-Type': 'application/json',
  // No Authorization needed for session creation/polling
  // Authentication is done via sessionId
}
```

## Monitoring and Maintenance

### Cron Job Setup

Add to your cron scheduler (e.g., Vercel Cron):

```json
{
  "crons": [{
    "path": "/api/cron/cleanup-cli-sessions",
    "schedule": "0 * * * *"
  }]
}
```

Or manually trigger:

```bash
curl -X GET https://your-domain.com/api/cron/cleanup-cli-sessions \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Metrics to Monitor

- Number of active CLI sessions
- Session completion rate
- Failed authentication attempts
- API key generation errors
- Expired sessions cleanup frequency

## Testing

### Unit Tests

```bash
# Test CLI utilities
cd eliza/packages/cli
bun test src/commands/login

# Test cloud services
cd eliza-cloud-v2
bun test lib/services/cli-auth-sessions.test.ts
```

### Integration Testing

```bash
# 1. Start cloud locally
cd eliza-cloud-v2
bun dev

# 2. Test CLI login
cd eliza/packages/cli
bun dist/index.js login --cloud-url http://localhost:3000
```

## Troubleshooting

### Common Issues

**Issue**: "Session not found or expired"
- **Cause**: Session expired after 10 minutes
- **Solution**: Run `elizaos login` again

**Issue**: "API key already retrieved"
- **Cause**: Key was already retrieved from session
- **Solution**: Check your .env file for `ELIZA_CLOUD_API_KEY`

**Issue**: "Failed to open browser"
- **Cause**: No default browser configured
- **Solution**: Copy the displayed URL and open manually

**Issue**: "Failed to connect to ElizaOS Cloud"
- **Cause**: Cloud URL is incorrect or server is down
- **Solution**: Verify `--cloud-url` or `$ELIZA_CLOUD_URL` is correct

### Debug Mode

Enable debug logging:

```bash
DEBUG=elizaos:* elizaos login
```

## API Reference

### POST /api/auth/cli-session

Create a new CLI authentication session.

**Request:**
```json
{
  "sessionId": "64-character-hex-string"
}
```

**Response:**
```json
{
  "sessionId": "...",
  "status": "pending",
  "expiresAt": "2025-10-27T12:00:00Z"
}
```

### GET /api/auth/cli-session/[sessionId]

Get session status and retrieve API key (if authenticated).

**Response (Pending):**
```json
{
  "status": "pending"
}
```

**Response (Authenticated):**
```json
{
  "status": "authenticated",
  "apiKey": "eliza_abc123...",
  "keyPrefix": "eliza_abc",
  "expiresAt": null
}
```

**Response (Expired):**
```json
{
  "status": "expired"
}
```

### POST /api/auth/cli-session/[sessionId]/complete

Complete authentication for a session (requires Privy authentication).

**Headers:**
```
Cookie: privy-token=...
```

**Response:**
```json
{
  "success": true,
  "apiKey": "eliza_abc123...",
  "keyPrefix": "eliza_abc",
  "expiresAt": null
}
```

## Future Enhancements

Potential improvements to consider:

1. **Device Management**: Track which devices/machines have API keys
2. **Key Rotation**: Automatic or manual key rotation with grace period
3. **Scoped Permissions**: Different permission levels for different keys
4. **Usage Analytics**: Track CLI usage per user/organization
5. **2FA Support**: Optional two-factor authentication for sensitive operations
6. **Key Naming**: Allow users to name their CLI sessions

## Related Documentation

- [ElizaOS CLI Documentation](../../../README.md)
- [API Keys Management](./API_KEYS.md)
- [Privy Integration](./PRIVY_INTEGRATION.md)

