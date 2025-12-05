/**
 * API Call Tracker - Development Only
 * 
 * Comprehensive API call tracking with automatic profiling.
 * Patches fetch() to track all API calls and warn about issues.
 * 
 * Features:
 * - Automatic tracking of all fetch calls
 * - Warns about duplicate/spam calls
 * - Tracks response times
 * - Auto-logs summaries at sensible intervals
 */

interface ApiCallInfo {
  url: string;
  method: string;
  count: number;
  timestamps: number[];
  responseTimes: number[];
  avgResponseTime: number;
  lastBody?: string;
  errors: number;
}

interface GlobalApiStats {
  totalCalls: number;
  totalErrors: number;
  sessionStart: number;
  lastLogTime: number;
  endpointStats: Map<string, ApiCallInfo>;
}

// Global API tracking
const globalApiStats: GlobalApiStats = {
  totalCalls: 0,
  totalErrors: 0,
  sessionStart: Date.now(),
  lastLogTime: Date.now(),
  endpointStats: new Map(),
};

// Configuration
const DUPLICATE_CALL_WINDOW_MS = 500;
const SPAM_THRESHOLD = 3;
const INFINITE_LOOP_THRESHOLD = 10;
const SLOW_API_THRESHOLD_MS = 2000;
const AUTO_LOG_INTERVAL_MS = 30000;

// URLs to skip tracking
const SKIP_PATTERNS = [
  "/api/analytics",
  "vitals.vercel-insights.com",
  "va.vercel-scripts.com",
  "_next/static",
  "favicon.ico",
];

/**
 * Generate a unique key for an API call
 */
function getCallKey(url: string, method: string): string {
  // Normalize URL by removing query params for grouping
  const urlPath = url.split("?")[0];
  return `${method}:${urlPath}`;
}

/**
 * Track an API call
 */
function trackApiCall(
  url: string,
  method: string,
  startTime: number,
  body?: string
): { key: string; info: ApiCallInfo } {
  const key = getCallKey(url, method);
  const now = Date.now();

  globalApiStats.totalCalls += 1;

  // Get or create endpoint info
  if (!globalApiStats.endpointStats.has(key)) {
    globalApiStats.endpointStats.set(key, {
      url: url.split("?")[0],
      method,
      count: 0,
      timestamps: [],
      responseTimes: [],
      avgResponseTime: 0,
      errors: 0,
    });
  }

  const info = globalApiStats.endpointStats.get(key)!;
  info.count += 1;
  info.timestamps.push(now);
  info.lastBody = body;

  // Clean up old timestamps
  info.timestamps = info.timestamps.filter(
    (ts) => now - ts < DUPLICATE_CALL_WINDOW_MS * 2
  );

  // Count recent calls
  const recentCalls = info.timestamps.filter(
    (ts) => now - ts < DUPLICATE_CALL_WINDOW_MS
  ).length;

  // Check for infinite loops
  if (recentCalls >= INFINITE_LOOP_THRESHOLD) {
    console.error(
      `🚨 [API] POTENTIAL INFINITE LOOP`,
      `\n  ${method} ${url}`,
      `\n  ${recentCalls} calls in ${DUPLICATE_CALL_WINDOW_MS}ms`,
      `\n  Check useEffect dependencies or state update loops`
    );
    info.timestamps = [];
  } else if (recentCalls >= SPAM_THRESHOLD) {
    console.warn(
      `🔁 [API] Duplicate calls detected`,
      `\n  ${method} ${url}`,
      `\n  ${recentCalls} calls in ${DUPLICATE_CALL_WINDOW_MS}ms`,
      `\n  Consider using useDedupedFetch() or request caching`
    );
  }

  return { key, info };
}

/**
 * Track API response
 */
function trackApiResponse(
  key: string,
  startTime: number,
  ok: boolean
): void {
  const info = globalApiStats.endpointStats.get(key);
  if (!info) return;

  const responseTime = Date.now() - startTime;
  info.responseTimes.push(responseTime);
  
  // Keep only last 20 response times
  if (info.responseTimes.length > 20) {
    info.responseTimes.shift();
  }
  
  info.avgResponseTime = 
    info.responseTimes.reduce((a, b) => a + b, 0) / info.responseTimes.length;

  if (!ok) {
    info.errors += 1;
    globalApiStats.totalErrors += 1;
  }

  // Warn about slow APIs
  if (responseTime > SLOW_API_THRESHOLD_MS) {
    console.warn(
      `🐢 [API] Slow response`,
      `\n  ${info.method} ${info.url}`,
      `\n  ${responseTime}ms (threshold: ${SLOW_API_THRESHOLD_MS}ms)`
    );
  }
}

