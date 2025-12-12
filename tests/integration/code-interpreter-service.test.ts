/**
 * Code Interpreter Service Integration Tests
 *
 * Tests the actual interpreter service end-to-end.
 * These tests require a database connection.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  testContext,
  requireDatabase,
  skipIfNoDb,
  requireSchema,
} from "../test-utils";

describe("Code Interpreter Service - Integration", () => {
  let testOrgId: string;
  let testUserId: string;
  let interpreterService: Awaited<typeof import("@/lib/services/code-agent")>["interpreterService"];

  beforeAll(async () => {
    const dbAvailable = await requireDatabase();
    if (!dbAvailable) return;

    // Check if required schemas exist
    const schemasOk = await requireSchema("interpreterExecutions");
    if (!schemasOk) return;

    // Import the service
    const codeAgentModule = await import("@/lib/services/code-agent");
    interpreterService = codeAgentModule.interpreterService;

    // Get test org and user from database
    const { db } = await import("@/db");
    const org = await db.query.organizations.findFirst();
    const user = await db.query.users.findFirst();

    if (org && user) {
      testOrgId = org.id;
      testUserId = user.id;
    }
  });

  describe("JavaScript Execution", () => {
    test("executes simple JavaScript code", async () => {
      if (skipIfNoDb()) return;
      if (!testOrgId || !testUserId) {
        console.log("⏭️ Skipping - no test org/user in database");
        return;
      }

      // Mock credits to avoid deduction
      const creditsModule = await import("@/lib/services/credits");
      const originalGetBalance = creditsModule.creditsService.getBalance;
      creditsModule.creditsService.getBalance = async () => ({ balance: 100 });
      const originalDeductCredits = creditsModule.creditsService.deductCredits;
      creditsModule.creditsService.deductCredits = async () => ({} as ReturnType<typeof originalDeductCredits>);

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
        creditsModule.creditsService.getBalance = originalGetBalance;
        creditsModule.creditsService.deductCredits = originalDeductCredits;
      }
    });

    test("handles JavaScript runtime errors", async () => {
      if (skipIfNoDb()) return;
      if (!testOrgId || !testUserId) {
        console.log("⏭️ Skipping - no test org/user in database");
        return;
      }

      const creditsModule = await import("@/lib/services/credits");
      const originalGetBalance = creditsModule.creditsService.getBalance;
      creditsModule.creditsService.getBalance = async () => ({ balance: 100 });
      const originalDeductCredits = creditsModule.creditsService.deductCredits;
      creditsModule.creditsService.deductCredits = async () => ({} as ReturnType<typeof originalDeductCredits>);

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
        creditsModule.creditsService.getBalance = originalGetBalance;
        creditsModule.creditsService.deductCredits = originalDeductCredits;
      }
    });

    test("rejects packages for JavaScript", async () => {
      if (skipIfNoDb()) return;
      if (!testOrgId || !testUserId) {
        console.log("⏭️ Skipping - no test org/user in database");
        return;
      }

      const creditsModule = await import("@/lib/services/credits");
      const originalGetBalance = creditsModule.creditsService.getBalance;
      creditsModule.creditsService.getBalance = async () => ({ balance: 100 });
      const originalDeductCredits = creditsModule.creditsService.deductCredits;
      creditsModule.creditsService.deductCredits = async () => ({} as ReturnType<typeof originalDeductCredits>);

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
        creditsModule.creditsService.getBalance = originalGetBalance;
        creditsModule.creditsService.deductCredits = originalDeductCredits;
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

      const creditsModule = await import("@/lib/services/credits");
      const originalGetBalance = creditsModule.creditsService.getBalance;
      creditsModule.creditsService.getBalance = async () => ({ balance: 100 });
      const originalDeductCredits = creditsModule.creditsService.deductCredits;
      creditsModule.creditsService.deductCredits = async () => ({} as ReturnType<typeof originalDeductCredits>);

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
        creditsModule.creditsService.getBalance = originalGetBalance;
        creditsModule.creditsService.deductCredits = originalDeductCredits;
      }
    });

    test("blocks dangerous shell commands", async () => {
      if (skipIfNoDb()) return;
      if (!testOrgId || !testUserId) {
        console.log("⏭️ Skipping - no test org/user in database");
        return;
      }

      const creditsModule = await import("@/lib/services/credits");
      const originalGetBalance = creditsModule.creditsService.getBalance;
      creditsModule.creditsService.getBalance = async () => ({ balance: 100 });
      const originalDeductCredits = creditsModule.creditsService.deductCredits;
      creditsModule.creditsService.deductCredits = async () => ({} as ReturnType<typeof originalDeductCredits>);

      try {
        const result = await interpreterService.execute({
          organizationId: testOrgId,
          userId: testUserId,
          language: "shell",
          code: "rm -rf /",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("dangerous");
      } finally {
        creditsModule.creditsService.getBalance = originalGetBalance;
        creditsModule.creditsService.deductCredits = originalDeductCredits;
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

      const creditsModule = await import("@/lib/services/credits");
      const originalGetBalance = creditsModule.creditsService.getBalance;
      creditsModule.creditsService.getBalance = async () => ({ balance: 0 });

      try {
        await expect(
          interpreterService.execute({
            organizationId: testOrgId,
            userId: testUserId,
            language: "javascript",
            code: 'console.log("test")',
          })
        ).rejects.toThrow("Insufficient credits");
      } finally {
        creditsModule.creditsService.getBalance = originalGetBalance;
      }
    });
  });

  describe("Unsupported Languages", () => {
    test("rejects unsupported language", async () => {
      if (skipIfNoDb()) return;
      if (!testOrgId || !testUserId) {
        console.log("⏭️ Skipping - no test org/user in database");
        return;
      }

      const creditsModule = await import("@/lib/services/credits");
      const originalGetBalance = creditsModule.creditsService.getBalance;
      creditsModule.creditsService.getBalance = async () => ({ balance: 100 });
      const originalDeductCredits = creditsModule.creditsService.deductCredits;
      creditsModule.creditsService.deductCredits = async () => ({} as ReturnType<typeof originalDeductCredits>);

      try {
        const result = await interpreterService.execute({
          organizationId: testOrgId,
          userId: testUserId,
          language: "ruby" as "python", // Force invalid language
          code: 'puts "hello"',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Unsupported language");
      } finally {
        creditsModule.creditsService.getBalance = originalGetBalance;
        creditsModule.creditsService.deductCredits = originalDeductCredits;
      }
    });
  });
});


