import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import * as schema from "./schemas";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

type Database = NodePgDatabase<typeof schema> | NeonDatabase<typeof schema>;

let _db: Database | null = null;
let _instrumentationEnabled: boolean | null = null;
const SLOW_QUERY_THRESHOLD_MS = parseInt(
  process.env.SLOW_QUERY_THRESHOLD_MS || "50",
  10,
);

function isNeonDatabase(url: string): boolean {
  return url.includes("neon.tech") || url.includes("neon.database");
}

export function isInstrumentationEnabled(): boolean {
  if (_instrumentationEnabled !== null) return _instrumentationEnabled;

  if (process.env.DB_INSTRUMENTATION_DISABLED === "true") {
    _instrumentationEnabled = false;
    return false;
  }

  const env = process.env.NODE_ENV;
  const vercelEnv = process.env.VERCEL_ENV;

  if (env === "production" && vercelEnv === "production") {
    _instrumentationEnabled = false;
    return false;
  }

  _instrumentationEnabled =
    env === "development" ||
    vercelEnv === "preview" ||
    vercelEnv === "development" ||
    process.env.DB_INSTRUMENTATION_ENABLED === "true";

  return _instrumentationEnabled;
}

function handleSlowQuery(sqlText: string, durationMs: number): void {
  if (process.env.SLOW_QUERY_LOGGING_DISABLED === "true") return;

  const preview = sqlText.substring(0, 120).replace(/\s+/g, " ");
  console.warn(
    `[SlowQuery] ${durationMs}ms | ${preview}${sqlText.length > 120 ? "..." : ""}`,
  );

  import("@/lib/db/slow-query-store")
    .then(({ recordSlowQuery }) => recordSlowQuery(sqlText, durationMs))
    .catch((e) => console.warn("[DB] slow-query-store import failed:", e));

  if (durationMs >= 200) {
    import("@/lib/db/query-alerting")
      .then(({ sendSlowQueryAlert, getAlertSeverity }) => {
        const severity = getAlertSeverity(durationMs);
        if (severity) {
          sendSlowQueryAlert({
            query: sqlText,
            durationMs,
            timestamp: new Date(),
            severity,
          });
        }
      })
      .catch((e) => console.warn("[DB] query-alerting import failed:", e));
  }
}

function wrapWithTiming<T>(
  fn: () => Promise<T>,
  getSql: () => string,
): Promise<T> {
  if (!isInstrumentationEnabled()) return fn();

  const start = performance.now();
  return fn().finally(() => {
    const duration = Math.round(performance.now() - start);
    if (duration >= SLOW_QUERY_THRESHOLD_MS) {
      handleSlowQuery(getSql(), duration);
    }
  });
}

function extractSql(sqlArg: unknown, fallback = "[unknown]"): string {
  if (typeof sqlArg !== "object" || sqlArg === null) return fallback;

  const obj = sqlArg as Record<string, unknown>;

  if (typeof obj.sql === "string") return obj.sql;

  if (typeof obj.toSQL === "function") {
    try {
      const result = (obj.toSQL as () => { sql?: string })();
      if (result?.sql) return result.sql;
    } catch {}
  }

  if (typeof obj.getSQL === "function") {
    try {
      const sqlObj = (obj.getSQL as () => Record<string, unknown>)();
      if (sqlObj) return extractSql(sqlObj, fallback);
    } catch {}
  }

  if (Array.isArray(obj.queryChunks)) {
    const parts: string[] = [];
    for (const c of obj.queryChunks) {
      if (c == null) {
        parts.push("?");
      } else if (
        typeof c === "string" ||
        typeof c === "number" ||
        typeof c === "boolean"
      ) {
        parts.push("?");
      } else if (typeof c === "object") {
        const chunk = c as Record<string, unknown>;
        if (Array.isArray(chunk.value)) {
          parts.push(chunk.value.join(""));
        } else if (typeof chunk.value === "string") {
          parts.push(chunk.value);
        } else if (chunk.value !== undefined) {
          parts.push("?");
        }
      }
    }
    if (parts.length > 0) return parts.join("");
  }

  return fallback;
}

function instrumentQueryBuilder<T extends object>(
  target: T,
  methodName: string,
): T {
  if (!isInstrumentationEnabled()) return target;

  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop);
      if (typeof value !== "function") return value;

      return function (...args: unknown[]) {
        const result = Reflect.apply(value, obj, args);

        if (result instanceof Promise) {
          const sqlText = extractSql(obj, `[${methodName}]`);
          return wrapWithTiming(
            () => result,
            () => sqlText,
          );
        }

        if (result && typeof result === "object") {
          return instrumentQueryBuilder(result as object, methodName);
        }

        return result;
      };
    },
  });
}

function getDb(): Database {
  if (_db) return _db;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  if (isInstrumentationEnabled()) {
    console.info(
      `[DB] ✓ Query instrumentation ENABLED (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`,
    );
    import("@/lib/db/query-alerting")
      .then(({ checkAlertConfig }) => checkAlertConfig())
      .catch((e: Error) =>
        console.debug("[DB] Alert config check failed:", e.message),
      );
  }

  if (isNeonDatabase(url)) {
    if (typeof WebSocket === "undefined") neonConfig.webSocketConstructor = ws;
    _db = drizzleNeon(new NeonPool({ connectionString: url }), {
      schema,
    }) as Database;
  } else {
    _db = drizzleNode(new PgPool({ connectionString: url }), {
      schema,
    }) as Database;
  }

  return _db;
}

export const db = new Proxy({} as Database, {
  get: (_, prop) => {
    const database = getDb();
    const value = database[prop as keyof typeof database];

    if (typeof value !== "function") return value;

    return function (...args: unknown[]) {
      // For execute(), wrap timing AROUND the query execution
      if (prop === "execute" && args[0]) {
        const sqlText = extractSql(args[0]);
        return wrapWithTiming(
          () =>
            (value as (...a: unknown[]) => Promise<unknown>).apply(
              database,
              args,
            ),
          () => sqlText,
        );
      }

      const result = (value as (...a: unknown[]) => unknown).apply(
        database,
        args,
      );

      if (
        result &&
        typeof result === "object" &&
        !(result instanceof Promise)
      ) {
        return instrumentQueryBuilder(result as object, String(prop));
      }

      if (result instanceof Promise) {
        return wrapWithTiming(
          () => result,
          () => `[${String(prop)}]`,
        );
      }

      return result;
    };
  },
});

export type { Database };
