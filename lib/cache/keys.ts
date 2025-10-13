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
    projections: (orgId: string, daysAhead: number) =>
      `analytics:projections:${orgId}:${daysAhead}:v1`,
    pattern: (orgId: string) => `analytics:*:${orgId}:*`,
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
    projections: 300,
  },
} as const;
