/**
 * Regression test: JOIN-based read path in findByPrivyIdWithOrganizationUsingDb
 *
 * Verifies that the JOIN-based read path (commit 5c31c7732) returns the exact
 * same shape as the prior two-query relational API path. The concern is that
 * `.select({ user: users, organization: organizations })` spread could differ
 * from `database.query.users.findFirst({ with: { organization: true } })`.
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "bun:test";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { usersService } from "@/lib/services/users";
import { dbRead } from "@/db/helpers";
import { users } from "@/db/schemas/users";
import { userIdentities } from "@/db/schemas/user-identities";
import { organizations } from "@/db/schemas/organizations";
import {
  createTestDataSet,
  cleanupTestData,
  type TestDataSet,
} from "@/tests/helpers/test-data-factory";
import { getConnectionString } from "@/tests/helpers/local-database";

describe("JOIN-based read-path regression (5c31c7732)", () => {
  let connectionString: string;
  let testData: TestDataSet;

  beforeAll(async () => {
    connectionString = getConnectionString();
  });

  beforeEach(async () => {
    testData = await createTestDataSet(connectionString, {
      creditBalance: 100,
    });
  });

  afterAll(async () => {
    if (testData?.organization?.id) {
      await cleanupTestData(connectionString, testData.organization.id);
    }
  });

  test("getByPrivyId returns organization numeric fields matching relational query format", async () => {
    const privyId = `did:privy:${uuidv4()}`;

    // Setup: create user with privy ID and identity row
    await usersService.update(testData.user.id, { privy_user_id: privyId });
    await usersService.upsertPrivyIdentity(testData.user.id, privyId);

    // Get result via the service method (exercises the actual read path)
    const serviceUser = await usersService.getByPrivyId(privyId);
    expect(serviceUser).toBeDefined();

    // Get the reference result via the relational query API (known-good format)
    const relationalUser = await dbRead.query.users.findFirst({
      where: eq(users.id, testData.user.id),
      with: { organization: true },
    });
    expect(relationalUser).toBeDefined();

    // Core user fields must match
    expect(serviceUser!.id).toBe(relationalUser!.id);
    expect(serviceUser!.email).toBe(relationalUser!.email);
    expect(serviceUser!.privy_user_id).toBe(relationalUser!.privy_user_id);
    expect(serviceUser!.organization_id).toBe(relationalUser!.organization_id);

    // CRITICAL: Organization numeric fields must have consistent format.
    // The JOIN-based select() returns "100.00" while relational queries return "100".
    // This regression (5c31c7732) changed the format, breaking clients that compare strings.
    const serviceOrg = serviceUser!.organization!;
    const relOrg = (relationalUser as any).organization!;
    expect(serviceOrg.credit_balance).toBe(relOrg.credit_balance);
    expect(serviceOrg.id).toBe(relOrg.id);
    expect(serviceOrg.name).toBe(relOrg.name);
    expect(serviceOrg.slug).toBe(relOrg.slug);

    // Key names should match (no extra/missing properties)
    const serviceKeys = Object.keys(serviceUser!).sort();
    const relationalKeys = Object.keys(relationalUser!).sort();
    expect(serviceKeys).toEqual(relationalKeys);

    await cleanupTestData(connectionString, testData.organization.id);
  });

  test("JOIN path returns null organization when user has no org", async () => {
    // This tests left-join null mapping correctness
    const privyId = `did:privy:${uuidv4()}`;

    // Update user to have privy_id but set organization_id to null
    await usersService.update(testData.user.id, {
      privy_user_id: privyId,
      organization_id: null as any,
    });
    await usersService.upsertPrivyIdentity(testData.user.id, privyId);

    const [joinResult] = await dbRead
      .select({
        user: users,
        organization: organizations,
      })
      .from(userIdentities)
      .innerJoin(users, eq(users.id, userIdentities.user_id))
      .leftJoin(organizations, eq(organizations.id, users.organization_id))
      .where(eq(userIdentities.privy_user_id, privyId))
      .limit(1);

    expect(joinResult).toBeDefined();
    expect(joinResult.user.id).toBe(testData.user.id);
    // With left join and no match, Drizzle should return null
    expect(joinResult.organization).toBeNull();

    await cleanupTestData(connectionString, testData.organization.id);
  });

  test("getByPrivyId returns same org fields used by /api/v1/user route", async () => {
    const privyId = `did:privy:${uuidv4()}`;

    await usersService.update(testData.user.id, { privy_user_id: privyId });
    await usersService.upsertPrivyIdentity(testData.user.id, privyId);

    const user = await usersService.getByPrivyId(privyId);
    expect(user).toBeDefined();

    // These are the exact fields the /api/v1/user route accesses
    expect(user!.id).toBeDefined();
    expect(user!.email).toBeDefined();
    expect(user!.role).toBeDefined();
    expect(user!.is_active).toBeDefined();
    expect(user!.created_at).toBeDefined();
    expect(user!.updated_at).toBeDefined();

    // Organization fields accessed via user.organization?.X
    expect(user!.organization).toBeDefined();
    expect(user!.organization!.id).toBeDefined();
    expect(user!.organization!.name).toBeDefined();
    expect(user!.organization!.slug).toBeDefined();
    expect(user!.organization!.credit_balance).toBeDefined();

    await cleanupTestData(connectionString, testData.organization.id);
  });
});
