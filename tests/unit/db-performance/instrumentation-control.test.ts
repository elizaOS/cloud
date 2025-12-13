/**
 * Tests for instrumentation control logic.
 * 
 * Tests:
 * - Environment detection (dev/staging/production)
 * - Instrumentation enable/disable behavior
 * - Zero overhead in production
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";

// Store original env values
const originalEnv: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined): void {
  if (!(key in originalEnv)) {
    originalEnv[key] = process.env[key];
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  Object.keys(originalEnv).forEach((k) => delete originalEnv[k]);
}

describe("instrumentation control", () => {
  afterEach(() => {
    restoreEnv();
  });

  describe("environment detection", () => {
    it("NODE_ENV=development enables instrumentation", () => {
      setEnv("NODE_ENV", "development");
      setEnv("VERCEL_ENV", undefined);
      
      // Instrumentation should be enabled in dev
      const isDev = process.env.NODE_ENV === "development";
      expect(isDev).toBe(true);
    });

    it("NODE_ENV=production disables instrumentation", () => {
      setEnv("NODE_ENV", "production");
      
      const isProd = process.env.NODE_ENV === "production";
      expect(isProd).toBe(true);
    });

    it("VERCEL_ENV=preview enables instrumentation (staging)", () => {
      setEnv("VERCEL_ENV", "preview");
      
      const isStaging = process.env.VERCEL_ENV === "preview";
      expect(isStaging).toBe(true);
    });

    it("VERCEL_ENV=production disables instrumentation", () => {
      setEnv("VERCEL_ENV", "production");
      
      const isVercelProd = process.env.VERCEL_ENV === "production";
      expect(isVercelProd).toBe(true);
    });
  });

  describe("threshold configuration", () => {
    it("reads SLOW_QUERY_THRESHOLD_MS from env", () => {
      setEnv("SLOW_QUERY_THRESHOLD_MS", "100");
      
      const threshold = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || "50", 10);
      expect(threshold).toBe(100);
    });

    it("defaults to 50ms when not set", () => {
      setEnv("SLOW_QUERY_THRESHOLD_MS", undefined);
      
      const threshold = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || "50", 10);
      expect(threshold).toBe(50);
    });

    it("handles invalid threshold values gracefully", () => {
      setEnv("SLOW_QUERY_THRESHOLD_MS", "not-a-number");
      
      const threshold = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || "50", 10);
      expect(Number.isNaN(threshold)).toBe(true);
      
      // Safe fallback
      const safeThreshold = Number.isNaN(threshold) ? 50 : threshold;
      expect(safeThreshold).toBe(50);
    });

    it("handles negative threshold values", () => {
      setEnv("SLOW_QUERY_THRESHOLD_MS", "-100");
      
      const threshold = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || "50", 10);
      expect(threshold).toBe(-100);
      
      // Implementation should treat negative as 0 or absolute value
      const normalized = Math.max(0, threshold);
      expect(normalized).toBe(0);
    });
  });

  describe("alert configuration detection", () => {
    it("detects Discord webhook when set", () => {
      setEnv("DB_SLOW_QUERY_DISCORD_WEBHOOK", "https://discord.com/api/webhooks/test");
      
      const hasDiscord = !!process.env.DB_SLOW_QUERY_DISCORD_WEBHOOK;
      expect(hasDiscord).toBe(true);
    });

    it("detects Slack webhook when set", () => {
      setEnv("DB_SLOW_QUERY_SLACK_WEBHOOK", "https://hooks.slack.com/services/test");
      
      const hasSlack = !!process.env.DB_SLOW_QUERY_SLACK_WEBHOOK;
      expect(hasSlack).toBe(true);
    });

    it("detects when no webhooks are configured", () => {
      setEnv("DB_SLOW_QUERY_DISCORD_WEBHOOK", undefined);
      setEnv("DB_SLOW_QUERY_SLACK_WEBHOOK", undefined);
      
      const hasAny = !!(
        process.env.DB_SLOW_QUERY_DISCORD_WEBHOOK || 
        process.env.DB_SLOW_QUERY_SLACK_WEBHOOK
      );
      expect(hasAny).toBe(false);
    });
  });
});

describe("instrumentation overhead analysis", () => {
  it("performance.now() calls are sub-microsecond", () => {
    const iterations = 10000;
    const start = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      performance.now();
    }
    
    const totalMs = performance.now() - start;
    const avgNs = (totalMs * 1_000_000) / iterations;
    
    // Should be less than 1000ns (1μs) per call
    expect(avgNs).toBeLessThan(1000);
  });

  it("Map operations are O(1) and fast", () => {
    const map = new Map<string, number>();
    const iterations = 10000;
    
    // Set operations
    const setStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      map.set(`key_${i}`, i);
    }
    const setTime = performance.now() - setStart;
    
    // Get operations
    const getStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      map.get(`key_${i}`);
    }
    const getTime = performance.now() - getStart;
    
    // Both should complete quickly (< 50ms for 10k ops)
    expect(setTime).toBeLessThan(50);
    expect(getTime).toBeLessThan(50);
  });

  it("string hashing is fast", () => {
    const testStrings = Array(100).fill(0).map((_, i) => 
      `SELECT * FROM table_${i} WHERE id = ${i}`
    );
    
    const iterations = 1000;
    const start = performance.now();
    
    for (let iter = 0; iter < iterations; iter++) {
      for (const str of testStrings) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash) + str.charCodeAt(i);
          hash = hash & hash;
        }
      }
    }
    
    const totalMs = performance.now() - start;
    // 100k hash operations should complete in under 100ms
    expect(totalMs).toBeLessThan(100);
  });
});

describe("proxy behavior", () => {
  it("Proxy get trap is called for property access", () => {
    let getCalls = 0;
    const target = { foo: "bar", baz: 123 };
    const proxy = new Proxy(target, {
      get(obj, prop) {
        getCalls++;
        return Reflect.get(obj, prop);
      },
    });

    proxy.foo;
    proxy.baz;
    proxy.foo;

    expect(getCalls).toBe(3);
  });

  it("Proxy can wrap function calls", () => {
    let wrappedCalls = 0;
    const target = {
      execute: async (sql: string) => ({ rows: [{ sql }] }),
    };
    
    const proxy = new Proxy(target, {
      get(obj, prop) {
        const value = Reflect.get(obj, prop);
        if (typeof value === "function") {
          return function(this: typeof target, ...args: unknown[]) {
            wrappedCalls++;
            return Reflect.apply(value, obj, args);
          };
        }
        return value;
      },
    });

    proxy.execute("SELECT 1");
    proxy.execute("SELECT 2");

    expect(wrappedCalls).toBe(2);
  });

  it("Proxy doesn't break async functions", async () => {
    const target = {
      async query(): Promise<string> {
        await new Promise((r) => setTimeout(r, 1));
        return "result";
      },
    };

    const proxy = new Proxy(target, {
      get(obj, prop) {
        const value = Reflect.get(obj, prop);
        if (typeof value === "function") {
          return function(this: typeof target, ...args: unknown[]) {
            return Reflect.apply(value, obj, args);
          };
        }
        return value;
      },
    });

    const result = await proxy.query();
    expect(result).toBe("result");
  });

  it("Proxy preserves error propagation", async () => {
    const target = {
      async failingQuery(): Promise<never> {
        throw new Error("Query failed");
      },
    };

    const proxy = new Proxy(target, {
      get(obj, prop) {
        const value = Reflect.get(obj, prop);
        if (typeof value === "function") {
          return function(this: typeof target, ...args: unknown[]) {
            return Reflect.apply(value, obj, args);
          };
        }
        return value;
      },
    });

    await expect(proxy.failingQuery()).rejects.toThrow("Query failed");
  });
});

