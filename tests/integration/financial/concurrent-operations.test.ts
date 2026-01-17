/**
 * Concurrent Operations Integration Tests
 *
 * CRITICAL: Race condition tests for all financial services.
 *
 * These tests verify that concurrent operations maintain data integrity.
 * They are essential for preventing:
 * - Double-spending attacks
 * - Negative balance exploits
 * - Budget overdraft attacks
 * - Double-redemption vulnerabilities
 *
 * @see https://www.sourcery.ai/vulnerabilities/race-condition-financial-transactions
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { v4 as uuidv4 } from "uuid";
import { dbWrite, dbRead } from "@/db/client";
import { organizations } from "@/db/schemas/organizations";
import {
  agentBudgets,
  agentBudgetTransactions,
} from "@/db/schemas/agent-budgets";
import {
  redeemableEarnings,
  redeemableEarningsLedger,
} from "@/db/schemas/redeemable-earnings";
import { eq } from "drizzle-orm";
import { creditsService } from "@/lib/services/credits";
import { agentBudgetService } from "@/lib/services/agent-budgets";
import { redeemableEarningsService } from "@/lib/services/redeemable-earnings";
import {
  createTestDataSet,
  cleanupTestData,
  type TestDataSet,
} from "@/tests/infrastructure/test-data-factory";
import { getConnectionString } from "@/tests/infrastructure/local-database";

/**
 * Configuration for concurrent tests
 */
const CONCURRENT_REQUESTS = 20;
const INITIAL_BALANCE = 10;
const AMOUNT_PER_OPERATION = 1;
const EXPECTED_SUCCESSES = INITIAL_BALANCE / AMOUNT_PER_OPERATION; // 10
const EXPECTED_FAILURES = CONCURRENT_REQUESTS - EXPECTED_SUCCESSES; // 10
const TEST_TIMEOUT = 60000; // 60 seconds

