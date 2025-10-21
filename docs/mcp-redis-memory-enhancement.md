# MCP Enhancement: Redis-Backed Serverless Memory System

**Created**: October 21, 2025  
**Priority**: High  
**Type**: Feature Enhancement  
**Status**: Draft

## 📋 Overview

Enhance the Model Context Protocol (MCP) server with advanced memory management capabilities powered by Redis for serverless-compatible, real-time conversation context and memory storage.

## 🎯 Goals

1. **Extend MCP Tools**: Add 8+ new memory and context management tools
2. **Redis Memory Layer**: Implement Redis-backed serverless memory caching for fast retrieval
3. **Hybrid Storage**: Combine PostgreSQL (persistent) + Redis (hot cache) for optimal performance
4. **Conversation Intelligence**: Add memory search, summarization, and context-aware features
5. **Multi-Tenant Memory**: Ensure proper organization/user isolation in memory storage

## 🔍 Current State Analysis

### Existing MCP Tools (4)

- ✅ `check_credits` - View credit balance and transactions
- ✅ `get_recent_usage` - API usage statistics
- ✅ `generate_text` - Text generation with GPT-4/Claude/Gemini
- ✅ `generate_image` - Image generation with Gemini 2.5

### Existing Redis Infrastructure

- ✅ Upstash Redis client (`lib/cache/client.ts`)
- ✅ Rate limiting with sliding window (`lib/middleware/rate-limit-redis.ts`)
- ✅ Credit event pub/sub (`lib/events/credit-events-redis.ts`)
- ✅ General caching layer with circuit breaker

### Existing Memory Storage

- ✅ PostgreSQL tables: `conversations`, `conversation_messages`
- ✅ ElizaOS integration: `memories`, `embeddings`, `rooms`, `participants`
- ✅ Agent runtime with full conversation pipeline
- ✅ Recent messages provider for context

## 🚀 Proposed New MCP Tools

### 1. **Memory Management Tools**

#### `save_memory`

Store important information to long-term memory with semantic tagging.

```typescript
{
  content: string;           // The memory content
  type: "fact" | "preference" | "context" | "document";
  tags?: string[];          // Optional tags for categorization
  metadata?: Record<string, unknown>;
  ttl?: number;             // Optional TTL in seconds (Redis only)
  persistent?: boolean;     // Store in PostgreSQL (default: true)
}
```

**Returns**: Memory ID, storage location (Redis/PostgreSQL), expiration

#### `retrieve_memories`

Search and retrieve memories using semantic search or filters.

```typescript
{
  query?: string;           // Semantic search query
  type?: string[];          // Filter by memory type
  tags?: string[];          // Filter by tags
  limit?: number;           // Max results (default: 10)
  includeArchived?: boolean;
  sortBy?: "relevance" | "recent" | "importance";
}
```

**Returns**: Array of memories with scores, timestamps, metadata

#### `delete_memory`

Remove a specific memory or bulk delete by filters.

```typescript
{
  memoryId?: string;        // Specific memory ID
  olderThan?: number;       // Delete memories older than N days
  type?: string[];          // Delete by type
  tags?: string[];          // Delete by tags
}
```

**Returns**: Count of deleted memories, storage freed

#### `summarize_conversation`

Generate a summary of conversation history for a specific room/context.

```typescript
{
  roomId?: string;          // Specific room/conversation
  lastN?: number;           // Summarize last N messages (default: 50)
  style?: "brief" | "detailed" | "bullet-points";
  includeMetadata?: boolean;
}
```

**Returns**: Summary text, token count, key topics, participants

### 2. **Conversation Context Tools**

#### `get_conversation_context`

Retrieve enriched conversation context with memory integration.

```typescript
{
  roomId: string;
  depth?: number;           // How many messages to include (default: 20)
  includeMemories?: boolean; // Include relevant saved memories
  includeEmbeddings?: boolean; // Include semantic context
  format?: "chat" | "json" | "markdown";
}
```

**Returns**: Messages, memories, participants, metadata, token estimates

#### `create_conversation`

Create a new conversation context with initial settings.

```typescript
{
  title: string;
  model?: string;
  systemPrompt?: string;
  settings?: {
    temperature?: number;
    maxTokens?: number;
    // ... other settings
  };
  initialMemories?: string[]; // Memory IDs to attach
}
```

**Returns**: Conversation ID, room ID, initial token count

#### `search_conversations`

Search through conversation history with filters.

