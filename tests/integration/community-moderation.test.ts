/**
 * Integration Tests for Community Moderation System
 *
 * Tests actual database operations and service integrations.
 * Requires database connection AND the community moderation migration to be run.
 *
 * To run migration: bun run db:migrate
 *
 * Note: These tests are skipped if the org_token_gates table doesn't exist.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "bun:test";
import { db } from "@/db";
import { eq, and, sql } from "drizzle-orm";
import {
  orgTokenGates,
  orgMemberWallets,
  orgModerationEvents,
  orgSpamTracking,
  orgBlockedPatterns,
} from "@/db/schemas/org-community-moderation";
import { organizations } from "@/db/schemas/organizations";
import {
  orgPlatformConnections,
  orgPlatformServers,
} from "@/db/schemas/org-platforms";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// TABLE CHECK
// =============================================================================

let TABLES_EXIST = false;

// Quick check if tables exist
beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1 FROM org_token_gates LIMIT 0`);
    TABLES_EXIST = true;
  } catch {
    console.log(
      "\n[Community Moderation Integration Tests] SKIPPED - tables not migrated.",
    );
    console.log(
      "Run 'bun run db:migrate' to create the community moderation tables.\n",
    );
    TABLES_EXIST = false;
  }
});

// =============================================================================
// TEST SETUP
// =============================================================================

const TEST_ORG_ID = uuidv4();
const TEST_SERVER_ID = uuidv4();
const TEST_CONNECTION_ID = uuidv4();

let testOrgCreated = false;
let testServerCreated = false;
let testConnectionCreated = false;

async function setupTestData() {
  if (!TABLES_EXIST) return;

  try {
    await db.insert(organizations).values({
      id: TEST_ORG_ID,
      name: "Test Org for Community Moderation",
      slug: `test-org-cm-${Date.now()}`,
    });
    testOrgCreated = true;
  } catch {
    /* May already exist */
  }

  try {
    await db.insert(orgPlatformConnections).values({
      id: TEST_CONNECTION_ID,
      organization_id: TEST_ORG_ID,
      platform: "discord",
      platform_bot_id: "test-bot-id",
      platform_bot_username: "TestBot",
      status: "connected",
    });
    testConnectionCreated = true;
  } catch {
    /* May already exist */
  }

  try {
    await db.insert(orgPlatformServers).values({
      id: TEST_SERVER_ID,
      connection_id: TEST_CONNECTION_ID,
      organization_id: TEST_ORG_ID,
      server_id: "test-discord-server",
      server_name: "Test Server",
      enabled: true,
    });
    testServerCreated = true;
  } catch {
    /* May already exist */
  }
}

async function cleanupTestData() {
  if (!TABLES_EXIST) return;

  try {
    await db
      .delete(orgBlockedPatterns)
      .where(eq(orgBlockedPatterns.organization_id, TEST_ORG_ID));
    await db
      .delete(orgSpamTracking)
      .where(eq(orgSpamTracking.organization_id, TEST_ORG_ID));
    await db
      .delete(orgModerationEvents)
      .where(eq(orgModerationEvents.organization_id, TEST_ORG_ID));
    await db
      .delete(orgMemberWallets)
      .where(eq(orgMemberWallets.organization_id, TEST_ORG_ID));
    await db
      .delete(orgTokenGates)
      .where(eq(orgTokenGates.organization_id, TEST_ORG_ID));

    if (testServerCreated) {
      await db
        .delete(orgPlatformServers)
        .where(eq(orgPlatformServers.id, TEST_SERVER_ID));
    }
    if (testConnectionCreated) {
      await db
        .delete(orgPlatformConnections)
        .where(eq(orgPlatformConnections.id, TEST_CONNECTION_ID));
    }
    if (testOrgCreated) {
      await db.delete(organizations).where(eq(organizations.id, TEST_ORG_ID));
    }
  } catch {
    /* Ignore cleanup errors */
  }
}

// Helper to skip tests if tables don't exist
const itIfTables = (name: string, fn: () => Promise<void>) => {
  test(name, async () => {
    if (!TABLES_EXIST) {
      console.log(`  [SKIP] ${name}`);
      return;
    }
    await fn();
  });
};

// =============================================================================
// TOKEN GATES TESTS
// =============================================================================

