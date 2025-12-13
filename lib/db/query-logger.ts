/**
 * Query Logger - Database Performance Instrumentation
 * 
 * Wraps Drizzle database operations to track query execution times.
 * 
 * Key behaviors:
 * - ONLY active in development and staging environments
 * - Zero CPU overhead in production (completely disabled)
 * - Logs queries exceeding 50ms threshold
 * - Sends real-time alerts for queries >200ms
 * - Stores data in memory, Redis, and PostgreSQL
 */

import { logger } from "@/lib/utils/logger";
import { recordSlowQuery, hashQuery } from "./slow-query-store";
import { 
  checkAlertConfig, 
  sendSlowQueryAlert, 
  getAlertSeverity, 
  ALERT_THRESHOLDS 
} from "./query-alerting";

/** Slow query threshold in milliseconds */
const SLOW_QUERY_THRESHOLD_MS = parseInt(
  process.env.SLOW_QUERY_THRESHOLD_MS || "50",
  10
);

/** Check if instrumentation should be active */
const isInstrumentationEnabled = (): boolean => {
  const env = process.env.NODE_ENV;
  const vercelEnv = process.env.VERCEL_ENV;
  
  // Explicitly disabled
  if (process.env.DB_INSTRUMENTATION_DISABLED === "true") {
    return false;
  }
  
  // Production = disabled (zero CPU impact)
  if (env === "production" && vercelEnv === "production") {
    return false;
  }
  
  // Development, staging, preview = enabled
  return env === "development" || 
         vercelEnv === "preview" || 
         vercelEnv === "development" ||
         process.env.DB_INSTRUMENTATION_ENABLED === "true";
};

/** Cached enabled state */
let _instrumentationEnabled: boolean | null = null;

/**
 * Returns whether instrumentation is currently enabled.
 * Caches the result for performance.
 */
export function isEnabled(): boolean {
  if (_instrumentationEnabled === null) {
    _instrumentationEnabled = isInstrumentationEnabled();
    
    if (_instrumentationEnabled) {
      logger.info(
        `[QueryLogger] ✓ Database instrumentation ENABLED (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`
      );
      checkAlertConfig();
    }
  }
  return _instrumentationEnabled;
}

/** Query timing context */
interface QueryContext {
  sql: string;
  startTime: number;
  sourceFile?: string;
  sourceFunction?: string;
}

/** Active query timers */
const activeQueries = new Map<symbol, QueryContext>();

/**
 * Starts timing a query.
 * Returns a token to use when ending the timing.
 */
export function startQueryTimer(
  sql: string,
  sourceFile?: string,
  sourceFunction?: string
): symbol | null {
  if (!isEnabled()) return null;

  const token = Symbol("query");
  activeQueries.set(token, {
    sql,
    startTime: performance.now(),
    sourceFile,
    sourceFunction,
  });

  return token;
}

/**
 * Ends timing for a query and records if slow.
 */
export async function endQueryTimer(token: symbol | null): Promise<number> {
  if (token === null || !isEnabled()) return 0;

  const context = activeQueries.get(token);
  if (!context) return 0;

  activeQueries.delete(token);

  const durationMs = Math.round(performance.now() - context.startTime);

  // Only track slow queries
  if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
    // Log to console in development
    const queryPreview = context.sql.substring(0, 100).replace(/\s+/g, " ");
    logger.warn(
      `[SlowQuery] ${durationMs}ms | ${queryPreview}${context.sql.length > 100 ? "..." : ""}`
    );

    // Record to stores (async, don't block)
    recordSlowQuery(
      context.sql,
      durationMs,
      context.sourceFile,
      context.sourceFunction
    );

    // Send alert if exceeds warning threshold
    const severity = getAlertSeverity(durationMs);
    if (severity) {
      sendSlowQueryAlert({
        query: context.sql,
        durationMs,
        sourceFile: context.sourceFile,
        sourceFunction: context.sourceFunction,
        timestamp: new Date(),
        severity,
      });
    }
  }

  return durationMs;
}