/**
 * Get API statistics
 */
export function getApiStats(): GlobalApiStats {
  return {
    ...globalApiStats,
    endpointStats: new Map(globalApiStats.endpointStats),
  };
}

/**
 * Reset API tracking
 */
export function resetApiStats(): void {
  globalApiStats.totalCalls = 0;
  globalApiStats.totalErrors = 0;
  globalApiStats.sessionStart = Date.now();
  globalApiStats.lastLogTime = Date.now();
  globalApiStats.endpointStats.clear();
}

/**
 * Log API summary to console
 */
export function logApiSummary(): void {
  if (process.env.NODE_ENV !== "development") return;

  const sessionDuration = ((Date.now() - globalApiStats.sessionStart) / 1000).toFixed(1);
  const sortedByCount = Array.from(globalApiStats.endpointStats.entries())
    .sort(([, a], [, b]) => b.count - a.count);

  if (sortedByCount.length === 0) {
    console.log("📡 [API] No API calls tracked yet.");
    return;
  }

  const errorRate = globalApiStats.totalCalls > 0
    ? ((globalApiStats.totalErrors / globalApiStats.totalCalls) * 100).toFixed(1)
    : "0";

  console.group(`📡 API Summary (${sessionDuration}s session, ${globalApiStats.totalCalls} calls, ${errorRate}% errors)`);

  // Most called endpoints
  console.group("🔝 Most Called Endpoints");
  sortedByCount.slice(0, 10).forEach(([, info], i) => {
    const status = info.count > 20 ? "🔴" : info.count > 10 ? "🟡" : "🟢";
    const errorInfo = info.errors > 0 ? ` (${info.errors} errors)` : "";
    console.log(
      `  ${i + 1}. ${status} ${info.method} ${info.url}: ${info.count} calls${errorInfo}`
    );
  });
  console.groupEnd();

  // Slowest endpoints
  const slowest = [...sortedByCount]
    .filter(([, info]) => info.avgResponseTime > 100)
    .sort(([, a], [, b]) => b.avgResponseTime - a.avgResponseTime)
    .slice(0, 5);

  if (slowest.length > 0) {
    console.group("🐢 Slowest Endpoints (avg response time)");
    slowest.forEach(([, info]) => {
      const status = info.avgResponseTime > 2000 ? "🔴" : info.avgResponseTime > 500 ? "🟡" : "🟢";
      console.log(
        `  ${status} ${info.method} ${info.url}: ${info.avgResponseTime.toFixed(0)}ms avg`
      );
    });
    console.groupEnd();
  }

  // Endpoints with errors
  const withErrors = sortedByCount.filter(([, info]) => info.errors > 0);
  if (withErrors.length > 0) {
    console.group("❌ Endpoints with Errors");
    withErrors.forEach(([, info]) => {
      const errorRate = ((info.errors / info.count) * 100).toFixed(0);
      console.log(
        `  🔴 ${info.method} ${info.url}: ${info.errors}/${info.count} failed (${errorRate}%)`
      );
    });
    console.groupEnd();
  }

  console.groupEnd();
  globalApiStats.lastLogTime = Date.now();
}

/**
 * Check if we should auto-log
 */
export function shouldAutoLog(): boolean {
  return Date.now() - globalApiStats.lastLogTime >= AUTO_LOG_INTERVAL_MS;
}

// Patch global fetch in development mode
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const originalFetch = window.fetch;
  
  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = typeof input === "string" 
      ? input 
      : input instanceof URL 
        ? input.toString() 
        : input.url;
    const method = init?.method || "GET";
    const body = init?.body ? String(init.body) : undefined;

    // Skip certain URLs
    if (SKIP_PATTERNS.some((pattern) => url.includes(pattern))) {
      return originalFetch.call(window, input, init);
    }

    const startTime = Date.now();
    const { key } = trackApiCall(url, method, startTime, body);

    try {
      const response = await originalFetch.call(window, input, init);
      trackApiResponse(key, startTime, response.ok);
      return response;
    } catch (error) {
      trackApiResponse(key, startTime, false);
      throw error;
    }
  };

  // Expose to window
  const win = window as Window & {
    __apiStats__?: () => GlobalApiStats;
    __logApiSummary__?: () => void;
    __resetApiStats__?: () => void;
  };
  win.__apiStats__ = getApiStats;
  win.__logApiSummary__ = logApiSummary;
  win.__resetApiStats__ = resetApiStats;
}
