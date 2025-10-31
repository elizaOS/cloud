export const CacheKeys = {
  org: {
    data: (orgId: string) => `org:${orgId}:data:v1`,
    credits: (orgId: string) => `org:${orgId}:credits:v1`,
    dashboard: (orgId: string) => `org:${orgId}:dashboard:v1`,
    pattern: (orgId: string) => `org:${orgId}:*`,
  },
  analytics: {
    overview: (orgId: string, timeRange: "daily" | "weekly" | "monthly") =>
      `analytics:overview:${orgId}:${timeRange}:v1`,
    breakdown: (orgId: string, dimension: string, range: string) =>
      `analytics:breakdown:${orgId}:${dimension}:${range}:v1`,
    stats: (orgId: string, dateRange: string) =>
      `analytics:stats:${orgId}:${dateRange}:v1`,
    userBreakdown: (orgId: string, params: string) =>
      `analytics:userbreakdown:${orgId}:${params}:v1`,
    projections: (orgId: string, daysAhead: number) =>
      `analytics:projections:${orgId}:${daysAhead}:v1`,
    timeSeries: (
      orgId: string,
      granularity: string,
      start: string,
      end: string,
    ) => `analytics:timeseries:${orgId}:${granularity}:${start}:${end}:v1`,
    providerBreakdown: (orgId: string, start: string, end: string) =>
      `analytics:provider:${orgId}:${start}:${end}:v1`,
    modelBreakdown: (orgId: string, start: string, end: string) =>
      `analytics:model:${orgId}:${start}:${end}:v1`,
    pattern: (orgId: string) => `analytics:*:${orgId}:*`,
  },
  apiKey: {
    validation: (keyHash: string) => `apikey:validation:${keyHash}:v1`,
    pattern: () => `apikey:*`,
  },
  user: {
    byEmail: (email: string) => `user:email:${email}:v1`,
    pattern: () => `user:*`,
  },
  memory: {
    item: (orgId: string, memoryId: string) =>
      `memory:${orgId}:${memoryId}:v1`,
    roomRecent: (orgId: string, roomId: string) =>
      `memory:${orgId}:room:${roomId}:recent:v1`,
    roomContext: (orgId: string, roomId: string, depth: number) =>
      `memory:${orgId}:room:${roomId}:context:${depth}:v1`,
    search: (orgId: string, queryHash: string) =>
      `memory:${orgId}:search:${queryHash}:v1`,
    conversationContext: (orgId: string, convId: string, depth: number) =>
      `memory:${orgId}:conv:${convId}:${depth}:v1`,
    conversationSummary: (orgId: string, convId: string) =>
      `memory:${orgId}:conv:${convId}:summary:v1`,
    patterns: (orgId: string, analysisType: string) =>
      `memory:${orgId}:patterns:${analysisType}:v1`,
    topics: (orgId: string, timeRange: string) =>
      `memory:${orgId}:topics:${timeRange}:v1`,
    orgPattern: (orgId: string) => `memory:${orgId}:*`,
    roomPattern: (orgId: string, roomId: string) =>
      `memory:${orgId}:room:${roomId}:*`,
  },
  agent: {
    roomContext: (roomId: string) => `agent:room:${roomId}:context:v1`,
    characterData: (agentId: string) => `agent:${agentId}:character:v1`,
    userSession: (entityId: string) => `agent:user:${entityId}:session:v1`,
    agentList: (orgId: string, filterHash: string) =>
      `agent:list:${orgId}:${filterHash}:v1`,
    agentStats: (agentId: string) => `agent:stats:${agentId}:v1`,
  },
  container: {
    list: (orgId: string) => `containers:list:${orgId}:v1`,
    logs: (containerId: string) => `container:logs:${containerId}:recent:v1`,
    metrics: (containerId: string, period: string) =>
      `container:metrics:${containerId}:${period}:v1`,
  },
  eliza: {
    roomCharacter: (roomId: string) => `eliza:room:${roomId}:character:v1`,
    orgBalance: (orgId: string) => `eliza:org:${orgId}:balance:v1`,
    pattern: () => `eliza:*`,
  },
} as const;

export const CacheTTL = {
  org: {
    data: 300, // 5 minutes (was 60s)
    credits: 60, // 1 minute (was 15s)
    dashboard: 300, // 5 minutes (was 90s) - stale after 180s
  },
  analytics: {
    overview: {
      daily: 300, // 5 minutes (was 120s)
      weekly: 600, // 10 minutes (was 180s)
      monthly: 1800, // 30 minutes (was 300s)
    },
    breakdown: 600, // 10 minutes (was 180s)
    stats: 600, // 10 minutes (was 300s)
    userBreakdown: 1800, // 30 minutes (was 600s)
    projections: 600, // 10 minutes (was 300s)
    timeSeries: 600, // 10 minutes (was 180s)
    providerBreakdown: 600, // 10 minutes (was 180s)
    modelBreakdown: 600, // 10 minutes (was 180s)
  },
  apiKey: {
    validation: 600, // 10 minutes (was 300s)
  },
  user: {
    byEmail: 600, // 10 minutes (was 300s)
  },
  memory: {
    item: 1440, // 24 minutes (unchanged - memory is critical)
    roomRecent: 300, // 5 minutes
    roomContext: 300, // 5 minutes
    conversationContext: 300, // 5 minutes
    conversationSummary: 600, // 10 minutes
    search: 300, // 5 minutes
    patterns: 600, // 10 minutes
    topics: 600, // 10 minutes
  },
  agent: {
    roomContext: 300, // 5 minutes
    characterData: 3600, // 1 hour
    userSession: 300, // 5 minutes
    agentList: 3600, // 1 hour
    agentStats: 300, // 5 minutes
  },
  container: {
    list: 60, // 1 minute (was 30s)
    logs: 60, // 1 minute (was 30s)
    metrics: 300, // 5 minutes
  },
  eliza: {
    roomCharacter: 600, // 10 minutes - room character mappings rarely change
    orgBalance: 30, // 30 seconds - balance changes frequently but we can tolerate slight staleness
  },
} as const;

// Stale-while-revalidate thresholds (when to consider cache stale but still serve it)
export const CacheStaleTTL = {
  org: {
    dashboard: 180, // Serve stale after 3 minutes, revalidate in background
  },
  analytics: {
    overview: 180, // Serve stale after 3 minutes
    breakdown: 300, // Serve stale after 5 minutes
    stats: 300, // Serve stale after 5 minutes
  },
} as const;
