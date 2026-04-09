import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

describe("logger", () => {
  const originalLogLevel = process.env.LOG_LEVEL;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }
  });

  test("info logs produce valid JSON with timestamp, level, and message", async () => {
    process.env.LOG_LEVEL = "info";
    // Re-import to pick up new LOG_LEVEL
    const { logger } = await import("../../src/logger");
    logger.info("test message", { key: "value" });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const output = consoleLogSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("test message");
    expect(parsed.key).toBe("value");
    expect(parsed.timestamp).toBeDefined();
  });

  test("error logs go through console.error", async () => {
    process.env.LOG_LEVEL = "error";
    const { logger } = await import("../../src/logger");
    logger.error("something broke", { code: 500 });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const output = consoleErrorSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("something broke");
    expect(parsed.code).toBe(500);
  });

  test("warn logs go through console.warn", async () => {
    process.env.LOG_LEVEL = "warn";
    const { logger } = await import("../../src/logger");
    logger.warn("caution");

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    const output = consoleWarnSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe("warn");
  });

  test("debug messages are suppressed at default (info) log level", async () => {
    // LOG_LEVEL is captured at module load time; default is "info"
    // so debug calls should be suppressed
    const { logger } = await import("../../src/logger");
    logger.debug("should be suppressed", { agentId: "a1" });

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});
