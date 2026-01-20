/**
 * Property-Based Tests for Financial Invariants
 *
 * Uses fast-check to generate random sequences of operations and verify
 * that critical invariants are ALWAYS maintained.
 *
 * Key Invariants:
 * 1. Balance >= 0 after any sequence of operations
 * 2. Sum of all transactions = final balance
 * 3. total_earned >= total_redeemed + total_pending
 * 4. allocated_budget >= spent_budget (agent budgets)
 *
 * @see https://github.com/dubzzz/fast-check
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import fc from "fast-check";
import { v4 as uuidv4 } from "uuid";
import { dbWrite, dbRead } from "@/db/client";
import { organizations } from "@/db/schemas/organizations";
import { creditTransactions } from "@/db/schemas/credit-transactions";
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
} from "@/tests/helpers/test-data-factory";
import { getConnectionString } from "@/tests/helpers/local-database";

/**
 * Property test configuration
 *
 * Keep runs low - each run creates a full test data set in the DB.
 */
const PROPERTY_TEST_RUNS = 5;
const MAX_OPERATIONS = 10;
const TEST_TIMEOUT = 120000;

describe("Financial Invariants (Property-Based)", () => {
  let connectionString: string;

  beforeAll(async () => {
    connectionString = getConnectionString();
  });

  // ===========================================================================
  // Credits Service Invariants
  // ===========================================================================

  describe("Credits Service Invariants", () => {
    test(
      "INVARIANT: balance >= 0 after random add/deduct operations",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            // Generate random operations
            fc.array(
              fc.record({
                type: fc.constantFrom("add", "deduct"),
                amount: fc.double({ min: 0.01, max: 50, noNaN: true }),
              }),
              { minLength: 1, maxLength: MAX_OPERATIONS },
            ),
            fc.double({ min: 10, max: 100, noNaN: true }), // Initial balance
            async (operations, initialBalance) => {
              // Setup
              const testData = await createTestDataSet(connectionString, {
                creditBalance: initialBalance,
                organizationName: `PropTest Org ${uuidv4().slice(0, 8)}`,
              });

              try {
                // Execute operations
                for (const op of operations) {
                  if (op.type === "add") {
                    await creditsService.addCredits({
                      organizationId: testData.organization.id,
                      amount: op.amount,
                      description: "Property test add",
                    });
                  } else {
                    await creditsService.reserveAndDeductCredits({
                      organizationId: testData.organization.id,
                      amount: op.amount,
                      description: "Property test deduct",
                    });
                  }
                }

                // Verify invariant
                const org = await dbRead.query.organizations.findFirst({
                  where: eq(organizations.id, testData.organization.id),
                });

                const finalBalance = Number(org?.credit_balance);

                // INVARIANT: Balance must never be negative
                expect(finalBalance).toBeGreaterThanOrEqual(0);

                return true;
              } finally {
                // Cleanup
                await cleanupTestData(
                  connectionString,
                  testData.organization.id,
                );
              }
            },
          ),
          { numRuns: PROPERTY_TEST_RUNS },
        );
      },
      TEST_TIMEOUT,
    );

    test(
      "INVARIANT: sum of transactions equals balance change",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(
              fc.record({
                type: fc.constantFrom("add", "deduct"),
                amount: fc.double({ min: 1, max: 20, noNaN: true }),
              }),
              { minLength: 1, maxLength: 10 },
            ),
            async (operations) => {
              const initialBalance = 100;

              const testData = await createTestDataSet(connectionString, {
                creditBalance: initialBalance,
                organizationName: `TxnSum Test ${uuidv4().slice(0, 8)}`,
              });

              try {
                let expectedBalance = initialBalance;

                for (const op of operations) {
                  if (op.type === "add") {
                    const result = await creditsService.addCredits({
                      organizationId: testData.organization.id,
                      amount: op.amount,
                      description: "Sum test add",
                    });
                    if (result.transaction) {
                      expectedBalance += op.amount;
                    }
                  } else {
                    const result = await creditsService.reserveAndDeductCredits(
                      {
                        organizationId: testData.organization.id,
                        amount: op.amount,
                        description: "Sum test deduct",
                      },
                    );
                    if (result.success) {
                      expectedBalance -= op.amount;
                    }
                  }
                }

                // Verify
                const org = await dbRead.query.organizations.findFirst({
                  where: eq(organizations.id, testData.organization.id),
                });

                const finalBalance = Number(org?.credit_balance);

                // INVARIANT: Calculated balance should match actual
                // Use tolerance for floating point (0.02 to account for cumulative errors)
                expect(Math.abs(finalBalance - expectedBalance)).toBeLessThan(
                  0.02,
                );

                return true;
              } finally {
                await cleanupTestData(
                  connectionString,
                  testData.organization.id,
                );
              }
            },
          ),
          { numRuns: Math.floor(PROPERTY_TEST_RUNS / 2) },
        );
      },
      TEST_TIMEOUT,
    );
  });

  // ===========================================================================
  // Agent Budget Service Invariants
  // ===========================================================================

  describe("Agent Budget Service Invariants", () => {
    test(
      "INVARIANT: available budget >= 0 after random deductions",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.double({ min: 0.5, max: 10, noNaN: true }), {
              minLength: 1,
              maxLength: 20,
            }),
            async (deductionAmounts) => {
              const testData = await createTestDataSet(connectionString, {
                creditBalance: 200,
                includeCharacter: true,
                characterName: `Budget PropTest ${uuidv4().slice(0, 8)}`,
              });

              const agentId = testData.character!.id;

              try {
                // Create budget and allocate funds
                await agentBudgetService.getOrCreateBudget(agentId);
                await agentBudgetService.allocateBudget({
                  agentId,
                  amount: 50, // Fixed allocation
                  fromOrgCredits: true,
                });

                // Execute random deductions
                for (const amount of deductionAmounts) {
                  await agentBudgetService.deductBudget({
                    agentId,
                    amount,
                    description: "Property test deduction",
                  });
                }

                // Verify invariant
                const budget = await agentBudgetService.getBudget(agentId);
                const allocated = Number(budget!.allocated_budget);
                const spent = Number(budget!.spent_budget);
                const available = allocated - spent;

                // INVARIANT: Available balance must never be negative
                expect(available).toBeGreaterThanOrEqual(0);

                // INVARIANT: Spent must never exceed allocated
                expect(spent).toBeLessThanOrEqual(allocated);

                return true;
              } finally {
                // Cleanup
                await dbWrite
                  .delete(agentBudgetTransactions)
                  .where(eq(agentBudgetTransactions.agent_id, agentId));
                await dbWrite
                  .delete(agentBudgets)
                  .where(eq(agentBudgets.agent_id, agentId));
                await cleanupTestData(
                  connectionString,
                  testData.organization.id,
                );
              }
            },
          ),
          { numRuns: PROPERTY_TEST_RUNS },
        );
      },
      TEST_TIMEOUT,
    );

    test(
      "INVARIANT: daily_spent <= daily_limit when limit is set",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.double({ min: 0.1, max: 5, noNaN: true }), {
              minLength: 1,
              maxLength: 15,
            }),
            fc.double({ min: 5, max: 20, noNaN: true }), // Daily limit
            async (deductions, dailyLimit) => {
              const testData = await createTestDataSet(connectionString, {
                creditBalance: 200,
                includeCharacter: true,
                characterName: `DailyLimit Test ${uuidv4().slice(0, 8)}`,
              });

              const agentId = testData.character!.id;

              try {
                await agentBudgetService.getOrCreateBudget(agentId);
                await agentBudgetService.allocateBudget({
                  agentId,
                  amount: 100,
                  fromOrgCredits: true,
                });

                // Set daily limit
                await agentBudgetService.updateSettings(agentId, {
                  dailyLimit,
                });

                // Execute deductions
                for (const amount of deductions) {
                  await agentBudgetService.deductBudget({
                    agentId,
                    amount,
                    description: "Daily limit test",
                  });
                }

                // Verify invariant
                const budget = await agentBudgetService.getBudget(agentId);
                const dailySpent = Number(budget!.daily_spent);
                const limit = Number(budget!.daily_limit);

                // INVARIANT: Daily spent must not exceed daily limit
                expect(dailySpent).toBeLessThanOrEqual(limit + 0.01); // Small tolerance

                return true;
              } finally {
                await dbWrite
                  .delete(agentBudgetTransactions)
                  .where(eq(agentBudgetTransactions.agent_id, agentId));
                await dbWrite
                  .delete(agentBudgets)
                  .where(eq(agentBudgets.agent_id, agentId));
                await cleanupTestData(
                  connectionString,
                  testData.organization.id,
                );
              }
            },
          ),
          { numRuns: Math.floor(PROPERTY_TEST_RUNS / 2) },
        );
      },
      TEST_TIMEOUT,
    );
  });

  // ===========================================================================
  // Redeemable Earnings Service Invariants
  // ===========================================================================

  describe("Redeemable Earnings Service Invariants", () => {
    test(
      "INVARIANT: available_balance >= 0 after random operations",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(
              fc.record({
                type: fc.constantFrom("earn", "lock"),
                amount: fc.double({ min: 1, max: 20, noNaN: true }),
                source: fc.constantFrom(
                  "miniapp",
                  "agent",
                  "mcp",
                ) as fc.Arbitrary<"miniapp" | "agent" | "mcp">,
              }),
              { minLength: 1, maxLength: 20 },
            ),
            async (operations) => {
              const testData = await createTestDataSet(connectionString, {
                creditBalance: 100,
              });

              const userId = testData.user.id;

              try {
                // First add some initial earnings
                await redeemableEarningsService.addEarnings({
                  userId,
                  amount: 50,
                  source: "miniapp",
                  sourceId: uuidv4(),
                  description: "Initial earnings",
                });

                // Execute operations
                for (const op of operations) {
                  if (op.type === "earn") {
                    await redeemableEarningsService.addEarnings({
                      userId,
                      amount: op.amount,
                      source: op.source,
                      sourceId: uuidv4(),
                      description: "Property test earning",
                    });
                  } else {
                    await redeemableEarningsService.lockForRedemption({
                      userId,
                      amount: op.amount,
                      redemptionId: uuidv4(),
                    });
                  }
                }

                // Verify invariants
                const balance =
                  await redeemableEarningsService.getBalance(userId);

                if (balance) {
                  // INVARIANT: Available balance must never be negative
                  expect(balance.availableBalance).toBeGreaterThanOrEqual(0);

                  // INVARIANT: total_earned >= total_redeemed + total_pending
                  expect(balance.totalEarned).toBeGreaterThanOrEqual(
                    balance.totalRedeemed + balance.totalPending - 0.01,
                  );

                  // INVARIANT: available = earned - redeemed - pending
                  const calculatedAvailable =
                    balance.totalEarned -
                    balance.totalRedeemed -
                    balance.totalPending;
                  expect(
                    Math.abs(balance.availableBalance - calculatedAvailable),
                  ).toBeLessThan(0.01);
                }

                return true;
              } finally {
                await dbWrite
                  .delete(redeemableEarningsLedger)
                  .where(eq(redeemableEarningsLedger.user_id, userId));
                await dbWrite
                  .delete(redeemableEarnings)
                  .where(eq(redeemableEarnings.user_id, userId));
                await cleanupTestData(
                  connectionString,
                  testData.organization.id,
                );
              }
            },
          ),
          { numRuns: PROPERTY_TEST_RUNS },
        );
      },
      TEST_TIMEOUT,
    );

    test(
      "INVARIANT: source breakdown sums to total earned",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(
              fc.record({
                amount: fc.double({ min: 1, max: 30, noNaN: true }),
                source: fc.constantFrom(
                  "miniapp",
                  "agent",
                  "mcp",
                ) as fc.Arbitrary<"miniapp" | "agent" | "mcp">,
              }),
              { minLength: 1, maxLength: 15 },
            ),
            async (earnings) => {
              const testData = await createTestDataSet(connectionString, {
                creditBalance: 100,
              });

              const userId = testData.user.id;

              try {
                // Add earnings
                for (const earning of earnings) {
                  await redeemableEarningsService.addEarnings({
                    userId,
                    amount: earning.amount,
                    source: earning.source,
                    sourceId: uuidv4(),
                    description: `Source breakdown test - ${earning.source}`,
                  });
                }

                // Verify
                const balance =
                  await redeemableEarningsService.getBalance(userId);

                if (balance) {
                  const sumOfSources =
                    balance.breakdown.miniapps +
                    balance.breakdown.agents +
                    balance.breakdown.mcps;

                  // INVARIANT: Sum of sources = total earned
                  expect(
                    Math.abs(sumOfSources - balance.totalEarned),
                  ).toBeLessThan(0.01);
                }

                return true;
              } finally {
                await dbWrite
                  .delete(redeemableEarningsLedger)
                  .where(eq(redeemableEarningsLedger.user_id, userId));
                await dbWrite
                  .delete(redeemableEarnings)
                  .where(eq(redeemableEarnings.user_id, userId));
                await cleanupTestData(
                  connectionString,
                  testData.organization.id,
                );
              }
            },
          ),
          { numRuns: Math.floor(PROPERTY_TEST_RUNS / 2) },
        );
      },
      TEST_TIMEOUT,
    );
  });

  // ===========================================================================
  // Cross-Service Invariants
  // ===========================================================================

  describe("Cross-Service Invariants", () => {
    test(
      "INVARIANT: org credits + allocated budgets <= original total",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.double({ min: 5, max: 30, noNaN: true }), {
              minLength: 1,
              maxLength: 5,
            }),
            async (allocations) => {
              const initialOrgBalance = 200;

              const testData = await createTestDataSet(connectionString, {
                creditBalance: initialOrgBalance,
                includeCharacter: true,
                characterName: `CrossService ${uuidv4().slice(0, 8)}`,
              });

              const agentId = testData.character!.id;

              try {
                await agentBudgetService.getOrCreateBudget(agentId);

                // Perform allocations
                for (const amount of allocations) {
                  await agentBudgetService.allocateBudget({
                    agentId,
                    amount,
                    fromOrgCredits: true,
                  });
                }

                // Verify
                const org = await dbRead.query.organizations.findFirst({
                  where: eq(organizations.id, testData.organization.id),
                });
                const budget = await agentBudgetService.getBudget(agentId);

                const orgBalance = Number(org?.credit_balance);
                const budgetAllocated = Number(budget?.allocated_budget || 0);

                // INVARIANT: Total must not exceed original
                expect(orgBalance + budgetAllocated).toBeLessThanOrEqual(
                  initialOrgBalance + 0.01,
                );

                // INVARIANT: Neither can be negative
                expect(orgBalance).toBeGreaterThanOrEqual(0);
                expect(budgetAllocated).toBeGreaterThanOrEqual(0);

                return true;
              } finally {
                await dbWrite
                  .delete(agentBudgetTransactions)
                  .where(eq(agentBudgetTransactions.agent_id, agentId));
                await dbWrite
                  .delete(agentBudgets)
                  .where(eq(agentBudgets.agent_id, agentId));
                await cleanupTestData(
                  connectionString,
                  testData.organization.id,
                );
              }
            },
          ),
          { numRuns: Math.floor(PROPERTY_TEST_RUNS / 2) },
        );
      },
      TEST_TIMEOUT,
    );
  });
});