/**
 * Wraps an async function to track its execution time.
 * Used for wrapping database operations.
 */
export function wrapQuery<T>(
  sql: string,
  fn: () => Promise<T>,
  sourceFile?: string,
  sourceFunction?: string
): Promise<T> {
  if (!isEnabled()) {
    return fn();
  }

  const token = startQueryTimer(sql, sourceFile, sourceFunction);
  
  return fn().finally(() => {
    endQueryTimer(token);
  });
}

/**
 * Creates a proxy that wraps all async methods with query timing.
 * Used to instrument the Drizzle database instance.
 */
export function createInstrumentedProxy<T extends object>(target: T): T {
  if (!isEnabled()) {
    return target;
  }

  return new Proxy(target, {
    get(obj, prop) {
      const value = obj[prop as keyof T];
      
      // Don't wrap non-functions or internal properties
      if (typeof value !== "function" || typeof prop === "symbol") {
        return value;
      }

      // Wrap functions that return promises (async DB operations)
      return function (this: T, ...args: unknown[]) {
        const result = (value as (...args: unknown[]) => unknown).apply(obj, args);
        
        // Only wrap if result is a promise-like
        if (result && typeof result === "object" && "then" in result) {
          const sqlText = extractSqlFromArgs(prop.toString(), args);
          if (sqlText) {
            const token = startQueryTimer(sqlText, undefined, prop.toString());
            return (result as Promise<unknown>).finally(() => {
              endQueryTimer(token);
            });
          }
        }
        
        return result;
      };
    },
  });
}

/**
 * Attempts to extract SQL from Drizzle method arguments.
 */
function extractSqlFromArgs(methodName: string, args: unknown[]): string | null {
  // For raw SQL executions
  if (methodName === "execute" && args[0]) {
    const sqlArg = args[0];
    if (typeof sqlArg === "string") {
      return sqlArg;
    }
    // Drizzle SQL template
    if (sqlArg && typeof sqlArg === "object" && "queryChunks" in sqlArg) {
      return (sqlArg as { queryChunks: string[] }).queryChunks.join("");
    }
  }

  // For query builder methods, we can't easily extract SQL
  // The SQL is only generated when the query is executed
  return `[${methodName}]`;
}

/**
 * Gets current instrumentation configuration.
 */
export function getConfig(): {
  enabled: boolean;
  threshold: number;
  environment: string;
} {
  return {
    enabled: isEnabled(),
    threshold: SLOW_QUERY_THRESHOLD_MS,
    environment: process.env.NODE_ENV || "unknown",
  };
}

/**
 * Logs the current slow query statistics.
 */
export function logStats(): void {
  if (!isEnabled()) {
    console.log("[QueryLogger] Instrumentation is disabled");
    return;
  }

  // Import dynamically to avoid circular dependency
  import("./slow-query-store").then(({ getSlowQueryStats, getTopSlowQueries }) => {
    const stats = getSlowQueryStats();
    const topQueries = getTopSlowQueries(5);

    console.log("\n" + "=".repeat(80));
    console.log("📊 SLOW QUERY STATISTICS (Current Session)");
    console.log("=".repeat(80));
    console.log(`Total unique slow queries: ${stats.totalQueries}`);
    console.log(`Total slow query calls: ${stats.totalCalls}`);
    console.log(`Average duration: ${stats.avgDuration.toFixed(2)}ms`);
    console.log(`Max duration: ${stats.maxDuration}ms`);
    console.log("\nTop 5 slowest queries:");
    
    for (let i = 0; i < topQueries.length; i++) {
      const q = topQueries[i];
      console.log(`\n${i + 1}. Avg: ${q.avgDurationMs.toFixed(2)}ms | Calls: ${q.callCount}`);
      console.log(`   ${q.sqlText.substring(0, 100)}${q.sqlText.length > 100 ? "..." : ""}`);
    }
    
    console.log("\n" + "=".repeat(80));
  });
}