```typescript
{
  query?: string;           // Search query (semantic or keyword)
  model?: string[];         // Filter by model used
  dateFrom?: string;        // ISO date
  dateTo?: string;
  minMessages?: number;
  maxMessages?: number;
  limit?: number;
}
```

**Returns**: Array of conversations with summaries, metadata

### 3. **Advanced Intelligence Tools**

#### `analyze_memory_patterns`

Analyze user/org memory patterns for insights.

```typescript
{
  analysisType: "topics" | "sentiment" | "entities" | "timeline";
  timeRange?: {
    from: string;
    to: string;
  };
  groupBy?: "day" | "week" | "month";
}
```

**Returns**: Insights, charts data, trends, key findings

#### `optimize_context_window`

Intelligently select the most relevant context for token-limited requests.

```typescript
{
  roomId: string;
  maxTokens: number;        // Token budget for context
  query?: string;           // Current user query for relevance scoring
  preserveRecent?: number;  // Always include N recent messages
}
```

**Returns**: Optimized message list, token count, relevance scores

#### `export_conversation`

Export conversation history in various formats.

```typescript
{
  conversationId: string;
  format: "json" | "markdown" | "txt" | "pdf";
  includeMemories?: boolean;
  includeMetadata?: boolean;
}
```

**Returns**: Download URL, file size, expiration time

#### `clone_conversation`

Duplicate a conversation with optional modifications.

```typescript
{
  conversationId: string;
  newTitle?: string;
  preserveMessages?: boolean;
  preserveMemories?: boolean;
  newModel?: string;
}
```

**Returns**: New conversation ID, cloned message count

## 🏗️ Technical Architecture

### Redis Memory Layer

```typescript
// lib/cache/memory-cache.ts
export class MemoryCache {
  // Hot cache for recent memories (1-24 hour TTL)
  async cacheMemory(key: string, memory: Memory): Promise<void>;

  // Retrieve from cache with fallback to PostgreSQL
  async getMemory(key: string): Promise<Memory | null>;

  // Cache conversation context (room-based)
  async cacheConversationContext(
    roomId: string,
    context: Context
  ): Promise<void>;

  // Bulk operations for performance
  async cacheMemories(memories: Map<string, Memory>): Promise<void>;
  async getMemories(keys: string[]): Promise<Map<string, Memory>>;

  // Cache invalidation
  async invalidateMemory(memoryId: string): Promise<void>;
  async invalidateConversation(roomId: string): Promise<void>;
  async invalidateOrganization(orgId: string): Promise<void>;
}
```

### Cache Key Structure

```typescript
// Memory caching keys
`memory:${organizationId}:${memoryId}` // Individual memory
`memory:${organizationId}:room:${roomId}:recent` // Recent room messages
`memory:${organizationId}:search:${queryHash}` // Search results cache
`memory:${organizationId}:context:${roomId}:${depth}` // Conversation context
`memory:${organizationId}:summary:${roomId}` // Conversation summary
// Analytics & insights caching
`memory:${organizationId}:patterns:${analysisType}` // Pattern analysis
`memory:${organizationId}:topics:${timeRange}`; // Topic extraction
```

### Hybrid Storage Strategy

```
┌─────────────────────────────────────────────────────┐
│                  MCP Client Request                 │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              MCP Server (route.ts)                  │
│  - Authentication (API Key/JWT)                     │
│  - Tool dispatch & validation                       │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│            Memory Service Layer                     │
│  ┌───────────────┐        ┌───────────────┐        │
│  │  Redis Cache  │◄──────►│  PostgreSQL   │        │
│  │  (Hot Layer)  │        │  (Cold Store) │        │
│  │               │        │               │        │
│  │ - Recent msgs │        │ - All history │        │
│  │ - Search cache│        │ - Embeddings  │        │
│  │ - Summaries   │        │ - Full data   │        │
│  │ - TTL: 1-24hr │        │ - Permanent   │        │
│  └───────────────┘        └───────────────┘        │
└─────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              Response Pipeline                      │
│  - Format conversion                                │
│  - Token counting                                   │
│  - Credit tracking                                  │
└─────────────────────────────────────────────────────┘
```

### Read Strategy

1. Check Redis cache first (hot path - <10ms)
2. On cache miss, query PostgreSQL (cold path - 20-100ms)
3. Store result in Redis with appropriate TTL
4. Return to client

### Write Strategy

