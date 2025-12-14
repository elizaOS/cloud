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
| `MAX_BOTS_PER_POD` | No | Max bots per pod (default: 100) |
| `MAX_BOTS_PER_POLL` | No | Max bots assigned per poll (default: 50) |
| `FAILOVER_CHECK_INTERVAL_MS` | No | Failover check interval (default: 60000) |
| `DEAD_POD_THRESHOLD_MS` | No | Dead pod threshold (default: 120000) |

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

# Run integration tests (requires Discord credentials)
ENABLE_DISCORD_INTEGRATION=true \
DISCORD_TEST_TOKEN=your-bot-token \
DISCORD_TEST_CHANNEL_ID=your-channel-id \
bun test integration-real

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
8. **Automatic Failover**: Dead pods detected and connections reassigned

## Scaling

### Capacity Planning

- Each pod handles ~100 bot connections
- Each bot can be in up to 2500 guilds (Discord limit before sharding)
- For 10,000 bots: 100+ pods recommended

### Prerequisites

- Kubernetes 1.24+
- kube-prometheus-stack (for alerts/monitoring)
- Secrets configured

### Kubernetes Configuration

```bash
# Create secrets first
kubectl create secret generic discord-gateway-secrets \
  --from-literal=eliza-cloud-url=https://elizacloud.ai \
  --from-literal=internal-api-key=YOUR_KEY \
  --from-literal=redis-url=YOUR_REDIS_URL \
  --from-literal=redis-token=YOUR_REDIS_TOKEN

# Apply K8s manifests
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/pdb.yaml

# Apply monitoring (requires kube-prometheus-stack)
kubectl apply -f k8s/servicemonitor.yaml
kubectl apply -f k8s/alerts.yaml
```

## Crash Recovery

When a pod crashes:

1. Pod stops sending heartbeats to Redis
2. Other pods detect dead pod after `DEAD_POD_THRESHOLD_MS` (default: 2 min)
3. Surviving pod claims orphaned connections via `/api/internal/discord/gateway/failover`
4. Backend reassigns bots to the claiming pod
5. Bots reconnect automatically

## Agent Integration

### Full Message Flow

1. **User sends message in Discord**
2. **Gateway pod receives event** via Discord WebSocket
3. **Gateway forwards to Eliza Cloud** via `POST /api/internal/discord/events`
4. **Event router dispatches** to configured routes (A2A, MCP, webhook, container)
5. **Agent receives event** with `connection_id` in metadata
6. **Agent responds** via `POST /api/v1/discord/messages`
7. **Message appears in Discord**

### Receiving Events (Discord → Agent)

When a Discord message is received, your agent gets a payload like:

```json
{
  "jsonrpc": "2.0",
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "content": "Hello agent!",
      "metadata": {
        "source": "discord",
        "connection_id": "uuid-of-discord-connection",
        "guild_id": "123456789",
        "channel_id": "987654321",
        "message_id": "111222333",
        "author_id": "user-snowflake",
        "author_username": "username",
        "mentions_bot": true
      }
    }
  }
}
```

**Important**: The `connection_id` is required to send messages back.

### Sending Messages (Agent → Discord)

```bash
POST /api/v1/discord/messages
Authorization: Bearer <api-key>

{
  "connection_id": "uuid-from-incoming-event",
  "channel_id": "987654321",
  "content": "Hello from agent!",
  "reply_to": "111222333"
}
```

With embeds:

```bash
POST /api/v1/discord/messages
{
  "connection_id": "uuid",
  "channel_id": "987654321",
  "embeds": [{
    "title": "Agent Response",
    "description": "Here's what I found...",
    "color": 5814783,
    "fields": [
      {"name": "Status", "value": "Complete", "inline": true}
    ]
  }]
}
```

### Route Types

- **A2A**: JSON-RPC 2.0 `message/send` to agent endpoint
- **MCP**: Tool call `discord_message_received`
- **Webhook**: Signed POST to external URL
- **Container**: POST to running Eliza container
