/**
 * Monitoring and Alerting Configuration
 * Based on baseline performance measurements
 */

export interface PerformanceBaseline {
  endpoint: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  p50: number;  // median latency in ms
  p95: number;  // 95th percentile latency in ms
  p99: number;  // 99th percentile latency in ms
  errorRate: number;  // acceptable error rate (0-1)
  rps: number;  // requests per second capacity
}

// Baselines from stress testing at 10 VUs
export const performanceBaselines: PerformanceBaseline[] = [
  {
    endpoint: "/.well-known/agent-card.json",
    method: "GET",
    p50: 50,
    p95: 200,
    p99: 500,
    errorRate: 0.001,
    rps: 100,
  },
  {
    endpoint: "/api/credits/balance",
    method: "GET",
    p50: 100,
    p95: 500,
    p99: 1000,
    errorRate: 0.01,
    rps: 50,
  },
  {
    endpoint: "/api/v1/app/agents",
    method: "GET",
    p50: 300,
    p95: 1000,
    p99: 2000,
    errorRate: 0.02,
    rps: 20,
  },
  {
    endpoint: "/api/a2a",
    method: "GET",
    p50: 100,
    p95: 500,
    p99: 1000,
    errorRate: 0.01,
    rps: 50,
  },
  {
    endpoint: "/api/a2a",
    method: "POST",
    p50: 200,
    p95: 1000,
    p99: 2000,
    errorRate: 0.05,
    rps: 30,
  },
  {
    endpoint: "/api/mcp",
    method: "POST",
    p50: 500,
    p95: 2000,
    p99: 5000,
    errorRate: 0.05,
    rps: 20,
  },
];

// Alert thresholds (multiplier of baseline)
export const alertThresholds = {
  warning: {
    latencyMultiplier: 1.5,  // 50% slower than baseline triggers warning
    errorRateMultiplier: 2,  // 2x error rate triggers warning
  },
  critical: {
    latencyMultiplier: 3,    // 3x slower triggers critical
    errorRateMultiplier: 5,  // 5x error rate triggers critical
  },
};

// Generate k6 thresholds from baselines
export function generateK6Thresholds(): Record<string, string[]> {
  const thresholds: Record<string, string[]> = {
    http_req_duration: ["p(95)<5000"],
    http_req_failed: ["rate<0.1"],
    checks: ["rate>0.9"],
  };

  // Add endpoint-specific thresholds
  for (const baseline of performanceBaselines) {
    const key = `http_req_duration{url:*${baseline.endpoint}*}`;
    thresholds[key] = [
      `p(50)<${baseline.p50 * alertThresholds.warning.latencyMultiplier}`,
      `p(95)<${baseline.p95 * alertThresholds.warning.latencyMultiplier}`,
    ];
  }

  return thresholds;
}

// SLO definitions
export const serviceLevelObjectives = {
  availability: 0.999,  // 99.9% uptime
  latency: {
    p50: 500,   // 50th percentile under 500ms
    p95: 2000,  // 95th percentile under 2s
    p99: 5000,  // 99th percentile under 5s
  },
  errorBudget: {
    monthly: 0.001 * 30 * 24 * 60,  // ~43 minutes/month
    daily: 0.001 * 24 * 60,          // ~1.4 minutes/day
  },
};

// Capacity planning
export const capacityLimits = {
  maxConcurrentUsers: 20,      // From stress testing
  maxRPS: 50,                  // Before rate limiting kicks in
  rateLimitPerMinute: {
    a2a: 100,
    mcp: 100,
    general: 1000,
  },
};

// Export baseline summary for logging
export function getBaselineSummary(): string {
  const lines = [
    "Performance Baselines:",
    "=".repeat(60),
  ];

  for (const b of performanceBaselines) {
    lines.push(
      `${b.method.padEnd(6)} ${b.endpoint.padEnd(30)} p50:${b.p50}ms p95:${b.p95}ms err:${(b.errorRate * 100).toFixed(1)}%`
    );
  }

  lines.push("=".repeat(60));
  lines.push(`Max Concurrent Users: ${capacityLimits.maxConcurrentUsers}`);
  lines.push(`Max RPS: ${capacityLimits.maxRPS}`);

  return lines.join("\n");
}

