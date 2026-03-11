import { describe, test, expect } from "bun:test";
import type { MiladySandboxStatus } from "@/db/schemas/milady-sandboxes";
import type { DockerNodeStatus } from "@/db/schemas/docker-nodes";
import { isValidDockerLogsSince } from "@/app/api/v1/admin/docker-containers/[id]/logs/route";

describe("Status Consistency", () => {
  const ALL_SANDBOX: MiladySandboxStatus[] = ["pending","provisioning","running","stopped","disconnected","error"];
  const ALL_NODE: DockerNodeStatus[] = ["healthy","degraded","offline","unknown"];
  const BADGE = new Set(["running","stopped","error","provisioning","pending","disconnected"]);
  test("badge covers all sandbox statuses", () => { for (const s of ALL_SANDBOX) expect(BADGE.has(s)).toBe(true); });
  test("badge covers all node statuses", () => { for (const s of ALL_NODE) expect(new Set(ALL_NODE).has(s)).toBe(true); });
});

describe("Logs Route — isValidDockerLogsSince", () => {
  // Valid: strict ISO-8601 timestamps
  test("accepts ISO-8601 timestamp with Z suffix", () => {
    expect(isValidDockerLogsSince("2026-03-09T12:00:00Z")).toBe(true);
  });
  test("accepts ISO-8601 timestamp with timezone offset", () => {
    expect(isValidDockerLogsSince("2026-03-09T12:00:00+05:30")).toBe(true);
  });
  test("accepts ISO-8601 timestamp with fractional seconds", () => {
    expect(isValidDockerLogsSince("2026-03-09T12:00:00.123Z")).toBe(true);
  });

  // Valid: relative durations
  test("accepts relative duration hours", () => {
    expect(isValidDockerLogsSince("1h")).toBe(true);
  });
  test("accepts relative duration days", () => {
    expect(isValidDockerLogsSince("2d")).toBe(true);
  });
  test("accepts relative duration minutes", () => {
    expect(isValidDockerLogsSince("30m")).toBe(true);
  });
  test("accepts relative duration seconds", () => {
    expect(isValidDockerLogsSince("60s")).toBe(true);
  });
  test("accepts relative duration weeks", () => {
    expect(isValidDockerLogsSince("1w")).toBe(true);
  });

  // Invalid: injection attempts
  test("rejects command injection via semicolon", () => {
    expect(isValidDockerLogsSince("1h;cat /etc/passwd")).toBe(false);
  });
  test("rejects command injection via &&", () => {
    expect(isValidDockerLogsSince("2026-03-09T12:00:00Z && whoami")).toBe(false);
  });

  // Invalid: locale-dependent strings (the core fix for item #2)
  test("rejects locale-dependent string 'yesterday'", () => {
    expect(isValidDockerLogsSince("yesterday")).toBe(false);
  });
  test("rejects locale-dependent string 'March 9, 2026'", () => {
    expect(isValidDockerLogsSince("March 9, 2026")).toBe(false);
  });
  test("rejects bare date without time 'YYYY-MM-DD'", () => {
    expect(isValidDockerLogsSince("2026-03-09")).toBe(false);
  });
  test("rejects ISO-like without timezone", () => {
    expect(isValidDockerLogsSince("2026-03-09T12:00:00")).toBe(false);
  });
  test("rejects empty string", () => {
    expect(isValidDockerLogsSince("")).toBe(false);
  });
});
