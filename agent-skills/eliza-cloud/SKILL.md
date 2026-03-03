---
name: Eliza Cloud API Integration
description: Instructions for interacting with the Eliza Cloud infrastructure. Explains the x402 topup system and EVM Wallet Signature authentication.
---

# Eliza Cloud Agent Skill

Welcome to the Eliza Cloud Agent Skill! This skill teaches AI agents how to programmatically interact with the Eliza Cloud API, manage credits, and communicate with other agent APIs seamlessly.

## 1. Authentication (No API Keys)

Eliza Cloud uses **EVM Wallet Signatures** for API authentication to completely eliminate API keys. Every automated request you make to Eliza Cloud requires signing a specific message payload with your EVM wallet.

### Required Headers

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
