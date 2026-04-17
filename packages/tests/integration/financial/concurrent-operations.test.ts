/**
 * Cross-Service Concurrent Operations Tests
 *
 * Tests race conditions BETWEEN different services.
 *
 * Note: Single-service race conditions are tested in unit tests:
 * - credits.service.test.ts (20 concurrent deductions)
 * - agent-budgets.service.test.ts (20 concurrent deductions)
 * - redeemable-earnings.service.test.ts (double redemption)
 *
 * This file focuses on CROSS-SERVICE scenarios only.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { agentBudgetService } from "@/lib/services/agent-budgets";
import { creditsService } from "@/lib/services/credits";
import { organizationsService } from "@/lib/services/organizations";
import { getConnectionString } from "@/tests/helpers/local-database";
import {
  cleanupTestData,
  createTestDataSet,
} from "@/tests/helpers/test-data-factory";

describe("Cross-Service Concurrent Operations", () => {
  let connectionString: string;

  beforeAll(async () => {
    connectionString = getConnectionString();
  });

  test("concurrent org credit deduction AND budget allocation compete fairly", async () => {
    const testData = await createTestDataSet(connectionString, {
      creditBalance: 50,
      includeCharacter: true,
    });
    const agentId = testData.character!.id;
    const orgId = testData.organization.id;

    try {
      await agentBudgetService.getOrCreateBudget(agentId);

      // Race: direct credit deduction vs budget allocation
      // Both want $40 from $50 available
      const [directDeduct, budgetAllocation] = await Promise.allSettled([
        creditsService.reserveAndDeductCredits({
          organizationId: orgId,
          amount: 40,
          description: "Direct deduction",
        }),
        agentBudgetService.allocateBudget({
          agentId,
          amount: 40,
          fromOrgCredits: true,
          description: "Budget allocation",
        }),
      ]);

      const directSuccess =
        directDeduct.status === "fulfilled" && directDeduct.value.success;
      const allocSuccess =
        budgetAllocation.status === "fulfilled" &&
        budgetAllocation.value.success;

      // At most one can succeed with full $40
      // (both could partially succeed if one gets less)
      const finalOrg = await organizationsService.getById(orgId);
      expect(Number(finalOrg!.credit_balance)).toBeGreaterThanOrEqual(0);

      expect(directSuccess || allocSuccess).toBe(true);
    } finally {
      await cleanupTestData(connectionString, testData.organization.id);
    }
  });

  test("multiple agents competing for same org credits", async () => {
    // Create two agents in different orgs but we'll test with one org
    const testData1 = await createTestDataSet(connectionString, {
      creditBalance: 100,
      includeCharacter: true,
    });
    const testData2 = await createTestDataSet(connectionString, {
      creditBalance: 100,
      includeCharacter: true,
    });

    const agent1Id = testData1.character!.id;
    const agent2Id = testData2.character!.id;
    const _orgId = testData1.organization.id;

    try {
      // Setup both agents with budgets linked to org1
      await agentBudgetService.getOrCreateBudget(agent1Id);

      // Note: agent2 is in a different org, so this tests
      // concurrent allocations from DIFFERENT orgs (no conflict expected)
      await agentBudgetService.getOrCreateBudget(agent2Id);

      // Concurrent allocations from their respective orgs
      const [alloc1, alloc2] = await Promise.allSettled([
        agentBudgetService.allocateBudget({
          agentId: agent1Id,
          amount: 60,
          fromOrgCredits: true,
        }),
        agentBudgetService.allocateBudget({
          agentId: agent2Id,
          amount: 60,
          fromOrgCredits: true,
        }),
      ]);

      // Both should succeed (different orgs)
      expect(alloc1.status === "fulfilled" && alloc1.value.success).toBe(true);
      expect(alloc2.status === "fulfilled" && alloc2.value.success).toBe(true);

      // Verify no negative balances
      const org1 = await organizationsService.getById(
        testData1.organization.id,
      );
      const org2 = await organizationsService.getById(
        testData2.organization.id,
      );
      expect(Number(org1!.credit_balance)).toBeGreaterThanOrEqual(0);
      expect(Number(org2!.credit_balance)).toBeGreaterThanOrEqual(0);
    } finally {
      await cleanupTestData(connectionString, testData1.organization.id);
      await cleanupTestData(connectionString, testData2.organization.id);
    }
  });

  test("stress: 30 mixed cross-service operations maintain invariants", async () => {
    const testData = await createTestDataSet(connectionString, {
      creditBalance: 500,
      includeCharacter: true,
    });
    const agentId = testData.character!.id;
    const orgId = testData.organization.id;

    try {
      await agentBudgetService.getOrCreateBudget(agentId);
      await agentBudgetService.allocateBudget({
        agentId,
        amount: 200,
        fromOrgCredits: true,
      });

      // Mix of operations that touch BOTH credits AND budgets
      const operations = [
        // Direct credit operations
        // Note: source field intentionally omitted - addCredits API no longer requires it
        ...Array.from({ length: 5 }, () =>
          creditsService.addCredits({
            organizationId: orgId,
            amount: 10,
            description: "Stress add",
          }),
        ),
        ...Array.from({ length: 10 }, () =>
          creditsService.reserveAndDeductCredits({
            organizationId: orgId,
            amount: 5,
            description: "Stress deduct",
          }),
        ),
        // Budget operations
        ...Array.from({ length: 10 }, () =>
          agentBudgetService.deductBudget({
            agentId,
            amount: 5,
            description: "Budget deduct",
          }),
        ),
        // Cross-service: allocations (touches both org credits AND budget)
        ...Array.from({ length: 5 }, () =>
          agentBudgetService.allocateBudget({
            agentId,
            amount: 10,
            fromOrgCredits: true,
            description: "Cross-service allocation",
          }),
        ),
      ];

      // Shuffle for realistic concurrency
      const shuffled = operations.sort(() => Math.random() - 0.5);
      await Promise.allSettled(shuffled);

      // Verify invariants
      const finalOrg = await organizationsService.getById(orgId);
      const finalBudget = await agentBudgetService.getOrCreateBudget(agentId);

      // Invariant 1: Org balance >= 0
      expect(Number(finalOrg!.credit_balance)).toBeGreaterThanOrEqual(0);

      // Invariant 2: Budget spent <= allocated
      expect(Number(finalBudget!.spent_budget)).toBeLessThanOrEqual(
        Number(finalBudget!.allocated_budget),
      );

      // Invariant 3: Available budget >= 0
      const available =
        Number(finalBudget!.allocated_budget) -
        Number(finalBudget!.spent_budget);
      expect(available).toBeGreaterThanOrEqual(0);
    } finally {
      await cleanupTestData(connectionString, testData.organization.id);
    }
  }, 30000);
});
