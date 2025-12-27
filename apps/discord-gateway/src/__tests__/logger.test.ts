import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { logger } from "../logger";

/**
 * Logger Tests
 *
 * Tests the structured logging output format and behavior.
 */
describe("Logger", () => {
  const originalConsole = { ...console };
  let consoleOutput: Array<{ level: string; args: unknown[] }> = [];

  beforeEach(() => {
    consoleOutput = [];

    console.log = mock((...args: unknown[]) => {
      consoleOutput.push({ level: "log", args });
    }) as typeof console.log;

    console.error = mock((...args: unknown[]) => {
      consoleOutput.push({ level: "error", args });
    }) as typeof console.error;

    console.warn = mock((...args: unknown[]) => {
      consoleOutput.push({ level: "warn", args });
    }) as typeof console.warn;
  });

  afterEach(() => {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
  });

  describe("JSON Output Format", () => {
    it("should output valid JSON for info messages", () => {
      logger.info("Test message");

      expect(consoleOutput).toHaveLength(1);
      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("Test message");
      expect(parsed.timestamp).toBeDefined();
    });

    it("should output valid JSON for error messages", () => {
      logger.error("Error occurred");

      expect(consoleOutput).toHaveLength(1);
      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe("error");
      expect(parsed.message).toBe("Error occurred");
    });

    it("should output valid JSON for warn messages", () => {
      logger.warn("Warning message");

      expect(consoleOutput).toHaveLength(1);
      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe("warn");
      expect(parsed.message).toBe("Warning message");
    });

    it("should not output debug messages when LOG_LEVEL is info (default)", () => {
      // Debug is filtered when LOG_LEVEL=info (default)
      logger.debug("Debug info");
      expect(consoleOutput).toHaveLength(0);
    });
  });

  describe("Timestamp Format", () => {
    it("should include ISO 8601 timestamp", () => {
      logger.info("Timestamp test");

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      // Should be valid ISO 8601
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      // Should be parseable as Date
      const date = new Date(parsed.timestamp);
      expect(date.getTime()).not.toBeNaN();
    });

    it("should have recent timestamp", () => {
      const before = Date.now();
      logger.info("Timing test");
      const after = Date.now();

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);
      const logTime = new Date(parsed.timestamp).getTime();

      expect(logTime).toBeGreaterThanOrEqual(before - 1000);
      expect(logTime).toBeLessThanOrEqual(after + 1000);
    });
  });

  describe("Metadata Handling", () => {
    it("should include metadata in output", () => {
      logger.info("With metadata", { userId: "123", action: "test" });

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.userId).toBe("123");
      expect(parsed.action).toBe("test");
    });

    it("should handle nested metadata", () => {
      logger.info("Nested data", {
        user: { id: "123", name: "Test" },
        stats: { count: 5 },
      });

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.user.id).toBe("123");
      expect(parsed.stats.count).toBe(5);
    });

    it("should handle array metadata", () => {
      logger.info("Array data", { items: [1, 2, 3] });

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.items).toEqual([1, 2, 3]);
    });

    it("should handle empty metadata", () => {
      logger.info("No metadata", {});

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.message).toBe("No metadata");
    });

    it("should handle undefined metadata", () => {
      logger.info("Undefined metadata");

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.message).toBe("Undefined metadata");
    });
  });

  describe("Special Characters", () => {
    it("should handle messages with quotes", () => {
      logger.info('Message with "quotes"');

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.message).toBe('Message with "quotes"');
    });

    it("should handle messages with newlines", () => {
      logger.info("Line1\nLine2\nLine3");

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.message).toContain("\n");
    });

    it("should handle messages with unicode", () => {
      logger.info("Unicode: 日本語 emoji: 🚀");

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.message).toBe("Unicode: 日本語 emoji: 🚀");
    });

    it("should handle messages with special JSON characters", () => {
      logger.info("Special: \\backslash /slash");

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.message).toContain("\\backslash");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty message", () => {
      logger.info("");

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.message).toBe("");
    });

    it("should handle very long messages", () => {
      const longMessage = "a".repeat(10000);
      logger.info(longMessage);

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.message.length).toBe(10000);
    });

    it("should handle metadata with null values", () => {
      logger.info("Null test", { value: null });

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.value).toBeNull();
    });

    it("should handle metadata with undefined values", () => {
      logger.info("Undefined test", { value: undefined });

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      // undefined should not appear in JSON output
      expect("value" in parsed).toBe(false);
    });

    it("should handle numeric metadata", () => {
      logger.info("Numbers", {
        int: 42,
        float: 3.14,
        negative: -10,
        zero: 0,
      });

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.int).toBe(42);
      expect(parsed.float).toBe(3.14);
      expect(parsed.negative).toBe(-10);
      expect(parsed.zero).toBe(0);
    });

    it("should handle boolean metadata", () => {
      logger.info("Booleans", { yes: true, no: false });

      const output = consoleOutput[0].args[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.yes).toBe(true);
      expect(parsed.no).toBe(false);
    });
  });
});

describe("Logger Console Routing", () => {
  it("should use console.log for info", () => {
    const mockLog = mock(() => {});
    console.log = mockLog;

    logger.info("Info message");

    expect(mockLog).toHaveBeenCalled();
  });

  it("should use console.error for error", () => {
    const mockError = mock(() => {});
    console.error = mockError;

    logger.error("Error message");

    expect(mockError).toHaveBeenCalled();
  });

  it("should use console.warn for warn", () => {
    const mockWarn = mock(() => {});
    console.warn = mockWarn;

    logger.warn("Warn message");

    expect(mockWarn).toHaveBeenCalled();
  });

  it("should not output debug when LOG_LEVEL is info", () => {
    const mockLog = mock(() => {});
    console.log = mockLog;

    logger.debug("Debug message");

    // Debug is filtered at default LOG_LEVEL=info
    expect(mockLog).not.toHaveBeenCalled();
  });
});