1. Write to PostgreSQL first (source of truth)
2. Asynchronously update Redis cache
3. Invalidate related caches (room, search results)
4. Emit events for real-time subscribers

## 📊 Data Flow Examples

### Example 1: Saving a Memory

```
User → MCP Client → save_memory tool
  ↓
Validate input & check credits
  ↓
Write to PostgreSQL (memories table)
  ├─→ Generate embedding (if semantic search enabled)
  └─→ Create usage record
  ↓
Update Redis cache
  ├─→ Set `memory:org:memId` (TTL: 24h)
  ├─→ Invalidate `memory:org:room:roomId:recent`
  └─→ Invalidate search caches
  ↓
Return memory ID + metadata
```

### Example 2: Retrieving Conversation Context

```
User → MCP Client → get_conversation_context
  ↓
Check Redis: `memory:org:context:roomId:20`
  ├─→ HIT: Return cached context (<10ms)
  └─→ MISS: Continue to PostgreSQL
        ↓
Query PostgreSQL
  ├─→ Get last 20 messages from conversation_messages
  ├─→ Get relevant memories from memories table
  └─→ Get participant info
        ↓
Enrich context
  ├─→ Calculate token counts
  ├─→ Format messages
  └─→ Attach metadata
        ↓
Cache in Redis (TTL: 5 minutes)
  ↓
Return to client
```

## 🔐 Security & Multi-Tenancy

### Organization Isolation

- All Redis keys prefixed with `memory:${organizationId}:`
- PostgreSQL queries always filtered by `organization_id`
- API key permissions checked for memory operations

### Rate Limiting

- Per-organization limits on memory operations
  - save_memory: 1000/hour
  - retrieve_memories: 5000/hour
  - search: 500/hour
- Redis-backed sliding window (existing infrastructure)

### Data Privacy

- Memories encrypted at rest (PostgreSQL)
- Redis cache respects same privacy rules
- Export operations logged and audited
- GDPR-compliant deletion

## 💰 Credit Costs

| Tool                     | Credit Cost   | Notes                |
| ------------------------ | ------------- | -------------------- |
| save_memory              | 1 credit      | Per memory saved     |
| retrieve_memories        | 0.1 credit    | Per memory retrieved |
| delete_memory            | 0 credits     | Free operation       |
| summarize_conversation   | 10-50 credits | Based on token count |
| get_conversation_context | 0.5 credits   | Per request          |
| create_conversation      | 1 credit      | One-time             |
| search_conversations     | 2 credits     | Per search query     |
| analyze_memory_patterns  | 20 credits    | Heavy computation    |
| optimize_context_window  | 5 credits     | AI-powered selection |
| export_conversation      | 5 credits     | Per export           |
| clone_conversation       | 2 credits     | Per clone            |

## 📈 Performance Targets

| Metric                         | Target   | Current  |
| ------------------------------ | -------- | -------- |
| Memory retrieval (Redis hit)   | <10ms    | N/A      |
| Memory retrieval (PG fallback) | <100ms   | N/A      |
| Context fetch (20 msgs)        | <50ms    | ~200ms   |
| Search query                   | <200ms   | N/A      |
| Cache hit rate                 | >80%     | N/A      |
| Concurrent requests            | 1000/sec | ~100/sec |

## 🧪 Testing Strategy

### Unit Tests

- [ ] Redis cache operations (get/set/delete)
- [ ] Memory service CRUD operations
- [ ] Hybrid storage fallback logic
- [ ] TTL expiration handling
- [ ] Multi-tenant isolation

### Integration Tests

- [ ] MCP tool invocations end-to-end
- [ ] PostgreSQL + Redis consistency
- [ ] Cache invalidation cascades
- [ ] Credit deduction accuracy
- [ ] Rate limiting enforcement

### Load Tests

- [ ] 1000 concurrent memory retrievals
- [ ] Cache stampede protection
- [ ] Redis connection pool limits
- [ ] PostgreSQL query performance
- [ ] Memory leak detection

### E2E Tests

- [ ] MCP Inspector workflow
- [ ] Claude Desktop integration
- [ ] API key authentication
- [ ] Organization switching
- [ ] Error handling & retries

## 📝 Implementation Checklist

### Phase 1: Foundation (Week 1)

- [ ] Create `lib/cache/memory-cache.ts` Redis memory layer
- [ ] Create `lib/services/memory-service.ts` hybrid storage logic
- [ ] Add cache key helper utilities
- [ ] Implement cache invalidation strategy
- [ ] Add monitoring & logging

