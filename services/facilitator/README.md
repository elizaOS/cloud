# x402 Facilitator Service

The x402 facilitator is a settlement micro-service that verifies [ERC-2612](https://eips.ethereum.org/EIPS/eip-2612) permit signatures and settles USDC payments on supported EVM networks. It acts as the trusted intermediary in the [x402 HTTP payment protocol](https://x402.org).

## Architecture

```
Client (agent)                    Resource Server                  Facilitator
  │                                      │                             │
  ├─── GET /resource ──────────────────► │                             │
  │◄── 402 + PAYMENT-REQUIRED ────────── │                             │
  │                                      │                             │
  │  (sign ERC-2612 permit)              │                             │
  │                                      │                             │
  ├─── GET /resource + X-PAYMENT ──────► │                             │
  │                                      ├── POST /verify ───────────► │
  │                                      │◄── { valid: true } ──────── │
  │◄── 200 + content ────────────────── │                             │
  │                                      │                             │
  │                                      │  (async settlement)         │
  │                                      │                     settle on-chain
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- Docker (optional, for containerized deployment)
- An EVM wallet funded with ETH for gas on target networks

### Local Development

```bash
# 1. Copy environment configuration
cp .env.example .env

# 2. Set your facilitator private key in .env
#    FACILITATOR_PRIVATE_KEY=0x...

# 3. Start with Docker Compose
docker compose up --build
```

The facilitator will be available at `http://localhost:8090`.

### Verify it's running

```bash
curl http://localhost:8090/supported
```

Expected response:

```json
{
  "networks": ["base-sepolia", "base"],
  "assets": ["USDC"],
  "version": "1.0.0"
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/supported` | Returns supported networks, assets, and version |
| `POST` | `/verify` | Verifies a signed payment header and returns validity |
| `POST` | `/settle` | Settles a verified payment on-chain (async) |
| `GET` | `/health` | Health check endpoint |

### POST /verify

Verifies an x402 payment header (ERC-2612 permit signature).

**Request:**

```json
{
  "payment": "<base64-encoded payment header>",
  "network": "base-sepolia",
  "resource": "https://api.example.com/data"
}
```

**Response (valid):**

```json
{
  "valid": true,
  "payer": "0x...",
  "amount": "1000",
  "asset": "USDC",
  "network": "base-sepolia"
}
```

**Response (invalid):**

```json
{
  "valid": false,
  "error": "Invalid signature"
}
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FACILITATOR_PRIVATE_KEY` | Yes | — | Hex-encoded private key for the facilitator signer |
| `PORT` | No | `8090` | HTTP server port |
| `EVM_NETWORKS` | No | `base-sepolia,base` | Comma-separated list of supported networks |
| `CDP_API_KEY` | No | — | Coinbase Developer Platform API key |
| `CDP_API_SECRET` | No | — | Coinbase Developer Platform API secret |
| `LOG_LEVEL` | No | `info` | Log verbosity (trace/debug/info/warn/error/fatal) |

## Deployment

### Docker

```bash
# Build from workspace root
docker build \
  -f eliza-cloud-v2/services/facilitator/Dockerfile \
  -t x402-facilitator \
  .

# Run
docker run -d \
  --name facilitator \
  -p 8090:8090 \
  -e FACILITATOR_PRIVATE_KEY=0x... \
  -e EVM_NETWORKS=base-sepolia,base \
  x402-facilitator
```

### Eliza Cloud (Production)

The facilitator runs as a managed service inside Eliza Cloud infrastructure. Configuration is injected via environment variables from the secrets manager.

Key operational notes:

- The facilitator wallet must be funded with ETH for gas on each target network.
- Monitor the `/health` endpoint for availability.
- Settlement is asynchronous — the facilitator queues on-chain transactions after verification.
- Resource limits are set to 512MB memory / 0.5 CPU in the compose file; adjust for production load.

### Security Considerations

- **Private key**: The `FACILITATOR_PRIVATE_KEY` is the most sensitive credential. Use a secrets manager (AWS Secrets Manager, Vault, etc.) in production. Never commit it to version control.
- **Network isolation**: The facilitator should only be accessible from the resource servers that need payment verification. Use network policies or security groups to restrict access.
- **Rate limiting**: Consider adding a reverse proxy (nginx, Caddy) with rate limiting in front of the facilitator to prevent abuse.
- **Monitoring**: Set up alerts on the health check endpoint and on-chain settlement failures.

## Development

### Running Tests

```bash
cd facilitator
bun test
```

### Project Structure

```
facilitator/
├── src/
│   ├── index.ts          # HTTP server entry point
│   ├── verifier.ts       # Payment verification logic
│   ├── settler.ts        # On-chain settlement
│   ├── networks.ts       # Network configuration (RPC URLs, chain IDs)
│   └── types.ts          # Shared type definitions
├── package.json
├── tsconfig.json
└── dist/                 # Build output
```
