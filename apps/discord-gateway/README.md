# Discord Gateway Service

Multi-tenant Discord gateway for Eliza Cloud. Maintains persistent WebSocket connections to Discord and forwards events to the cloud backend.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Eliza Cloud                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │ Organization │    │ Organization │    │ Organization │          │
│  │   Agent 1    │    │   Agent 2    │    │   Agent 3    │          │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘          │
│         │                   │                   │                   │
│         └───────────────────┼───────────────────┘                   │
│                             │                                       │
│                    ┌────────▼────────┐                              │
│                    │  Event Router   │                              │
│                    │  (A2A/MCP/WH)   │                              │
│                    └────────▲────────┘                              │
│                             │                                       │
│              ┌──────────────┼──────────────┐                        │
│              │              │              │                        │
│     ┌────────┴────────┐ ┌───┴────┐ ┌──────┴───────┐                │
│     │ Gateway Pod 1   │ │ Pod 2  │ │   Pod N      │                │
│     │ - Bot A         │ │ - Bot C│ │ - Bot E      │                │
│     │ - Bot B         │ │ - Bot D│ │ - Bot F      │                │
│     └────────┬────────┘ └───┬────┘ └──────┬───────┘                │
│              │              │              │                        │
└──────────────┼──────────────┼──────────────┼────────────────────────┘
               │              │              │
               ▼              ▼              ▼
         ┌─────────────────────────────────────────┐
         │              Discord API                 │
         │         (WebSocket Gateway)              │
         └─────────────────────────────────────────┘
```

## Features

- **Multi-tenant**: Single pod manages multiple bot connections
- **Auto-scaling**: HPA scales based on CPU/memory
- **Resilient**: Redis-backed session state survives restarts
- **Observable**: Prometheus metrics, health endpoints
- **Event routing**: A2A, MCP, webhook, container targets

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ELIZA_CLOUD_URL` | Yes | Backend URL (e.g., `https://elizacloud.ai`) |
| `INTERNAL_API_KEY` | Yes | Internal API key for authentication |
| `REDIS_URL` | No | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | No | Upstash Redis token |
| `POD_NAME` | No | Pod identifier (auto-set by K8s) |
| `PORT` | No | HTTP port (default: 3000) |

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (K8s liveness) |
| `/ready` | GET | Readiness check (K8s readiness) |
| `/metrics` | GET | Prometheus metrics |
| `/status` | GET | Detailed status with connection info |

## Development

```bash
# Install dependencies
bun install

# Run development server
bun run dev

# Type check
bun run typecheck

# Run tests
bun test

# Build
bun run build
```

## Docker

```bash
# Build image
docker build -t discord-gateway .

# Run locally
docker run -p 3000:3000 \
  -e ELIZA_CLOUD_URL=https://elizacloud.ai \
  -e INTERNAL_API_KEY=your-key \
  discord-gateway
```

## Kubernetes Deployment

See `/packages/deployment/kubernetes/helm/discord-gateway/` for Helm charts.

```bash
# Deploy to testnet
helm upgrade --install discord-gateway \
  ./packages/deployment/kubernetes/helm/discord-gateway \
  -f ./packages/deployment/kubernetes/helm/discord-gateway/values-testnet.yaml
```

## How It Works

1. **Pod Registration**: Gateway pods register with the backend on startup
2. **Bot Assignment**: Backend assigns bots to pods based on capacity
3. **Connection**: Pods connect to Discord via WebSocket
4. **Event Forwarding**: Events are forwarded to `/api/internal/discord/events`
5. **Routing**: Event router dispatches to agents via A2A/MCP/webhook
6. **Heartbeat**: Pods send periodic heartbeats to maintain assignment
7. **Graceful Shutdown**: Session state saved to Redis on shutdown
