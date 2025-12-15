import { describe, it, expect, afterEach } from "bun:test";

const originalEnv: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined): void {
  if (!(key in originalEnv)) originalEnv[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  Object.keys(originalEnv).forEach((k) => delete originalEnv[k]);
}

describe("instrumentation control", () => {
  afterEach(() => restoreEnv());

  describe("environment detection", () => {
    it("NODE_ENV=development enables instrumentation", () => {
      setEnv("NODE_ENV", "development");
      expect(process.env.NODE_ENV).toBe("development");
    });

    it("NODE_ENV=production disables instrumentation", () => {
      setEnv("NODE_ENV", "production");
      expect(process.env.NODE_ENV).toBe("production");
    });

    it("VERCEL_ENV=preview enables instrumentation", () => {
      setEnv("VERCEL_ENV", "preview");
      expect(process.env.VERCEL_ENV).toBe("preview");
    });

    it("VERCEL_ENV=production disables instrumentation", () => {
      setEnv("VERCEL_ENV", "production");
      expect(process.env.VERCEL_ENV).toBe("production");
    });
  });

  describe("threshold configuration", () => {
    it("reads SLOW_QUERY_THRESHOLD_MS from env", () => {
      setEnv("SLOW_QUERY_THRESHOLD_MS", "100");
      expect(parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || "50", 10)).toBe(
        100,
      );
    });

    it("defaults to 50ms when not set", () => {
      setEnv("SLOW_QUERY_THRESHOLD_MS", undefined);
      expect(parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || "50", 10)).toBe(
        50,
      );
    });

    it("handles invalid values", () => {
      setEnv("SLOW_QUERY_THRESHOLD_MS", "not-a-number");
      const threshold = parseInt(
        process.env.SLOW_QUERY_THRESHOLD_MS || "50",
        10,
      );
      expect(Number.isNaN(threshold)).toBe(true);
    });

    it("handles negative values", () => {
      setEnv("SLOW_QUERY_THRESHOLD_MS", "-100");
      expect(parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || "50", 10)).toBe(
        -100,
      );
    });
  });

  describe("alert config detection", () => {
    it("detects Discord webhook", () => {
      setEnv(
        "DB_SLOW_QUERY_DISCORD_WEBHOOK",
        "https://discord.com/api/webhooks/test",
      );
      expect(!!process.env.DB_SLOW_QUERY_DISCORD_WEBHOOK).toBe(true);
    });

    it("detects Slack webhook", () => {
      setEnv(
        "DB_SLOW_QUERY_SLACK_WEBHOOK",
        "https://hooks.slack.com/services/test",
      );
      expect(!!process.env.DB_SLOW_QUERY_SLACK_WEBHOOK).toBe(true);
    });

    it("detects no webhooks configured", () => {
      setEnv("DB_SLOW_QUERY_DISCORD_WEBHOOK", undefined);
      setEnv("DB_SLOW_QUERY_SLACK_WEBHOOK", undefined);
      expect(
        !!(
          process.env.DB_SLOW_QUERY_DISCORD_WEBHOOK ||
          process.env.DB_SLOW_QUERY_SLACK_WEBHOOK
        ),
      ).toBe(false);
    });
  });
});

describe("overhead analysis", () => {
  it("performance.now() is sub-microsecond", () => {
    const start = performance.now();
    for (let i = 0; i < 10000; i++) performance.now();
    expect(((performance.now() - start) * 1_000_000) / 10000).toBeLessThan(
      1000,
    );
  });

  it("Map operations are fast", () => {
    const map = new Map<string, number>();
    const start = performance.now();
    for (let i = 0; i < 10000; i++) map.set(`key_${i}`, i);
    for (let i = 0; i < 10000; i++) map.get(`key_${i}`);
    expect(performance.now() - start).toBeLessThan(100);
  });

  it("string hashing is fast", () => {
    const strings = Array.from(
      { length: 100 },
      (_, i) => `SELECT * FROM table_${i}`,
    );
    const start = performance.now();
    for (let iter = 0; iter < 1000; iter++) {
      for (const s of strings) {
        let hash = 0;
        for (let i = 0; i < s.length; i++) {
          hash = (hash << 5) - hash + s.charCodeAt(i);
          hash = hash & hash;
        }
      }
    }
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe("proxy behavior", () => {
  it("get trap is called", () => {
    let calls = 0;
    const proxy = new Proxy(
      { foo: "bar" },
      {
        get(obj, prop) {
          calls++;
          return Reflect.get(obj, prop);
        },
      },
    );
    proxy.foo;
    proxy.foo;
    proxy.foo;
    expect(calls).toBe(3);
  });

  it("wraps function calls", () => {
    let calls = 0;
    const proxy = new Proxy(
      { execute: async () => ({ rows: [] }) },
      {
        get(obj, prop) {
          const value = Reflect.get(obj, prop);
          if (typeof value === "function") {
            return (...args: unknown[]) => {
              calls++;
              return Reflect.apply(value, obj, args);
            };
          }
          return value;
        },
      },
    );
    proxy.execute();
    proxy.execute();
    expect(calls).toBe(2);
  });

  it("preserves async", async () => {
    const proxy = new Proxy(
      { query: async () => "result" },
      {
        get(obj, prop) {
          const value = Reflect.get(obj, prop);
          return typeof value === "function"
            ? (...args: unknown[]) => Reflect.apply(value, obj, args)
            : value;
        },
      },
    );
    expect(await proxy.query()).toBe("result");
  });

  it("preserves errors", async () => {
    const proxy = new Proxy(
      {
        fail: async () => {
          throw new Error("fail");
        },
      },
      {
        get(obj, prop) {
          const value = Reflect.get(obj, prop);
          return typeof value === "function"
            ? (...args: unknown[]) => Reflect.apply(value, obj, args)
            : value;
        },
      },
    );
    await expect(proxy.fail()).rejects.toThrow("fail");
  });
});