describe("Token Gates Repository Integration", () => {
  beforeAll(async () => {
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    if (!TABLES_EXIST) return;
    await db
      .delete(orgTokenGates)
      .where(eq(orgTokenGates.organization_id, TEST_ORG_ID));
  });

  itIfTables("creates a token gate with all fields", async () => {
    const [gate] = await db
      .insert(orgTokenGates)
      .values({
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        name: "Test Token Gate",
        description: "A test token gate for integration testing",
        chain: "ethereum",
        token_type: "token",
        token_address: "0x1234567890abcdef1234567890abcdef12345678",
        min_balance: "1000000000000000000",
        discord_role_id: "role-123",
        enabled: true,
        priority: 10,
      })
      .returning();

    expect(gate.id).toBeDefined();
    expect(gate.name).toBe("Test Token Gate");
    expect(gate.chain).toBe("ethereum");
    expect(gate.min_balance).toBe("1000000000000000000");
  });

  itIfTables("finds token gates by server", async () => {
    await db.insert(orgTokenGates).values([
      {
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        name: "Gate 1",
        chain: "ethereum",
        token_type: "token",
        token_address: "0x1111111111111111111111111111111111111111",
        priority: 1,
      },
      {
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        name: "Gate 2",
        chain: "solana",
        token_type: "nft",
        token_address: "SoLaNaAdDrEsS",
        priority: 2,
      },
    ]);

    const gates = await db
      .select()
      .from(orgTokenGates)
      .where(eq(orgTokenGates.server_id, TEST_SERVER_ID));

    expect(gates.length).toBe(2);
  });

  itIfTables("updates token gate enabled status", async () => {
    const [gate] = await db
      .insert(orgTokenGates)
      .values({
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        name: "Toggle Gate",
        chain: "ethereum",
        token_type: "token",
        token_address: "0x2222222222222222222222222222222222222222",
        enabled: true,
      })
      .returning();

    const [updated] = await db
      .update(orgTokenGates)
      .set({ enabled: false, updated_at: new Date() })
      .where(eq(orgTokenGates.id, gate.id))
      .returning();

    expect(updated.enabled).toBe(false);
  });
});

// =============================================================================
// MODERATION EVENTS TESTS
// =============================================================================

describe("Moderation Events Repository Integration", () => {
  beforeAll(async () => {
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    if (!TABLES_EXIST) return;
    await db
      .delete(orgModerationEvents)
      .where(eq(orgModerationEvents.organization_id, TEST_ORG_ID));
  });

  itIfTables("creates moderation event with all fields", async () => {
    const [event] = await db
      .insert(orgModerationEvents)
      .values({
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        platform_user_id: "user-123",
        platform: "discord",
        platform_username: "TestUser",
        event_type: "spam",
        severity: "medium",
        message_id: "msg-456",
        channel_id: "channel-789",
        content_sample: "This is spam content",
        action_taken: "delete",
        detected_by: "auto",
        confidence_score: 95,
      })
      .returning();

    expect(event.id).toBeDefined();
    expect(event.event_type).toBe("spam");
    expect(event.severity).toBe("medium");
    expect(event.action_taken).toBe("delete");
  });

  itIfTables("counts violations excluding false positives", async () => {
    const userId = "user-violations";

    await db.insert(orgModerationEvents).values([
      {
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        platform_user_id: userId,
        platform: "discord",
        event_type: "spam",
        severity: "low",
        detected_by: "auto",
        false_positive: false,
      },
      {
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        platform_user_id: userId,
        platform: "discord",
        event_type: "spam",
        severity: "low",
        detected_by: "auto",
        false_positive: true,
      },
      {
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        platform_user_id: userId,
        platform: "discord",
        event_type: "scam",
        severity: "high",
        detected_by: "auto",
        false_positive: false,
      },
    ]);

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orgModerationEvents)
      .where(
        and(
          eq(orgModerationEvents.server_id, TEST_SERVER_ID),
          eq(orgModerationEvents.platform_user_id, userId),
          eq(orgModerationEvents.false_positive, false),
        ),
      );

    expect(Number(result.count)).toBe(2);
  });
});

// =============================================================================
// SPAM TRACKING TESTS
// =============================================================================

describe("Spam Tracking Repository Integration", () => {
  beforeAll(async () => {
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    if (!TABLES_EXIST) return;
    await db
      .delete(orgSpamTracking)
      .where(eq(orgSpamTracking.organization_id, TEST_ORG_ID));
  });

  itIfTables("creates spam tracking record", async () => {
    const [tracking] = await db
      .insert(orgSpamTracking)
      .values({
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        platform_user_id: "spammer-1",
        platform: "discord",
        recent_message_hashes: ["hash1", "hash2"],
        message_timestamps: [new Date().toISOString()],
      })
      .returning();

    expect(tracking.id).toBeDefined();
    expect((tracking.recent_message_hashes as string[]).length).toBe(2);
  });

  itIfTables("increments violation counts atomically", async () => {
    const [tracking] = await db
      .insert(orgSpamTracking)
      .values({
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        platform_user_id: "spammer-2",
        platform: "discord",
        total_violations: 0,
      })
      .returning();

    // Increment 5 times concurrently
    await Promise.all(
      Array.from({ length: 5 }, () =>
        db
          .update(orgSpamTracking)
          .set({
            total_violations: sql`${orgSpamTracking.total_violations} + 1`,
          })
          .where(eq(orgSpamTracking.id, tracking.id)),
      ),
    );

    const [updated] = await db
      .select()
      .from(orgSpamTracking)
      .where(eq(orgSpamTracking.id, tracking.id));

    expect(updated.total_violations).toBe(5);
  });
});

