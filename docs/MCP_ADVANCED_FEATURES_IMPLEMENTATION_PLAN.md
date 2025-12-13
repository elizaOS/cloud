# 🚀 MCP Advanced Features - Comprehensive Implementation Plan

**Date**: 2025-10-21
**Status**: Planning Phase
**Document Version**: 1.0

---

## 📋 Table of Contents

1. [Current State Assessment](#current-state-assessment)
2. [Gap Analysis](#gap-analysis)
3. [Architecture Overview](#architecture-overview)
4. [Detailed Implementation Plan](#detailed-implementation-plan)
5. [Technical Considerations](#technical-considerations)
6. [Implementation Phases](#implementation-phases)
7. [Testing Strategy](#testing-strategy)
8. [Performance Targets](#performance-targets)

---

## 1. Current State Assessment

### ✅ Already Implemented (Phase 1-3)

#### Foundation Layer
- **Redis Cache Infrastructure**: ✅ Complete
  - `CacheClient` class with circuit breaker
  - Upstash Redis integration
  - `MemoryCache` class for memory-specific caching
  - Cache invalidation system

- **Memory Management**: ✅ Complete
  - `MemoryService` with 11 core methods
  - Hybrid Redis + PostgreSQL storage
  - Cache keys and TTL management

- **Real-time Streaming**: ✅ Complete
  - SSE endpoint at `/api/mcp/stream`
  - `AgentEventEmitter` for agent events
  - Redis pub/sub with queue-based polling
  - Support for 3 event types: agent, credits, container

#### MCP Tools Implemented (15 tools)
1. ✅ `check_credits` - Credit balance and transactions
2. ✅ `get_recent_usage` - API usage statistics
3. ✅ `generate_text` - AI text generation
4. ✅ `generate_image` - Image generation
5. ✅ `save_memory` - Store memories
6. ✅ `retrieve_memories` - Search memories
7. ✅ `delete_memory` - Remove memories
8. ✅ `get_conversation_context` - Context retrieval
9. ✅ `create_conversation` - New conversation
10. ✅ `search_conversations` - Search history
11. ✅ `summarize_conversation` - AI summarization
12. ✅ `optimize_context_window` - Smart context selection
13. ✅ `export_conversation` - Export in formats
14. ✅ `clone_conversation` - Duplicate conversation
15. ✅ `analyze_memory_patterns` - Pattern analysis

#### Services Available
- ✅ `containersService` - Container CRUD operations
- ✅ `charactersService` - Character management
- ✅ `conversationsService` - Conversation management
- ✅ `creditsService` - Credit transactions
- ✅ `usageService` - Usage tracking
- ✅ `organizationsService` - Org management
- ✅ `generationsService` - Generation tracking
- ✅ `agentRuntime` - ElizaOS runtime singleton

#### Infrastructure
- ✅ ElizaOS integration with agent-runtime
- ✅ PostgreSQL with Drizzle ORM
- ✅ Upstash Redis for caching
- ✅ AWS infrastructure (ECS, CloudFormation)
- ✅ Authentication (session + API key)
- ✅ Credit system with deduction/tracking

---

## 2. Gap Analysis

### 🔴 Missing Features from Advanced Document

#### Agent Interaction Tools (5 missing)
1. ❌ `chat_with_agent` - Direct agent conversation via MCP
2. ❌ `list_agents` - Agent discovery and listing
3. ❌ `create_character` - Natural language character creation
4. ❌ `get_conversation_history` - Enhanced history with analytics
5. ❌ `search_memories` - (exists as `retrieve_memories`, may need enhancement)

#### Container Management Tools (4 missing)
1. ❌ `list_containers` - Container listing with metrics
2. ❌ `get_container_logs` - CloudWatch logs retrieval
3. ❌ `get_container_metrics` - CloudWatch metrics
4. ❌ `deploy_container` - Deploy containers via MCP

#### Streaming Enhancements (2 missing)
1. ❌ `subscribe_agent_events` - MCP tool to get SSE URL
2. ❌ `stream_credit_updates` - MCP tool to stream credits

#### Advanced Features (6 missing)
1. ❌ `get_smart_suggestions` - Context-aware suggestions
2. ❌ `orchestrate_agents` - Multi-agent orchestration
3. ❌ `consolidate_memories` - Memory compression
4. ❌ `analyze_memory_clusters` - Semantic clustering
5. ❌ Agent state caching (distributed locks, session management)
6. ❌ Search result caching with smart invalidation

#### Security & Audit (2 missing)
1. ❌ API key scoped access (read-only, agent-specific)
2. ❌ `get_audit_log` - Audit logging via MCP

---

## 3. Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Desktop (MCP Client)              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ MCP Protocol (JSON-RPC)
                     │
┌────────────────────▼────────────────────────────────────────┐
│                 MCP Server (/api/mcp)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Tool Layer (20+ tools)                              │   │
│  │  - Agent Tools     - Memory Tools                    │   │
│  │  - Container Tools - Streaming Tools                 │   │
│  └────────────┬─────────────────────────────────────────┘   │
└───────────────┼──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│              Service Layer                                    │
│  ┌─────────────┬──────────────┬─────────────┬──────────────┐│
│  │MemoryService│AgentService  │ContainerSvc │CloudWatchSvc ││
│  │CharacterSvc │ConversationSvc│CreditsService│AnalyticsSvc││
│  └─────────────┴──────────────┴─────────────┴──────────────┘│
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│              Cache & Event Layer                              │
│  ┌──────────────────────────┬──────────────────────────────┐ │
│  │  Redis (Upstash)         │  Redis Pub/Sub               │ │
│  │  - Memory Cache          │  - Agent Events              │ │
│  │  - Room Context          │  - Credit Updates            │ │
│  │  - Search Results        │  - Container Logs            │ │
│  │  - Distributed Locks     │  - SSE Message Queues        │ │
│  └──────────────────────────┴──────────────────────────────┘ │
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│              Data & External Services Layer                   │
│  ┌────────────┬──────────────┬────────────┬────────────────┐ │
│  │PostgreSQL  │ElizaOS       │AWS ECS     │CloudWatch Logs │ │
│  │(Neon)      │Runtime       │(Fargate)   │& Metrics       │ │
│  └────────────┴──────────────┴────────────┴────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### Data Flow Example: `chat_with_agent`

```
1. User sends message via Claude Desktop
   ↓
2. MCP Server receives chat_with_agent tool call
   ↓
3. Check credits & authenticate
   ↓
4. AgentService checks Redis for room context (cache hit = 50ms)
   ↓
5. If cache miss: Load from PostgreSQL + ElizaOS (300ms)
   ↓
6. Send message to agent runtime
   ↓
7. Agent processes with streaming
   ├→ Emit response_started event (Redis pub/sub)
   ├→ Emit response_chunk events (streaming)
   └→ Emit response_complete event
   ↓
8. Update cache, deduct credits, track usage
   ↓
9. Return response to MCP client
```

---

## 4. Detailed Implementation Plan

### Feature Group 1: Agent Interaction Tools

#### 4.1. `chat_with_agent` Tool

**Priority**: 🔴 Critical
**Estimated Effort**: 3-4 days
**Dependencies**: ElizaOS runtime (✅ exists), room creation (✅ exists)

**Implementation Steps**:

1. **Create Agent Service Layer** (`lib/services/agents.ts`)
   ```typescript
   class AgentService {
     // Get or create room for user-agent conversation
     async getOrCreateRoom(entityId: UUID, agentId: UUID): Promise<UUID>

     // Send message to agent with streaming support
     async sendMessage(input: {
       roomId: UUID;
       entityId: UUID;
       message: string;
       streaming?: boolean;
       attachments?: Attachment[];
     }): Promise<AgentResponse>

     // Cache room context in Redis
     async cacheRoomContext(roomId: UUID, context: RoomContext): Promise<void>

     // Get cached room context
     async getRoomContext(roomId: UUID): Promise<RoomContext | null>
   }
   ```

2. **Add MCP Tool** (`app/api/mcp/route.ts`)
   ```typescript
   server.tool(
     "chat_with_agent",
     "Send a message to your deployed ElizaOS agent and receive a response. Supports streaming and attachments. Deducts credits based on token usage.",
     {
       entityId: z.string().describe("User identifier"),
       message: z.string().min(1).describe("Message to send"),
       roomId: z.string().optional().describe("Existing conversation room"),
       streaming: z.boolean().optional().default(false),
       agentId: z.string().optional().describe("Specific agent (defaults to org default)")
     },
     async ({ entityId, message, roomId, streaming, agentId }) => {
       // 1. Get auth context
       // 2. Check credits (estimate 10-100 credits based on message length)
       // 3. Get or create room
       // 4. Send message via agentService
       // 5. If streaming: return SSE URL
       // 6. Deduct credits based on actual usage
       // 7. Track usage
     }
   );
   ```

3. **Enhance Room Context Caching**
   - Add to `lib/cache/keys.ts`:
     ```typescript
     agent: {
       roomContext: (roomId: string) => `agent:room:${roomId}:context:v1`,
       characterData: (agentId: string) => `agent:${agentId}:character:v1`,
     }
     ```
   - TTL: 5 minutes (sliding window on activity)

4. **Integration with Existing ElizaOS Runtime**
   - Use `/api/eliza/rooms/[roomId]/messages` pattern
   - Reuse `agentRuntime.getRuntime()` singleton
   - Integrate with `AgentEventEmitter` for streaming

5. **Testing Requirements**
   - Unit tests for AgentService
   - Integration test: full message flow
   - Load test: concurrent conversations
   - Stream test: SSE delivery

**Credit Costs**:
- Base: 5 credits per message
- Token-based: 0.01 credit per 1K input tokens, 0.03 per 1K output tokens
- With attachments: +2 credits per image

---

#### 4.2. `list_agents` Tool

**Priority**: 🟡 High
**Estimated Effort**: 1-2 days
**Dependencies**: Characters service (✅ exists), containers service (✅ exists)

**Implementation Steps**:

1. **Enhance Character Service** (`lib/services/characters.ts`)
   ```typescript
   // Add method to get agent statistics
   async getAgentStatistics(characterId: string): Promise<{
     messageCount: number;
     lastActiveAt: Date | null;
     uptime: number;
     status: 'deployed' | 'stopped' | 'draft';
   }>
   ```

2. **Create Agent Discovery Service** (`lib/services/agent-discovery.ts`)
   ```typescript
   class AgentDiscoveryService {
     async listAgents(input: {
       organizationId: string;
       filters?: {
         deployed?: boolean;
         template?: boolean;
         owned?: boolean;
       };
       includeStats?: boolean;
     }): Promise<AgentListResult>

     // Cache agent list in Redis
     async cacheAgentList(orgId: string, agents: Agent[]): Promise<void>
   }
   ```

3. **Add MCP Tool**
   ```typescript
   server.tool(
     "list_agents",
     "List all available agents, characters, and deployed ElizaOS instances. Includes deployment status and usage statistics. FREE tool.",
     {
       filters: z.object({
         deployed: z.boolean().optional(),
         template: z.boolean().optional(),
         owned: z.boolean().optional()
       }).optional(),
       includeStats: z.boolean().optional().default(false)
     },
     async ({ filters, includeStats }) => {
       // 1. Check cache first (1 hour TTL)
       // 2. Query characters + containers
       // 3. Enrich with statistics if requested
       // 4. Cache result
       // 5. Return agent list
     }
   );
   ```

4. **Cache Strategy**
   - Key: `agent:list:${orgId}:${filterHash}:v1`
   - TTL: 1 hour
   - Invalidate on: character create/update/delete, container deploy/stop

**Credit Costs**: FREE (encourages discovery)

---

#### 4.3. `create_character` Tool

**Priority**: 🟡 High
**Estimated Effort**: 4-5 days
**Dependencies**: AI generation (✅ exists), character service (✅ exists)

**Implementation Steps**:

1. **Create Character Generation Service** (`lib/services/character-generation.ts`)
   ```typescript
   class CharacterGenerationService {
     async generateFromDescription(input: {
       description: string;
       plugins?: string[];
       style?: 'professional' | 'casual' | 'technical' | 'creative';
       useCase?: string;
       organizationId: string;
       userId: string;
     }): Promise<{
       character: ElizaCharacter;
       rationale: string;
       estimatedTokens: number;
     }>

     private async generateCharacterJSON(prompt: string): Promise<ElizaCharacter>
     private async validateCharacter(char: ElizaCharacter): Promise<boolean>
     private async generateSampleMessages(char: ElizaCharacter): Promise<string[]>
   }
   ```

2. **Prompt Engineering** for character generation
   ```typescript
   const SYSTEM_PROMPT = `You are an expert at creating ElizaOS character definitions.
   Given a natural language description, generate a valid ElizaOS character JSON.

   Requirements:
   - Include name, bio (array of 3-5 strings), lore (array of facts)
   - Generate 5-10 messageExamples with appropriate tone
   - Include personality traits (adjectives array)
   - Set appropriate plugins based on use case
   - Follow ElizaOS schema exactly

   Output only valid JSON, no explanations.`;
   ```

3. **Schema Validation**
   - Use Zod to validate against ElizaOS character schema
   - Check required fields: name, bio, messageExamples
   - Validate plugin names against available plugins

4. **Add MCP Tool**
   ```typescript
   server.tool(
     "create_character",
     "Create a new ElizaOS character using natural language description. AI generates character definition, validates, and saves. Deducts 30-80 credits based on complexity.",
     {
       description: z.string().min(20).max(2000),
       plugins: z.array(z.string()).optional(),
       style: z.enum(['professional', 'casual', 'technical', 'creative']).optional(),
       useCase: z.string().optional()
     },
     async ({ description, plugins, style, useCase }) => {
       // 1. Estimate cost (30-80 credits)
       // 2. Check credits
       // 3. Generate character via GPT-4o-mini
       // 4. Validate schema
       // 5. Generate sample messages
       // 6. Save to database
       // 7. Deduct actual credits used
       // 8. Return character ID and full definition
     }
   );
   ```

5. **Cost Calculation**
   - Base: 30 credits (simple character)
   - Complex: +20 credits (detailed description, custom plugins)
   - Sample generation: +30 credits (if requested)

**Validation Requirements**:
- Malicious content detection
- Plugin availability check
- Name uniqueness (per org)
- Schema compliance

---

### Feature Group 2: Container Management Tools

#### 4.4. `list_containers` Tool

**Priority**: 🟡 High
**Estimated Effort**: 1-2 days
**Dependencies**: Container service (✅ exists)

**Implementation Steps**:

1. **Enhance Container Service**
   ```typescript
   // lib/services/containers.ts
   async listWithMetrics(input: {
     organizationId: string;
     status?: ContainerStatus;
     includeMetrics?: boolean;
   }): Promise<ContainerWithMetrics[]>

   async getContainerHealth(containerId: string): Promise<HealthStatus>
   async calculateContainerCosts(container: Container): Promise<CostBreakdown>
   ```

2. **Add MCP Tool**
   ```typescript
   server.tool(
     "list_containers",
     "List all deployed containers with status, health, and resource usage. FREE tool.",
     {
       status: z.enum(['running', 'stopped', 'failed', 'deploying']).optional(),
       includeMetrics: z.boolean().optional().default(false)
     },
     async ({ status, includeMetrics }) => {
       // 1. Get auth
       // 2. Query containers by org
       // 3. Filter by status
       // 4. If includeMetrics: fetch health checks, costs
       // 5. Return formatted list
     }
   );
   ```

3. **Cache Strategy**
   - Key: `containers:list:${orgId}:v1`
   - TTL: 30 seconds (frequent updates for status)
   - Invalidate on: deploy, stop, status change

**Credit Costs**: FREE

---

#### 4.5. `get_container_logs` Tool

**Priority**: 🟡 High
**Estimated Effort**: 3-4 days
**Dependencies**: AWS CloudWatch Logs API

**Implementation Steps**:

1. **Create CloudWatch Logs Service** (`lib/services/cloudwatch-logs.ts`)
   ```typescript
   import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";

   class CloudWatchLogsService {
     private client: CloudWatchLogsClient;

     async getContainerLogs(input: {
       containerId: string;
       logGroupName: string;
       lines?: number;
       since?: Date;
       filter?: string;
       level?: 'error' | 'warn' | 'info' | 'debug';
     }): Promise<LogEntry[]>

     async streamLogs(containerId: string): AsyncIterator<LogEntry>

     private buildFilterPattern(level?: string, filter?: string): string
   }
   ```

2. **Container to Log Group Mapping**
   ```typescript
   // lib/services/container-logs.ts
   function getLogGroupName(container: Container): string {
     return `/ecs/${container.ecs_service_name || container.name}`;
   }

   function getLogStreamPrefix(container: Container): string {
     return `${container.ecs_service_name}/container/${container.name}`;
   }
   ```

3. **Add MCP Tool**
   ```typescript
   server.tool(
     "get_container_logs",
     "Fetch CloudWatch logs from deployed containers. Supports filtering and log level selection. Deducts 2 credits per request.",
     {
       containerId: z.string().uuid(),
       lines: z.number().int().min(1).max(1000).optional().default(100),
       since: z.string().datetime().optional(),
       filter: z.string().optional(),
       level: z.enum(['error', 'warn', 'info', 'debug']).optional()
     },
     async ({ containerId, lines, since, filter, level }) => {
       // 1. Get auth & check credits
       // 2. Verify container ownership
       // 3. Get log group name from container
       // 4. Query CloudWatch with filters
       // 5. Format and return logs
       // 6. Deduct 2 credits
     }
   );
   ```

4. **Caching Strategy**
   - Recent logs cached: 30 second TTL
   - Key: `container:logs:${containerId}:recent:v1`
   - Don't cache filtered/time-range queries (too specific)

5. **Error Handling**
   - Handle missing log groups gracefully
   - Rate limit CloudWatch API calls (max 5 requests/sec)
   - Fallback message if logs not available

**Credit Costs**: 2 credits per request

---

#### 4.6. `get_container_metrics` Tool

**Priority**: 🟢 Medium
**Estimated Effort**: 3-4 days
**Dependencies**: AWS CloudWatch Metrics API

**Implementation Steps**:

1. **Create CloudWatch Metrics Service** (`lib/services/cloudwatch-metrics.ts`)
   ```typescript
   import { CloudWatchClient, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";

   class CloudWatchMetricsService {
     async getContainerMetrics(input: {
       containerId: string;
       serviceName: string;
       clusterName: string;
       metrics: ('cpu' | 'memory' | 'network')[];
       period: '1h' | '6h' | '24h' | '7d';
       resolution: '1m' | '5m' | '1h';
     }): Promise<MetricsResult>

     private async getECSMetric(params: {
       serviceName: string;
       clusterName: string;
       metricName: string;
       startTime: Date;
       endTime: Date;
       period: number;
     }): Promise<Datapoint[]>
   }
   ```

2. **Metric Definitions**
   ```typescript
   const ECS_METRICS = {
     cpu: {
       namespace: 'AWS/ECS',
       metricName: 'CPUUtilization',
       unit: 'Percent'
     },
     memory: {
       namespace: 'AWS/ECS',
       metricName: 'MemoryUtilization',
       unit: 'Percent'
     },
     network: {
       namespace: 'AWS/ECS',
       metricName: 'NetworkRxBytes',
       unit: 'Bytes'
     }
   };
   ```

3. **Add MCP Tool**
   ```typescript
   server.tool(
     "get_container_metrics",
     "Get resource usage metrics (CPU, memory, network) from CloudWatch. Returns time-series data for visualization. Deducts 3 credits.",
     {
       containerId: z.string().uuid(),
       metrics: z.array(z.enum(['cpu', 'memory', 'network'])),
       period: z.enum(['1h', '6h', '24h', '7d']).optional().default('24h'),
       resolution: z.enum(['1m', '5m', '1h']).optional().default('5m')
     },
     async ({ containerId, metrics, period, resolution }) => {
       // 1. Auth & credit check (3 credits)
       // 2. Get container details (service name, cluster)
       // 3. Query CloudWatch for each metric
       // 4. Calculate averages, peaks
       // 5. Estimate cost based on usage
       // 6. Return formatted data
     }
   );
   ```

4. **Cost Estimation**
   ```typescript
   function estimateCostFromMetrics(metrics: MetricsResult): number {
     const avgCPU = calculateAverage(metrics.cpu.datapoints);
     const avgMemory = calculateAverage(metrics.memory.datapoints);

     // Fargate pricing: $0.04048/vCPU/hour, $0.004445/GB/hour
     const hoursInPeriod = calculateHours(metrics.timeRange);
     const cpuCost = (avgCPU / 100) * 0.04048 * hoursInPeriod;
     const memCost = (avgMemory / 1024) * 0.004445 * hoursInPeriod;

     return cpuCost + memCost;
   }
   ```

**Credit Costs**: 3 credits per request

---

#### 4.7. `deploy_container` Tool

**Priority**: 🟢 Medium
**Estimated Effort**: 5-6 days
**Dependencies**: Container deployment infrastructure (✅ exists), CloudFormation (✅ exists)

**Implementation Steps**:

1. **Enhance Container Deployment Service**
   ```typescript
   // lib/services/container-deployment.ts
   class ContainerDeploymentService {
     async deployWithProgress(input: {
       name: string;
       ecrImageUri: string;
       environmentVars?: Record<string, string>;
       resources?: { cpu: string; memory: string };
       desiredCount?: number;
       healthCheck?: HealthCheckConfig;
       organizationId: string;
       userId: string;
     }): Promise<{
       containerId: string;
       deploymentId: string;
       sseStreamUrl: string;
     }>

     async validateQuota(orgId: string): Promise<boolean>
     async estimateDeploymentCost(resources: ResourceConfig): Promise<number>
     async publishDeploymentProgress(deploymentId: string, event: DeploymentEvent): Promise<void>
   }
   ```

2. **Deployment Progress Events**
   ```typescript
   type DeploymentEvent = {
     type: 'started' | 'creating_service' | 'registering_task' | 'health_check' | 'complete' | 'failed';
     progress: number; // 0-100
     message: string;
     timestamp: Date;
   };
   ```

3. **Add MCP Tool**
   ```typescript
   server.tool(
     "deploy_container",
     "Deploy a container to AWS ECS Fargate with health checks and auto-scaling. Returns SSE URL for deployment progress. Deducts 1000 credits + hourly costs.",
     {
       name: z.string().min(1).max(50),
       ecrImageUri: z.string().url(),
       environmentVars: z.record(z.string()).optional(),
       resources: z.object({
         cpu: z.enum(['256', '512', '1024', '2048']).optional().default('512'),
         memory: z.enum(['512', '1024', '2048', '4096']).optional().default('1024')
       }).optional(),
       desiredCount: z.number().int().min(1).max(10).optional().default(1),
       healthCheck: z.object({
         path: z.string().optional().default('/health'),
         interval: z.number().int().optional().default(30)
       }).optional()
     },
     async (params) => {
       // 1. Auth & validate quota
       // 2. Estimate total cost (deployment + first hour)
       // 3. Check credits (need 1000 + hourly)
       // 4. Validate ECR image exists
       // 5. Start deployment (async)
       // 6. Emit progress events to Redis
       // 7. Return SSE URL for progress tracking
       // 8. Deduct credits
     }
   );
   ```

4. **SSE Integration**
   - Reuse existing `/api/mcp/stream` endpoint
   - Event type: `container`
   - Resource ID: `deploymentId`
   - Channel: `container:deployment:${deploymentId}:queue`

5. **Rollback on Failure**
   ```typescript
   async function rollbackDeployment(deploymentId: string): Promise<void> {
     // 1. Stop ECS service creation
     // 2. Delete partially created resources
     // 3. Refund credits (keep 10% for processing)
     // 4. Emit rollback_complete event
   }
   ```

**Credit Costs**:
- Deployment: 1000 credits (one-time)
- Hourly: Based on resources (e.g., 256CPU/512MB = 50 credits/hour)

---

### Feature Group 3: Streaming Enhancements

#### 4.8. `subscribe_agent_events` Tool

**Priority**: 🟡 High
**Estimated Effort**: 1 day
**Dependencies**: SSE endpoint (✅ exists), AgentEventEmitter (✅ exists)

**Implementation Steps**:

1. **Add MCP Tool** (simple wrapper)
   ```typescript
   server.tool(
     "subscribe_agent_events",
     "Get SSE stream URL for real-time agent events (messages, responses, errors). FREE tool - events only stream during active conversations.",
     {
       roomId: z.string().uuid().describe("Conversation room ID to monitor")
     },
     async ({ roomId }) => {
       // 1. Verify room exists and user has access
       // 2. Generate SSE URL with auth token
       const sseUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp/stream?eventType=agent&resourceId=${roomId}&token=${token}`;
       // 3. Return connection instructions
       return {
         content: [{
           type: "text",
           text: JSON.stringify({
             sseUrl,
             eventTypes: [
               'message_received',
               'response_started',
               'response_chunk',
               'response_complete',
               'error'
             ],
             usage: `Use Server-Sent Events to connect: EventSource(sseUrl)`,
             expiry: '5 minutes after last activity'
           }, null, 2)
         }]
       };
     }
   );
   ```

2. **Authentication for SSE**
   - Add token parameter to SSE endpoint
   - Validate token in stream initialization
   - Use short-lived JWT (5 min expiry)

3. **Documentation**
   - Provide example connection code
   - Document event payloads
   - Explain cleanup (auto-disconnect after 5 min)

**Credit Costs**: FREE

---

#### 4.9. `stream_credit_updates` Tool

**Priority**: 🟢 Medium
**Estimated Effort**: 1 day
**Dependencies**: SSE endpoint (✅ exists), RedisCreditEventEmitter (✅ exists)

**Implementation Steps**:

1. **Add MCP Tool**
   ```typescript
   server.tool(
     "stream_credit_updates",
     "Get SSE stream URL for real-time credit balance updates and transactions. FREE tool.",
     {
       includeTransactions: z.boolean().optional().default(false)
     },
     async ({ includeTransactions }) => {
       const { user } = getAuthContext();
       const token = generateShortLivedToken(user.id, 'credits');

       return {
         content: [{
           type: "text",
           text: JSON.stringify({
             sseUrl: `${baseUrl}/api/mcp/stream?eventType=credits&resourceId=${user.organization_id}&token=${token}`,
             eventTypes: ['balance_updated', 'transaction_created'],
             includeTransactions
           }, null, 2)
         }]
       };
     }
   );
   ```

2. **Event Payload Enhancement**
   ```typescript
   interface CreditEvent {
     type: 'balance_updated' | 'transaction_created';
     organizationId: string;
     newBalance: number;
     delta: number;
     reason: string;
     transaction?: {
       id: string;
       amount: number;
       type: 'deduction' | 'addition';
       description: string;
     };
     timestamp: Date;
   }
   ```

**Credit Costs**: FREE

---

### Feature Group 4: Advanced Features

#### 4.10. `get_smart_suggestions` Tool

**Priority**: 🟢 Medium
**Estimated Effort**: 3-4 days
**Dependencies**: Conversation patterns, AI generation

**Implementation Steps**:

1. **Create Suggestions Service** (`lib/services/smart-suggestions.ts`)
   ```typescript
   class SmartSuggestionsService {
     async generateSuggestions(input: {
       roomId: string;
       organizationId: string;
       conversationContext: Memory[];
     }): Promise<Suggestion[]>

     private async analyzeConversationPatterns(memories: Memory[]): Promise<Pattern[]>
     private async generateFollowUpQuestions(context: string): Promise<string[]>
     private async suggestOptimizations(usage: UsageData): Promise<Optimization[]>
   }
   ```

2. **Suggestion Types**
   ```typescript
   type Suggestion = {
     type: 'followup' | 'capability' | 'optimization' | 'model';
     content: string;
     rationale: string;
     priority: number;
   };
   ```

3. **Add MCP Tool**
   ```typescript
   server.tool(
     "get_smart_suggestions",
     "Get AI-powered suggestions based on conversation context (follow-up questions, optimizations, better models). Deducts 5 credits.",
     {
       roomId: z.string().uuid()
     },
     async ({ roomId }) => {
       // 1. Get last 10 messages from conversation
       // 2. Analyze patterns and topics
       // 3. Generate suggestions using GPT-4o-mini
       // 4. Cache for 2 minutes
       // 5. Return structured suggestions
     }
   );
   ```

**Credit Costs**: 5 credits

---

#### 4.11. Distributed State Management

**Priority**: 🟡 High
**Estimated Effort**: 4-5 days
**Dependencies**: Redis client (✅ exists)

**Implementation Steps**:

1. **Create Distributed Lock Service** (`lib/cache/distributed-locks.ts`)
   ```typescript
   class DistributedLockService {
     async acquireRoomLock(roomId: string, ttl: number = 30000): Promise<Lock | null>
     async releaseRoomLock(roomId: string, lockId: string): Promise<boolean>
     async extendLock(roomId: string, lockId: string, ttl: number): Promise<boolean>
   }

   interface Lock {
     lockId: string;
     roomId: string;
     expiresAt: Date;
     release: () => Promise<void>;
     extend: (ms: number) => Promise<void>;
   }
   ```

2. **Implementation using Redis SET NX**
   ```typescript
   async acquireRoomLock(roomId: string, ttl: number): Promise<Lock | null> {
     const lockId = uuidv4();
     const key = `agent:room:${roomId}:lock`;

     // Try to acquire lock
     const acquired = await this.redis.set(
       key,
       lockId,
       { nx: true, px: ttl } // NX = set if not exists, PX = TTL in ms
     );

     if (!acquired) return null;

     return {
       lockId,
       roomId,
       expiresAt: new Date(Date.now() + ttl),
       release: () => this.releaseRoomLock(roomId, lockId),
       extend: (ms) => this.extendLock(roomId, lockId, ms)
     };
   }
   ```

3. **Usage in Agent Message Processing**
   ```typescript
   async function processMessage(roomId: string, message: string) {
     const lock = await distributedLocks.acquireRoomLock(roomId, 30000);

     if (!lock) {
       throw new Error('Room is locked by another process');
     }

     try {
       // Process message
       await agentRuntime.processMessage(roomId, message);
     } finally {
       await lock.release();
     }
   }
   ```

4. **Agent State Caching**
   ```typescript
   // lib/cache/agent-state-cache.ts
   class AgentStateCache {
     async getRoomContext(roomId: string): Promise<RoomContext | null> {
       const key = CacheKeys.agent.roomContext(roomId);
       const cached = await cacheClient.get(key);
       return cached ? JSON.parse(cached) : null;
     }

     async setRoomContext(roomId: string, context: RoomContext): Promise<void> {
       const key = CacheKeys.agent.roomContext(roomId);
       await cacheClient.set(key, JSON.stringify(context), CacheTTL.agent.roomContext);
     }

     async getCharacterData(agentId: string): Promise<Character | null> {
       const key = CacheKeys.agent.characterData(agentId);
       const cached = await cacheClient.get(key);
       return cached ? JSON.parse(cached) : null;
     }

     async getUserSession(entityId: string): Promise<UserSession | null> {
       const key = `agent:user:${entityId}:session:v1`;
       return await cacheClient.get(key);
     }
   }
   ```

---

### Feature Group 5: Security & Audit

#### 4.12. API Key Scoped Access

**Priority**: 🟢 Medium
**Estimated Effort**: 3-4 days
**Dependencies**: API keys service (✅ exists)

**Implementation Steps**:

1. **Enhance API Key Schema** (`db/schemas/api-keys.ts`)
   ```typescript
   export const apiKeys = pgTable("api_keys", {
     // ... existing fields
     scopes: jsonb("scopes").default([]).notNull(), // ['read', 'write', 'deploy']
     allowedTools: jsonb("allowed_tools"), // null = all, or array of tool names
     allowedAgents: jsonb("allowed_agents"), // null = all, or array of agent IDs
     rateLimit: jsonb("rate_limit").default({ requests: 100, window: 60 }), // per minute
   });
   ```

2. **Scope Validation Middleware**
   ```typescript
   // lib/auth/scope-validator.ts
   function validateToolAccess(apiKey: ApiKey, toolName: string): boolean {
     // Check if tool is in allowedTools (if specified)
     if (apiKey.allowedTools && !apiKey.allowedTools.includes(toolName)) {
       return false;
     }

     // Check scopes
     if (toolName.includes('deploy') && !apiKey.scopes.includes('deploy')) {
       return false;
     }

     if (toolName.includes('delete') && !apiKey.scopes.includes('write')) {
       return false;
     }

     return true;
   }
   ```

3. **Add to MCP Route**
   ```typescript
   // In each tool handler
   const { apiKey, user } = getAuthContext();

   if (apiKey) {
     // Validate scope for this tool
     if (!validateToolAccess(apiKey, 'deploy_container')) {
       return {
         content: [{ type: "text", text: JSON.stringify({
           error: "API key does not have permission for this tool",
           requiredScopes: ['deploy']
         })}],
         isError: true
       };
     }
   }
   ```

---

#### 4.13. `get_audit_log` Tool

**Priority**: 🟢 Medium
**Estimated Effort**: 2-3 days
**Dependencies**: Usage service (✅ exists)

**Implementation Steps**:

1. **Create Audit Log Service** (`lib/services/audit-log.ts`)
   ```typescript
   class AuditLogService {
     async log(entry: AuditEntry): Promise<void>

     async query(input: {
       organizationId: string;
       userId?: string;
       toolName?: string;
       startDate?: Date;
       endDate?: Date;
       limit?: number;
     }): Promise<AuditEntry[]>
   }

   interface AuditEntry {
     id: string;
     timestamp: Date;
     userId: string;
     organizationId: string;
     tool: string;
     parameters: Record<string, unknown>;
     result: 'success' | 'error';
     creditsDeducted: number;
     errorMessage?: string;
     ipAddress?: string;
     userAgent?: string;
   }
   ```

2. **Add MCP Tool**
   ```typescript
   server.tool(
     "get_audit_log",
     "View audit log of all MCP tool usage in your organization. Includes credits, errors, and timing. FREE tool.",
     {
       userId: z.string().optional(),
       toolName: z.string().optional(),
       startDate: z.string().datetime().optional(),
       limit: z.number().int().max(100).optional().default(50)
     },
     async (params) => {
       // Query audit logs
       // Format and return
     }
   );
   ```

**Credit Costs**: FREE

---

## 5. Technical Considerations

### 5.1. Performance Optimization

**Redis Caching Strategy**:
- **Hot Data**: Room contexts, character data (5-10 min TTL)
- **Warm Data**: Search results, agent lists (10-60 min TTL)
- **Cold Data**: Historical metrics (1-24 hour TTL)

**Cache Hit Rate Targets**:
- Room context: >80%
- Search results: >60%
- Agent list: >90%

**Distributed Locking**:
- Prevent race conditions in concurrent message processing
- TTL: 30 seconds (auto-release on crash)
- Retry logic: 3 attempts with exponential backoff

### 5.2. Scalability

**Stateless Design**:
- All state in Redis or PostgreSQL
- No in-memory state in Next.js routes
- Horizontal scaling ready

**Rate Limiting**:
- Per API key: Configurable (default 100 req/min)
- Global: 10,000 req/min per organization
- CloudWatch API: 5 req/sec (AWS limits)

### 5.3. Error Handling

**Graceful Degradation**:
- Redis failure: Skip caching, continue operation
- CloudWatch failure: Return cached data or error message
- AI generation failure: Provide fallback suggestions

**Circuit Breaker Pattern**:
- Already implemented in `CacheClient`
- Add to CloudWatch services
- Open circuit after 5 consecutive failures

### 5.4. Security

**Input Validation**:
- All tool parameters validated with Zod
- SQL injection prevention via Drizzle ORM
- XSS prevention in returned content

**Authorization**:
- Every tool checks organization ownership
- Container/agent access validated
- API key scopes enforced

**Sensitive Data**:
- Never log passwords, tokens, API keys
- Mask in audit logs
- Encrypt environment variables in database

---

## 6. Implementation Phases

### Phase 1: Agent Interaction (Weeks 1-2)
**Goal**: Enable direct agent conversations via MCP

**Tasks**:
1. Implement `AgentService` with room context caching
2. Add `chat_with_agent` tool
3. Add `list_agents` tool
4. Add `subscribe_agent_events` tool (wrapper)
5. Test agent streaming end-to-end

**Deliverables**:
- Working agent chat via Claude Desktop
- Agent discovery
- Real-time event streaming

**Success Metrics**:
- <100ms response time (cached room context)
- >80% cache hit rate
- Streaming latency <50ms

---

### Phase 2: Character Creation (Week 3)
**Goal**: AI-powered character generation

**Tasks**:
1. Implement `CharacterGenerationService`
2. Create and test generation prompts
3. Add schema validation
4. Add `create_character` tool
5. Test with various descriptions

**Deliverables**:
- Natural language character creation
- Validation and error handling
- Sample character library

**Success Metrics**:
- >90% successful generation rate
- <30 second generation time
- Valid ElizaOS schema output

---

### Phase 3: Container Management (Weeks 4-5)
**Goal**: Full container lifecycle via MCP

**Tasks**:
1. Implement `CloudWatchLogsService`
2. Implement `CloudWatchMetricsService`
3. Add `list_containers` tool
4. Add `get_container_logs` tool
5. Add `get_container_metrics` tool
6. Enhance `deploy_container` with progress tracking
7. Test deployment flow end-to-end

**Deliverables**:
- Container listing and status
- Log retrieval and filtering
- Metrics visualization data
- Deployment with progress tracking

**Success Metrics**:
- <2s log retrieval time
- <5s metrics retrieval time
- Successful deployment tracking

---

### Phase 4: Advanced Features (Week 6)
**Goal**: Smart suggestions and state management

**Tasks**:
1. Implement `DistributedLockService`
2. Implement `AgentStateCache`
3. Implement `SmartSuggestionsService`
4. Add `get_smart_suggestions` tool
5. Add `stream_credit_updates` tool
6. Test concurrent message handling with locks

**Deliverables**:
- Distributed locking for concurrency
- Smart contextual suggestions
- Enhanced state caching

**Success Metrics**:
- Zero race conditions in concurrent tests
- Relevant suggestions >70% of time
- <50ms lock acquisition time

---

### Phase 5: Security & Polish (Week 7)
**Goal**: Security hardening and audit

**Tasks**:
1. Implement API key scoped access
2. Add scope validation middleware
3. Implement `AuditLogService`
4. Add `get_audit_log` tool
5. Security audit and penetration testing
6. Performance optimization
7. Documentation

**Deliverables**:
- Scoped API keys
- Complete audit logging
- Security hardening
- Comprehensive documentation

**Success Metrics**:
- No security vulnerabilities
- 100% audit coverage
- <10ms auth overhead

---

## 7. Testing Strategy

### Unit Tests
- All service methods
- Cache operations
- Lock acquisition/release
- Validation logic

### Integration Tests
- Full MCP tool flows
- Agent conversation with streaming
- Container deployment end-to-end
- Credit deduction and tracking

### Load Tests
- Concurrent conversations (100 simultaneous)
- Cache performance under load
- Distributed lock contention
- CloudWatch API rate limits

### Security Tests
- Authorization bypass attempts
- SQL injection attempts
- XSS in tool responses
- API key scope violations

---

## 8. Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Cache Hit Rate (Room Context) | >80% | Redis metrics |
| Cache Hit Rate (Search) | >60% | Redis metrics |
| Agent Response (Cached) | <100ms | P95 latency |
| Agent Response (Uncached) | <2s | P95 latency |
| Memory Search (Cached) | <50ms | P95 latency |
| Memory Search (Uncached) | <500ms | P95 latency |
| SSE Latency | <100ms | Event delivery time |
| Lock Acquisition | <50ms | P95 latency |
| Container Logs Retrieval | <2s | P95 latency |
| Container Metrics Retrieval | <5s | P95 latency |
| Character Generation | <30s | P95 latency |
| Redis Availability | >99.9% | Upstash monitoring |
| Tool Success Rate | >99% | Error tracking |

---

## 9. Risk Assessment

### High Risk Items

1. **CloudWatch API Rate Limits**
   - **Risk**: Hitting AWS rate limits on high traffic
   - **Mitigation**: Aggressive caching, request queuing, fallback messages

2. **Distributed Lock Deadlocks**
   - **Risk**: Locks not released, blocking operations
   - **Mitigation**: TTL on all locks, monitoring, manual release endpoint

3. **Character Generation Quality**
   - **Risk**: AI generates invalid or inappropriate characters
   - **Mitigation**: Strict validation, content filtering, human review option

4. **Credit Balance Race Conditions**
   - **Risk**: Double-spending on concurrent operations
   - **Mitigation**: Database transactions, optimistic locking

### Medium Risk Items

1. **Cache Invalidation Complexity**
   - **Risk**: Stale data served from cache
   - **Mitigation**: Conservative TTLs, event-driven invalidation

2. **SSE Connection Limits**
   - **Risk**: Too many open connections
   - **Mitigation**: 5-minute timeout, connection pooling

3. **Large Log Files**
   - **Risk**: CloudWatch returns massive log volumes
   - **Mitigation**: Strict line limits, pagination, streaming

---

## 10. Documentation Requirements

### For Developers
- Architecture diagrams
- Service method documentation
- Cache key reference
- Testing guide
- Deployment guide

### For Users (MCP Clients)
- Tool usage examples
- Credit cost reference
- Error handling guide
- Best practices
- FAQ

### For Operations
- Monitoring setup
- Alert thresholds
- Runbook for common issues
- Performance tuning guide
- Security checklist

---

## 11. Success Criteria

### Phase 1 Success
- ✅ Users can chat with agents via Claude Desktop
- ✅ Agent list shows all deployed agents
- ✅ Streaming works reliably
- ✅ Cache hit rate >70%

### Phase 2 Success
- ✅ Characters generated from descriptions
- ✅ >90% valid character output
- ✅ Generation time <30s

### Phase 3 Success
- ✅ Container logs accessible
- ✅ Metrics visualization ready
- ✅ Deployment tracking works
- ✅ No CloudWatch rate limit issues

### Phase 4 Success
- ✅ Zero race conditions
- ✅ Suggestions relevant and helpful
- ✅ State caching improves performance

### Phase 5 Success
- ✅ Scoped API keys working
- ✅ Audit log complete
- ✅ Security audit passed
- ✅ Documentation complete

---

## 12. Next Steps

### Immediate Actions
1. **Review and approve this plan** with stakeholders
2. **Set up monitoring** for new metrics
3. **Create task tickets** for Phase 1
4. **Allocate resources** (developers, AWS budget)
5. **Schedule kickoff** for Week 1

### Before Starting
- [ ] Verify AWS CloudWatch API access
- [ ] Confirm Redis capacity for new cache keys
- [ ] Review credit costs for new tools
- [ ] Set up development environment
- [ ] Create test organization and API keys

---

**End of Implementation Plan**