describe("Concurrent Financial Operations", () => {
  let connectionString: string;

  beforeAll(async () => {
    connectionString = getConnectionString();
  });

  // ===========================================================================
  // Credits Service Concurrency Tests
  // ===========================================================================

  describe("Credits Service", () => {
    test(
      "CRITICAL: 20 concurrent $1 deductions on $10 balance",
      async () => {
        // Arrange
        const testData = await createTestDataSet(connectionString, {
          creditBalance: INITIAL_BALANCE,
          organizationName: "Credits Race Test Org",
        });

        // Act: Fire concurrent deductions
        const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
          creditsService.reserveAndDeductCredits({
            organizationId: testData.organization.id,
            amount: AMOUNT_PER_OPERATION,
            description: `Concurrent deduction ${i + 1}`,
          }),
        );

        const results = await Promise.allSettled(promises);

        // Assert: Count results
        const successes = results.filter(
          (r) => r.status === "fulfilled" && r.value.success,
        );
        const failures = results.filter(
          (r) => r.status === "fulfilled" && !r.value.success,
        );

        // Exactly 10 should succeed
        expect(successes.length).toBe(EXPECTED_SUCCESSES);
        expect(failures.length).toBe(EXPECTED_FAILURES);

        // CRITICAL: Balance must be exactly $0, NEVER negative
        const org = await dbRead.query.organizations.findFirst({
          where: eq(organizations.id, testData.organization.id),
        });
        const finalBalance = Number(org?.credit_balance);

        expect(finalBalance).toBe(0);
        expect(finalBalance).toBeGreaterThanOrEqual(0);

        // Cleanup
        await cleanupTestData(connectionString, testData.organization.id);
      },
      TEST_TIMEOUT,
    );

    test(
      "Mixed concurrent adds and deductions maintain consistency",
      async () => {
        // Arrange
        const testData = await createTestDataSet(connectionString, {
          creditBalance: 50,
          organizationName: "Credits Mixed Race Test",
        });

        // Act: Fire mixed operations
        const addPromises = Array.from({ length: 5 }, (_, i) =>
          creditsService.addCredits({
            organizationId: testData.organization.id,
            amount: 10,
            description: `Concurrent add ${i + 1}`,
          }),
        );

        const deductPromises = Array.from({ length: 10 }, (_, i) =>
          creditsService.reserveAndDeductCredits({
            organizationId: testData.organization.id,
            amount: 10,
            description: `Concurrent deduct ${i + 1}`,
          }),
        );

        await Promise.allSettled([...addPromises, ...deductPromises]);

        // Assert: Balance should never be negative
        const org = await dbRead.query.organizations.findFirst({
          where: eq(organizations.id, testData.organization.id),
        });
        const finalBalance = Number(org?.credit_balance);

        expect(finalBalance).toBeGreaterThanOrEqual(0);

        // Cleanup
        await cleanupTestData(connectionString, testData.organization.id);
      },
      TEST_TIMEOUT,
    );
  });

  // ===========================================================================
  // Agent Budget Service Concurrency Tests
  // ===========================================================================

  describe("Agent Budget Service", () => {
    test(
      "CRITICAL: 20 concurrent $1 budget deductions on $10 budget",
      async () => {
        // Arrange
        const testData = await createTestDataSet(connectionString, {
          creditBalance: 100,
          includeCharacter: true,
          characterName: "Budget Race Test Agent",
        });

        const agentId = testData.character!.id;
        await agentBudgetService.getOrCreateBudget(agentId);
        await agentBudgetService.allocateBudget({
          agentId,
          amount: INITIAL_BALANCE,
          fromOrgCredits: true,
        });

        // Act: Fire concurrent deductions
        const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
          agentBudgetService.deductBudget({
            agentId,
            amount: AMOUNT_PER_OPERATION,
            description: `Concurrent budget deduction ${i + 1}`,
          }),
        );

        const results = await Promise.allSettled(promises);

        // Assert
        const successes = results.filter(
          (r) => r.status === "fulfilled" && r.value.success,
        );
        const failures = results.filter(
          (r) => r.status === "fulfilled" && !r.value.success,
        );

        expect(successes.length).toBe(EXPECTED_SUCCESSES);
        expect(failures.length).toBe(EXPECTED_FAILURES);

        // CRITICAL: Budget balance must be exactly $0
        const budget = await agentBudgetService.getBudget(agentId);
        const finalBalance =
          Number(budget!.allocated_budget) - Number(budget!.spent_budget);

        expect(finalBalance).toBe(0);
        expect(finalBalance).toBeGreaterThanOrEqual(0);

        // Cleanup
        await dbWrite
          .delete(agentBudgetTransactions)
          .where(eq(agentBudgetTransactions.agent_id, agentId));
        await dbWrite
          .delete(agentBudgets)
          .where(eq(agentBudgets.agent_id, agentId));
        await cleanupTestData(connectionString, testData.organization.id);
      },
      TEST_TIMEOUT,
    );

    test(
      "Concurrent allocations from org credits maintain org balance integrity",
      async () => {
        // Arrange: Org with $50, agent needs allocations totaling $100
        const testData = await createTestDataSet(connectionString, {
          creditBalance: 50,
          includeCharacter: true,
          characterName: "Allocation Race Test Agent",
        });

        const agentId = testData.character!.id;
        await agentBudgetService.getOrCreateBudget(agentId);

        // Act: Fire 10 concurrent $10 allocations (total $100, but only $50 available)
        const promises = Array.from({ length: 10 }, (_, i) =>
          agentBudgetService.allocateBudget({
            agentId,
            amount: 10,
            fromOrgCredits: true,
            description: `Concurrent allocation ${i + 1}`,
          }),
        );

        const results = await Promise.allSettled(promises);

        // Assert: Exactly 5 should succeed (org has $50)
        const successes = results.filter(
          (r) => r.status === "fulfilled" && r.value.success,
        );

        expect(successes.length).toBe(5);

        // CRITICAL: Org balance should be exactly $0
        const org = await dbRead.query.organizations.findFirst({
          where: eq(organizations.id, testData.organization.id),
        });
        const orgBalance = Number(org?.credit_balance);

        expect(orgBalance).toBe(0);
        expect(orgBalance).toBeGreaterThanOrEqual(0);

        // Agent budget should be exactly $50
        const budget = await agentBudgetService.getBudget(agentId);
        expect(Number(budget!.allocated_budget)).toBe(50);

        // Cleanup
        await dbWrite
          .delete(agentBudgetTransactions)
          .where(eq(agentBudgetTransactions.agent_id, agentId));
        await dbWrite
          .delete(agentBudgets)
          .where(eq(agentBudgets.agent_id, agentId));
        await cleanupTestData(connectionString, testData.organization.id);
      },
      TEST_TIMEOUT,
    );
  });

  // ===========================================================================
  // Redeemable Earnings Service Concurrency Tests
  // ===========================================================================

  describe("Redeemable Earnings Service", () => {
    test(
      "CRITICAL: 20 concurrent $1 redemption locks on $10 earnings",
      async () => {
        // Arrange
        const testData = await createTestDataSet(connectionString, {
          creditBalance: 100,
        });

        const userId = testData.user.id;

        // Add $10 in earnings
        await redeemableEarningsService.addEarnings({
          userId,
          amount: INITIAL_BALANCE,
          source: "miniapp",
          sourceId: uuidv4(),
          description: "Initial earnings for race test",
        });

        // Act: Fire concurrent lock requests (each with unique redemptionId)
        const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
          redeemableEarningsService.lockForRedemption({
            userId,
            amount: AMOUNT_PER_OPERATION,
            redemptionId: uuidv4(),
          }),
        );

        const results = await Promise.allSettled(promises);

        // Assert
        const successes = results.filter(
          (r) => r.status === "fulfilled" && r.value.success,
        );
        const failures = results.filter(
          (r) =>
            r.status === "fulfilled" &&
            (!r.value.success || r.value.error?.includes("Insufficient")),
        );

        expect(successes.length).toBe(EXPECTED_SUCCESSES);
        expect(failures.length).toBe(EXPECTED_FAILURES);

        // CRITICAL: Available balance must be exactly $0
        const balance = await redeemableEarningsService.getBalance(userId);

        expect(balance!.availableBalance).toBe(0);
        expect(balance!.availableBalance).toBeGreaterThanOrEqual(0);
        expect(balance!.totalPending).toBe(INITIAL_BALANCE);

        // Cleanup
        await dbWrite
          .delete(redeemableEarningsLedger)
          .where(eq(redeemableEarningsLedger.user_id, userId));
        await dbWrite
          .delete(redeemableEarnings)
          .where(eq(redeemableEarnings.user_id, userId));
        await cleanupTestData(connectionString, testData.organization.id);
      },
      TEST_TIMEOUT,
    );

    test(
      "Concurrent earnings additions are all recorded",
      async () => {
        // Arrange
        const testData = await createTestDataSet(connectionString, {
          creditBalance: 100,
        });

        const userId = testData.user.id;

        // Act: Fire concurrent earning additions
        const promises = Array.from({ length: 20 }, (_, i) =>
          redeemableEarningsService.addEarnings({
            userId,
            amount: 5,
            source: "agent",
            sourceId: uuidv4(),
            description: `Concurrent earning ${i + 1}`,
          }),
        );

        await Promise.allSettled(promises);

        // Assert: All $100 should be recorded (20 × $5)
        const balance = await redeemableEarningsService.getBalance(userId);

        expect(balance!.totalEarned).toBe(100);
        expect(balance!.availableBalance).toBe(100);

        // Verify all ledger entries exist
        const history = await redeemableEarningsService.getLedgerHistory(
          userId,
          50,
        );
        expect(history.length).toBe(20);

        // Cleanup
        await dbWrite
          .delete(redeemableEarningsLedger)
          .where(eq(redeemableEarningsLedger.user_id, userId));
        await dbWrite
          .delete(redeemableEarnings)
          .where(eq(redeemableEarnings.user_id, userId));
        await cleanupTestData(connectionString, testData.organization.id);
      },
      TEST_TIMEOUT,
    );
  });

  // ===========================================================================
  // Cross-Service Concurrency Tests
  // ===========================================================================

  describe("Cross-Service Operations", () => {
    test(
      "Concurrent budget allocation and org credit deduction maintain consistency",
      async () => {
        // Arrange: Org with $100, will have concurrent budget allocations and direct deductions
        const testData = await createTestDataSet(connectionString, {
          creditBalance: 100,
          includeCharacter: true,
          characterName: "Cross-Service Test Agent",
        });

        const agentId = testData.character!.id;
        await agentBudgetService.getOrCreateBudget(agentId);

        // Act: Concurrent operations on same org balance
        const allocationPromises = Array.from({ length: 5 }, (_, i) =>
          agentBudgetService.allocateBudget({
            agentId,
            amount: 10,
            fromOrgCredits: true,
            description: `Allocation ${i + 1}`,
          }),
        );

        const deductionPromises = Array.from({ length: 5 }, (_, i) =>
          creditsService.reserveAndDeductCredits({
            organizationId: testData.organization.id,
            amount: 10,
            description: `Deduction ${i + 1}`,
          }),
        );

        await Promise.allSettled([...allocationPromises, ...deductionPromises]);

        // Assert: Total operations should equal initial balance
        const org = await dbRead.query.organizations.findFirst({
          where: eq(organizations.id, testData.organization.id),
        });
        const budget = await agentBudgetService.getBudget(agentId);

        const orgBalance = Number(org?.credit_balance);
        const budgetAllocated = Number(budget?.allocated_budget || 0);

        // Sum should not exceed initial balance
        expect(orgBalance + budgetAllocated).toBeLessThanOrEqual(100);
        expect(orgBalance).toBeGreaterThanOrEqual(0);

        // Cleanup
        await dbWrite
          .delete(agentBudgetTransactions)
          .where(eq(agentBudgetTransactions.agent_id, agentId));
        await dbWrite
          .delete(agentBudgets)
          .where(eq(agentBudgets.agent_id, agentId));
        await cleanupTestData(connectionString, testData.organization.id);
      },
      TEST_TIMEOUT,
    );
  });

  // ===========================================================================
  // Stress Tests
  // ===========================================================================

  describe("Stress Tests", () => {
    test(
      "100 concurrent operations on credits service",
      async () => {
        // Arrange
        const testData = await createTestDataSet(connectionString, {
          creditBalance: 50,
          organizationName: "Stress Test Org",
        });

        // Act: Fire 100 concurrent $1 deductions
        const promises = Array.from({ length: 100 }, (_, i) =>
          creditsService.reserveAndDeductCredits({
            organizationId: testData.organization.id,
            amount: 1,
            description: `Stress test ${i + 1}`,
          }),
        );

        await Promise.allSettled(promises);

        // Assert: Balance must never go negative
        const org = await dbRead.query.organizations.findFirst({
          where: eq(organizations.id, testData.organization.id),
        });
        const finalBalance = Number(org?.credit_balance);

        expect(finalBalance).toBeGreaterThanOrEqual(0);
        expect(finalBalance).toBe(0); // All $50 should be spent

        // Cleanup
        await cleanupTestData(connectionString, testData.organization.id);
      },
      TEST_TIMEOUT * 2,
    );
  });
});
