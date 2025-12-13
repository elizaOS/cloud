/**
 * Code Interpreter Service Integration Tests
 *
 * Tests the actual interpreter service end-to-end.
 * These tests require a database connection.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { requireDatabase, skipIfNoDb, requireSchema } from "../test-utils";

describe("Code Interpreter Service - Integration", () => {
  let testOrgId: string;
  let testUserId: string;
  let interpreterService: Awaited<typeof import("@/lib/services/code-agent")>["interpreterService"];

  beforeAll(async () => {
    const dbAvailable = await requireDatabase();
    if (!dbAvailable) return;

    const schemasOk = await requireSchema("interpreterExecutions");
    if (!schemasOk) return;

    const codeAgentModule = await import("@/lib/services/code-agent");
    interpreterService = codeAgentModule.interpreterService;

    const { db } = await import("@/db");
    const org = await db.query.organizations.findFirst();
    const user = await db.query.users.findFirst();

    if (org && user) {
      testOrgId = org.id;
      testUserId = user.id;
    }
  });

  const mockCredits = async () => {
    const creditsModule = await import("@/lib/services/credits");
    const original = creditsModule.creditsService.deductCredits;
    creditsModule.creditsService.deductCredits = async () => ({ success: true, newBalance: 99 });
    return () => { creditsModule.creditsService.deductCredits = original; };
  };

  describe("JavaScript Execution", () => {
    test("executes simple JavaScript code", async () => {
      if (skipIfNoDb()) return;
      if (!testOrgId || !testUserId) {
        console.log("⏭️ Skipping - no test org/user in database");
        return;
      }

      const restore = await mockCredits();
      try {
        const result = await interpreterService.execute({
          organizationId: testOrgId,
          userId: testUserId,
          language: "javascript",
          code: 'console.log("Hello from test"); 2 + 2',
        });

        expect(result.success).toBe(true);
        expect(result.output).toContain("Hello from test");
        expect(result.exitCode).toBe(0);
        expect(result.executionId).toBeDefined();
        expect(result.durationMs).toBeGreaterThan(0);
      } finally {
        restore();
      }
    });

    test("handles JavaScript runtime errors", async () => {
      if (skipIfNoDb()) return;
      if (!testOrgId || !testUserId) {
        console.log("⏭️ Skipping - no test org/user in database");
        return;
      }

      const restore = await mockCredits();
      try {
        const result = await interpreterService.execute({
          organizationId: testOrgId,
          userId: testUserId,
          language: "javascript",
          code: "undefinedVariable.someMethod()",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("undefinedVariable");
        expect(result.exitCode).toBe(1);
      } finally {
        restore();
      }
    });

    test("rejects packages for JavaScript", async () => {
      if (skipIfNoDb()) return;
      if (!testOrgId || !testUserId) {
        console.log("⏭️ Skipping - no test org/user in database");
        return;
      }

      const restore = await mockCredits();
      try {
        const result = await interpreterService.execute({
          organizationId: testOrgId,
          userId: testUserId,
          language: "javascript",
          code: 'console.log("test")',
          packages: ["lodash"],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("not supported");
      } finally {
        restore();
      }
    });
  });

  describe("Shell Execution", () => {
    test("executes safe shell commands", async () => {
      if (skipIfNoDb()) return;
      if (!testOrgId || !testUserId) {
        console.log("⏭️ Skipping - no test org/user in database");
        return;
      }

      const restore = await mockCredits();
      try {
        const result = await interpreterService.execute({
          organizationId: testOrgId,
          userId: testUserId,
          language: "shell",
          code: "echo 'Hello from shell'",
        });

        expect(result.success).toBe(true);
        expect(result.output).toContain("Hello from shell");
        expect(result.exitCode).toBe(0);
      } finally {
        restore();
      }
    });

    test("blocks dangerous shell commands", async () => {
      if (skipIfNoDb()) return;
      if (!testOrgId || !testUserId) {
        console.log("⏭️ Skipping - no test org/user in database");
        return;
      }

      const restore = await mockCredits();
      try {
        const result = await interpreterService.execute({
          organizationId: testOrgId,
          userId: testUserId,
          language: "shell",
          code: "rm -rf /",
        });

        expect(result.success).toBe(false);
        expect(result.error?.toLowerCase()).toContain("dangerous");
      } finally {
        restore();
      }
    });
  });

  describe("Credit Checking", () => {
    test("rejects execution when insufficient credits", async () => {
      if (skipIfNoDb()) return;
      if (!testOrgId || !testUserId) {
        console.log("⏭️ Skipping - no test org/user in database");
        return;
      }

      // Use a random org ID that won't have credits
      const fakeOrgId = crypto.randomUUID();
      const fakeUserId = crypto.randomUUID();

      // This should fail because the org doesn't exist / has no credits
      await expect(
        interpreterService.execute({
          organizationId: fakeOrgId,
          userId: fakeUserId,
          language: "javascript",
          code: 'console.log("test")',
        })
      ).rejects.toThrow();
    });
  });

  describe("Unsupported Languages", () => {
    test("rejects unsupported language", async () => {
      if (skipIfNoDb()) return;
      if (!testOrgId || !testUserId) {
        console.log("⏭️ Skipping - no test org/user in database");
        return;
      }

      const restore = await mockCredits();
      try {
        await expect(
          interpreterService.execute({
            organizationId: testOrgId,
            userId: testUserId,
            language: "ruby" as "python",
            code: 'puts "hello"',
          })
        ).rejects.toThrow("Unsupported language");
      } finally {
        restore();
      }
    });
  });
});
