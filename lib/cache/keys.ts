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
} as const;

export const CacheTTL = {
  org: {
    data: 60,
    credits: 15,
    dashboard: 90,
  },
  analytics: {
    overview: {
      daily: 120,
      weekly: 180,
      monthly: 300,
    },
    breakdown: 180,
    stats: 300,
    userBreakdown: 600,
    projections: 300,
    timeSeries: 180,
    providerBreakdown: 180,
    modelBreakdown: 180,
  },
  apiKey: {
    validation: 300,
  },
  user: {
    byEmail: 300,
  },
  memory: {
    item: 1440,
    roomRecent: 300,
    roomContext: 300,
    conversationContext: 300,
    conversationSummary: 600,
    search: 300,
    patterns: 600,
    topics: 600,
  },
  agent: {
    roomContext: 300, // 5 minutes
    characterData: 3600, // 1 hour
    userSession: 300, // 5 minutes
    agentList: 3600, // 1 hour
    agentStats: 300, // 5 minutes
  },
  container: {
    list: 30, // 30 seconds
    logs: 30, // 30 seconds
    metrics: 300, // 5 minutes
  },
} as const;
