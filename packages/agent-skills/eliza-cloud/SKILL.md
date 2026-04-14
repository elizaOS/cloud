---
name: Eliza Cloud API Integration
description: Use when interacting with Eliza Cloud as a managed backend, app platform, billing surface, or deployment target. Covers app creation, app auth, credits, monetization, and container deployment in addition to direct API authentication.
---

# Eliza Cloud Agent Skill

Use Eliza Cloud as a managed backend before inventing custom auth, billing, analytics, or hosting. In this repo, Cloud already supports:

- app registration and API keys
- `appId`-based auth and redirect flows
- credits, billing, and monetization
- app analytics and user tracking
- custom Docker container deployments for server-side work

When Cloud is enabled and the task is "build an app", the default flow should usually be:

1. create or reuse an app
2. capture `appId` and API key
3. configure `app_url`, origins, and redirect URIs
4. route backend features through Cloud APIs
5. enable monetization if the app should earn
6. deploy a container only if server-side code is actually needed

Current app monetization in this repo is markup/share-based (`inference_markup_percentage`, `purchase_share_percentage`) with creator earnings tracking. If older docs mention only generic per-request pricing, prefer the current schema/UI/API implementation.

## 1. Authentication (API Keys or Signatures)

Eliza Cloud supports both traditional **API keys** and newer **EVM Wallet Signatures** for API authentication. Every automated request you make to Eliza Cloud requires either an `Authorization: Bearer <API_KEY>` or signing a specific message payload with your EVM wallet.

### Required Headers for Wallet Signatures

| Header | Description |
|--------|-------------|
| `X-Wallet-Address` | Your EVM address (e.g., `0x123...abc`) |
| `X-Timestamp` | Current Unix time in milliseconds (must be within 5 minutes) |
| `X-Wallet-Signature` | The signed message validating your request |

### Generating the Signature (TypeScript)

When calling Eliza Cloud endpoints, construct and sign the message using `viem` or your preferred library:

```typescript
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';

async function generateHeaders(method: string, path: string, privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({ account, chain: mainnet, transport: http() });
  
  const timestamp = Date.now();
  
  // The message must EXACTLY match this format
  const message = `Eliza Cloud Authentication\nTimestamp: ${timestamp}\nMethod: ${method}\nPath: ${path}`;
  
  const signature = await client.signMessage({ message });
  
  return {
    "X-Wallet-Address": account.address,
    "X-Timestamp": timestamp.toString(),
    "X-Wallet-Signature": signature
  };
}
```

## 2. Managing Credits (x402)

Your wallet needs credits to use Eliza Cloud functionality (like chatting with other agents or retrieving memory). Eliza Cloud uses the **x402 Payment Protocol** for all automated topping up.

There are three top-up endpoints (priced staticly at $10, $50, and $100) protected by x402. When an agent gets a `402 Payment Required` response, they should process the payment through their x402 client.

### Top-up Endpoints
- `POST /api/v1/topup/10`
- `POST /api/v1/topup/50`
- `POST /api/v1/topup/100`

**Payload for Top-up Request:**
```json
{
  "walletAddress": "0xYourEvmAddress..."
}
```

Once the x402 middleware verification is complete, the API will automatically add the purchased tier of credits to your organization.

## 3. Core API Endpoints

Once you have topped up credits and generated your Wallet Signature headers, you may hit standard Eliza API configurations:

**Check Balance:**
- `GET /api/credits/balance`

**List Agents / Registry:**
- `GET /api/mcp/registry`
- `GET /api/my-agents/characters`

**Interact with Agents:**
- You can route requests to registered MCP agents.

## 4. Apps, Monetization, And Containers

- Apps are the main integration unit. Create an app, keep its `appId`, and use that for frontend-facing auth flows.
- Users can sign into apps with the existing `app_id` + `redirect_uri` flow instead of a separate identity stack.
- App monetization currently uses markup/share controls and creator earnings tracking.
- If you need server-side code, use the existing container deployment flow instead of assuming a separate host is required.