### Phase 2: Core Memory Tools (Week 2)

- [ ] Implement `save_memory` tool
- [ ] Implement `retrieve_memories` tool
- [ ] Implement `delete_memory` tool
- [ ] Add credit cost tracking
- [ ] Add usage records
- [ ] Write unit tests

### Phase 3: Conversation Tools (Week 3)

- [ ] Implement `get_conversation_context` tool
- [ ] Implement `create_conversation` tool
- [ ] Implement `search_conversations` tool
- [ ] Integrate with existing conversations table
- [ ] Add caching layer
- [ ] Write integration tests

### Phase 4: Advanced Features (Week 4)

- [ ] Implement `summarize_conversation` tool (AI-powered)
- [ ] Implement `analyze_memory_patterns` tool
- [ ] Implement `optimize_context_window` tool
- [ ] Implement `export_conversation` tool
- [ ] Implement `clone_conversation` tool
- [ ] Add analytics tracking

### Phase 5: Polish & Deployment (Week 5)

- [ ] Load testing & optimization
- [ ] Documentation updates (`docs/MCP_MEMORY.md`)
- [ ] API reference generation
- [ ] Example use cases & tutorials
- [ ] Monitoring dashboards
- [ ] Production deployment
- [ ] Announcement & marketing

## 📚 Documentation Deliverables

### 1. `docs/MCP_MEMORY.md`

Complete guide for using memory tools, including:

- Tool reference with examples
- Redis caching strategy
- Performance optimization tips
- Troubleshooting guide

### 2. `docs/MEMORY_ARCHITECTURE.md`

Technical deep-dive:

- Hybrid storage design
- Cache invalidation patterns
- Multi-tenant isolation
- Scaling considerations

### 3. Updated `README.md`

- Add memory tools to feature list
- Update MCP section with new tool count
- Add performance benchmarks

### 4. API Examples

```typescript
// Example: Intelligent context management
const context = await mcpClient.call("get_conversation_context", {
  roomId: "uuid-here",
  depth: 20,
  includeMemories: true,
  format: "json",
});

// Example: Save important info
await mcpClient.call("save_memory", {
  content: "User prefers dark mode and concise responses",
  type: "preference",
  tags: ["ui", "preferences"],
  persistent: true,
});

// Example: Smart context optimization
const optimized = await mcpClient.call("optimize_context_window", {
  roomId: "uuid-here",
  maxTokens: 4000,
  query: "How do I deploy containers?",
  preserveRecent: 5,
});
```

## 🚨 Risks & Mitigations

| Risk                     | Impact | Mitigation                                       |
| ------------------------ | ------ | ------------------------------------------------ |
| Redis cost in production | High   | Implement aggressive TTL, use Redis optimization |
| Cache inconsistency      | Medium | Write-through pattern, event-driven invalidation |
| Memory leaks in Redis    | High   | Monitoring, automated cleanup, TTL enforcement   |
| Performance regression   | Medium | Load testing, rollback plan, feature flags       |
| Credit cost too high     | Medium | Usage analysis, cost optimization, user feedback |

## 🎓 Success Metrics

- [ ] 12+ MCP tools available (currently 4)
- [ ] <50ms average response time for cached queries
- [ ] > 80% cache hit rate after warm-up
- [ ] Zero data consistency issues
- [ ] 10x improvement in conversation context retrieval
- [ ] Positive user feedback from beta testers
- [ ] > 50 active MCP integrations using memory tools

## 🔗 Related Resources

- [Model Context Protocol Spec](https://modelcontextprotocol.io)
- [Upstash Redis Docs](https://docs.upstash.com/redis)
- [ElizaOS Memory System](https://github.com/elizaos/eliza)
- Current MCP implementation: `app/api/mcp/route.ts`
- Existing cache client: `lib/cache/client.ts`
- Conversation schema: `db/schemas/conversations.ts`

## 👥 Stakeholders

- **Engineering**: Full-stack implementation
- **Product**: Feature prioritization, UX
- **DevOps**: Redis infrastructure, monitoring
- **Marketing**: Launch communication
- **Users**: Beta testing, feedback

---

**Next Steps**:

1. Review and approve this ticket
2. Assign to engineering team
3. Create subtasks for each phase
4. Set up project tracking
5. Begin Phase 1 implementation

**Estimated Timeline**: 5 weeks  
**Estimated Effort**: 120-150 hours  
**Priority**: High - Enables powerful MCP ecosystem
