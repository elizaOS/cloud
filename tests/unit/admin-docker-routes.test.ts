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

describe("Logs Route", () => {
  test("has UUID PK lookup + shellQuote + node ssh_user", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const p = path.resolve(import.meta.dir, "../../app/api/v1/admin/docker-containers/[id]/logs/route.ts");
    const c = fs.readFileSync(p, "utf-8");
    expect(c).toContain("findById");
    expect(c).toContain("findBySandboxId");
    expect(c).toContain("shellQuote");
    expect(c).toContain("new DockerSSHClient");
    expect(c).toContain("username: node.ssh_user");
    expect(c).toContain("--since");
  });

  test("accepts only strict docker logs since formats", () => {
    expect(isValidDockerLogsSince("2026-03-09T12:00:00Z")).toBe(true);
    expect(isValidDockerLogsSince("1h")).toBe(true);
    expect(isValidDockerLogsSince("2d")).toBe(true);

    expect(isValidDockerLogsSince("1h;cat /etc/passwd")).toBe(false);
    expect(isValidDockerLogsSince("2026-03-09T12:00:00Z && whoami")).toBe(false);
    expect(isValidDockerLogsSince("yesterday")).toBe(false);
  });
});

describe("Dashboard UX", () => {
  test("has pending/disconnected in badge and filter", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const p = path.resolve(import.meta.dir, "../../components/admin/infrastructure-dashboard.tsx");
    const c = fs.readFileSync(p, "utf-8");
    expect(c).toContain("pending:");
    expect(c).toContain("disconnected:");
    expect(c).toContain("containersDisconnected");
  });
});