// =============================================================================
// BLOCKED PATTERNS TESTS
// =============================================================================

describe("Blocked Patterns Repository Integration", () => {
  beforeAll(async () => {
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    if (!TABLES_EXIST) return;
    await db
      .delete(orgBlockedPatterns)
      .where(eq(orgBlockedPatterns.organization_id, TEST_ORG_ID));
  });

  itIfTables("creates blocked pattern", async () => {
    const [pattern] = await db
      .insert(orgBlockedPatterns)
      .values({
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        pattern_type: "contains",
        pattern: "scam",
        category: "scam",
        action: "delete",
        severity: "high",
      })
      .returning();

    expect(pattern.id).toBeDefined();
    expect(pattern.pattern_type).toBe("contains");
    expect(pattern.category).toBe("scam");
  });

  itIfTables("creates org-wide pattern with null server_id", async () => {
    const [pattern] = await db
      .insert(orgBlockedPatterns)
      .values({
        organization_id: TEST_ORG_ID,
        server_id: null,
        pattern_type: "regex",
        pattern: "free\\s+nitro",
        category: "phishing",
        action: "ban",
        severity: "critical",
      })
      .returning();

    expect(pattern.server_id).toBeNull();
  });

  itIfTables("increments match count", async () => {
    const [pattern] = await db
      .insert(orgBlockedPatterns)
      .values({
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        pattern_type: "contains",
        pattern: "test",
        category: "spam",
        match_count: 0,
      })
      .returning();

    for (let i = 0; i < 3; i++) {
      await db
        .update(orgBlockedPatterns)
        .set({ match_count: sql`${orgBlockedPatterns.match_count} + 1` })
        .where(eq(orgBlockedPatterns.id, pattern.id));
    }

    const [updated] = await db
      .select()
      .from(orgBlockedPatterns)
      .where(eq(orgBlockedPatterns.id, pattern.id));

    expect(updated.match_count).toBe(3);
  });
});

// =============================================================================
// MEMBER WALLETS TESTS
// =============================================================================

describe("Member Wallets Repository Integration", () => {
  beforeAll(async () => {
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    if (!TABLES_EXIST) return;
    await db
      .delete(orgMemberWallets)
      .where(eq(orgMemberWallets.organization_id, TEST_ORG_ID));
  });

  itIfTables("creates member wallet", async () => {
    const [wallet] = await db
      .insert(orgMemberWallets)
      .values({
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        platform_user_id: "user-wallet-1",
        platform: "discord",
        wallet_address: "0xabcdef1234567890abcdef1234567890abcdef12",
        chain: "ethereum",
        verification_method: "signature",
        verified_at: new Date(),
        is_primary: true,
      })
      .returning();

    expect(wallet.id).toBeDefined();
    expect(wallet.chain).toBe("ethereum");
    expect(wallet.is_primary).toBe(true);
  });

  itIfTables("finds wallets by platform user", async () => {
    const userId = "multi-wallet-user";

    await db.insert(orgMemberWallets).values([
      {
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        platform_user_id: userId,
        platform: "discord",
        wallet_address: "0x1111111111111111111111111111111111111111",
        chain: "ethereum",
        is_primary: true,
      },
      {
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        platform_user_id: userId,
        platform: "discord",
        wallet_address: "SoLaNa1111111111111111111111111111111",
        chain: "solana",
        is_primary: false,
      },
    ]);

    const wallets = await db
      .select()
      .from(orgMemberWallets)
      .where(
        and(
          eq(orgMemberWallets.server_id, TEST_SERVER_ID),
          eq(orgMemberWallets.platform_user_id, userId),
          eq(orgMemberWallets.platform, "discord"),
        ),
      );

    expect(wallets.length).toBe(2);
  });

  itIfTables("updates wallet balance cache", async () => {
    const [wallet] = await db
      .insert(orgMemberWallets)
      .values({
        organization_id: TEST_ORG_ID,
        server_id: TEST_SERVER_ID,
        platform_user_id: "balance-user",
        platform: "discord",
        wallet_address: "0x2222222222222222222222222222222222222222",
        chain: "ethereum",
      })
      .returning();

    const balanceData = {
      tokens: { "0xtoken": "1000000000000000000" },
      nfts: [{ collection: "0xnft", tokenId: "123" }],
    };

    const [updated] = await db
      .update(orgMemberWallets)
      .set({
        last_balance: balanceData,
        last_checked_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(orgMemberWallets.id, wallet.id))
      .returning();

    expect(updated.last_balance).toBeDefined();
    expect((updated.last_balance as typeof balanceData).tokens["0xtoken"]).toBe(
      "1000000000000000000",
    );
  });
});
