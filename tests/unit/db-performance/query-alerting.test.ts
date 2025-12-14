import { describe, it, expect, beforeEach } from "bun:test";
import {
  getAlertSeverity,
  ALERT_THRESHOLDS,
  clearRateLimiter,
} from "@/lib/db/query-alerting";

describe("query-alerting", () => {
  beforeEach(() => {
    clearRateLimiter();
  });

  describe("ALERT_THRESHOLDS", () => {
    it("has correct threshold values", () => {
      expect(ALERT_THRESHOLDS.SLOW).toBe(50);
      expect(ALERT_THRESHOLDS.WARNING).toBe(200);
      expect(ALERT_THRESHOLDS.CRITICAL).toBe(1000);
    });

    it("thresholds are in ascending order", () => {
      expect(ALERT_THRESHOLDS.SLOW).toBeLessThan(ALERT_THRESHOLDS.WARNING);
      expect(ALERT_THRESHOLDS.WARNING).toBeLessThan(ALERT_THRESHOLDS.CRITICAL);
    });
  });

  describe("getAlertSeverity", () => {
    it("returns null for durations below WARNING threshold", () => {
      expect(getAlertSeverity(0)).toBeNull();
      expect(getAlertSeverity(50)).toBeNull();
      expect(getAlertSeverity(100)).toBeNull();
      expect(getAlertSeverity(199)).toBeNull();
    });

    it("returns 'warning' at exactly WARNING threshold", () => {
      expect(getAlertSeverity(200)).toBe("warning");
    });

    it("returns 'warning' for durations between WARNING and CRITICAL", () => {
      expect(getAlertSeverity(201)).toBe("warning");
      expect(getAlertSeverity(500)).toBe("warning");
      expect(getAlertSeverity(999)).toBe("warning");
    });

    it("returns 'critical' at exactly CRITICAL threshold", () => {
      expect(getAlertSeverity(1000)).toBe("critical");
    });

    it("returns 'critical' for durations above CRITICAL threshold", () => {
      expect(getAlertSeverity(1001)).toBe("critical");
      expect(getAlertSeverity(5000)).toBe("critical");
      expect(getAlertSeverity(100000)).toBe("critical");
    });

    it("handles edge case at boundary", () => {
      expect(getAlertSeverity(199)).toBeNull();
      expect(getAlertSeverity(200)).toBe("warning");
      expect(getAlertSeverity(999)).toBe("warning");
      expect(getAlertSeverity(1000)).toBe("critical");
    });

    it("handles negative durations (edge case)", () => {
      expect(getAlertSeverity(-1)).toBeNull();
      expect(getAlertSeverity(-100)).toBeNull();
    });

    it("handles very large durations", () => {
      expect(getAlertSeverity(Number.MAX_SAFE_INTEGER)).toBe("critical");
    });
  });

  describe("severity distribution", () => {
    it("correctly categorizes a range of durations", () => {
      const testCases = [
        { duration: 0, expected: null },
        { duration: 49, expected: null },
        { duration: 50, expected: null }, // SLOW threshold doesn't trigger alerts
        { duration: 199, expected: null },
        { duration: 200, expected: "warning" },
        { duration: 500, expected: "warning" },
        { duration: 999, expected: "warning" },
        { duration: 1000, expected: "critical" },
        { duration: 2000, expected: "critical" },
        { duration: 10000, expected: "critical" },
      ];

      for (const { duration, expected } of testCases) {
        expect(getAlertSeverity(duration)).toBe(expected);
      }
    });
  });
});

