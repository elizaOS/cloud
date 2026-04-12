import { createHash } from "node:crypto";
import { Client } from "pg";
import {
  createPlaywrightTestSessionToken,
  PLAYWRIGHT_TEST_SESSION_COOKIE_NAME,
} from "../../lib/auth/playwright-test-session";

const TEST_ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const TEST_ORGANIZATION_NAME = "Local Live Test Organization";
const TEST_ORGANIZATION_SLUG = "local-live-test-organization";
const TEST_ORGANIZATION_CREDIT_BALANCE = "100.000000";

const TEST_USER_ID = "22222222-2222-4222-8222-222222222222";
const TEST_USER_EMAIL = "local-live-test-user@milady.local";
const TEST_USER_NAME = "Local Live Test User";
const TEST_USER_WALLET = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const TEST_API_KEY_ID = "33333333-3333-4333-8333-333333333333";
const TEST_API_KEY_NAME = "Local Live Test API Key";
const TEST_API_KEY_VALUE = "eliza_test_local_live_infra_key";

const TEST_ADMIN_ID = "44444444-4444-4444-8444-444444444444";
const TEST_AUTH_SECRET = "playwright-local-auth-secret";

let bootstrapPromise: Promise<LocalTestAuthContext> | null = null;

export type LocalTestAuthContext = {
  organizationId: string;
  userId: string;
  apiKey: string;
  sessionCookieName: string;
  sessionToken: string;
};

function getDatabaseUrl(): string {
  const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL or DATABASE_URL is required for live auth bootstrap");
  }
  return connectionString;
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function getApiKeyPrefix(key: string): string {
  return key.slice(0, 12);
}

async function ensureSchemaCompatibility(client: Client): Promise<void> {
  await client.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS steward_user_id text;
  `);

  await client.query(`
    ALTER TABLE user_identities
      ADD COLUMN IF NOT EXISTS steward_user_id text;
  `);

  await client.query(`
    ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS steward_tenant_id text,
      ADD COLUMN IF NOT EXISTS steward_tenant_api_key text;
  `);
}

async function upsertOrganization(client: Client): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO organizations (id, name, slug, credit_balance, is_active, settings)
     VALUES ($1, $2, $3, $4, true, '{}'::jsonb)
     ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           credit_balance = GREATEST(organizations.credit_balance, EXCLUDED.credit_balance),
           is_active = true,
           updated_at = NOW()
     RETURNING id`,
    [
      TEST_ORGANIZATION_ID,
      TEST_ORGANIZATION_NAME,
      TEST_ORGANIZATION_SLUG,
      TEST_ORGANIZATION_CREDIT_BALANCE,
    ],
  );

  return result.rows[0]!.id;
}

async function upsertUser(client: Client, organizationId: string): Promise<string> {
  const existingUsers = await client.query<{ id: string }>(
    `SELECT id
       FROM users
      WHERE email = $1 OR wallet_address = $2
      ORDER BY CASE WHEN email = $1 THEN 0 ELSE 1 END
      LIMIT 2`,
    [TEST_USER_EMAIL, TEST_USER_WALLET],
  );

  if (existingUsers.rowCount && existingUsers.rowCount > 1) {
    throw new Error(
      `Found multiple local live test users for ${TEST_USER_EMAIL}/${TEST_USER_WALLET}; clean the local test database before rerunning live tests.`,
    );
  }

  if (existingUsers.rowCount === 1) {
    const result = await client.query<{ id: string }>(
      `UPDATE users
          SET email = $2,
              name = $3,
              organization_id = $4,
              role = 'owner',
              is_anonymous = false,
              is_active = true,
              email_verified = true,
              wallet_address = $5,
              wallet_chain_type = 'evm',
              wallet_verified = true,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id`,
      [existingUsers.rows[0]!.id, TEST_USER_EMAIL, TEST_USER_NAME, organizationId, TEST_USER_WALLET],
    );

    return result.rows[0]!.id;
  }

  const result = await client.query<{ id: string }>(
    `INSERT INTO users (
       id,
       email,
       name,
       organization_id,
       role,
       is_anonymous,
       is_active,
       email_verified,
       wallet_address,
       wallet_chain_type,
       wallet_verified
     )
     VALUES ($1, $2, $3, $4, 'owner', false, true, true, $5, 'evm', true)
     RETURNING id`,
    [TEST_USER_ID, TEST_USER_EMAIL, TEST_USER_NAME, organizationId, TEST_USER_WALLET],
  );

  return result.rows[0]!.id;
}

async function upsertAdmin(client: Client, userId: string): Promise<void> {
  await client.query(
    `INSERT INTO admin_users (id, user_id, wallet_address, role, is_active, notes)
     VALUES ($1, $2, $3, 'super_admin', true, $4)
     ON CONFLICT (wallet_address) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           role = 'super_admin',
           is_active = true,
           revoked_at = NULL,
           updated_at = NOW(),
           notes = EXCLUDED.notes`,
    [TEST_ADMIN_ID, userId, TEST_USER_WALLET, "Local live test admin account"],
  );
}

async function upsertApiKey(
  client: Client,
  organizationId: string,
  userId: string,
): Promise<string> {
  const keyHash = hashApiKey(TEST_API_KEY_VALUE);
  const keyPrefix = getApiKeyPrefix(TEST_API_KEY_VALUE);

  await client.query(
    `INSERT INTO api_keys (
       id,
       name,
       description,
       key,
       key_hash,
       key_prefix,
       organization_id,
       user_id,
       permissions,
       rate_limit,
       is_active
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '[]'::jsonb, 1000, true)
     ON CONFLICT (key) DO UPDATE
       SET name = EXCLUDED.name,
           description = EXCLUDED.description,
           key_hash = EXCLUDED.key_hash,
           key_prefix = EXCLUDED.key_prefix,
           organization_id = EXCLUDED.organization_id,
           user_id = EXCLUDED.user_id,
           permissions = EXCLUDED.permissions,
           rate_limit = EXCLUDED.rate_limit,
           is_active = true,
           expires_at = NULL,
           updated_at = NOW()`,
    [
      TEST_API_KEY_ID,
      TEST_API_KEY_NAME,
      "Stable API key for local live infra tests",
      TEST_API_KEY_VALUE,
      keyHash,
      keyPrefix,
      organizationId,
      userId,
    ],
  );

  return TEST_API_KEY_VALUE;
}

async function bootstrapLocalTestAuth(): Promise<LocalTestAuthContext> {
  process.env.PLAYWRIGHT_TEST_AUTH = process.env.PLAYWRIGHT_TEST_AUTH ?? "true";
  process.env.PLAYWRIGHT_TEST_AUTH_SECRET =
    process.env.PLAYWRIGHT_TEST_AUTH_SECRET ?? TEST_AUTH_SECRET;

  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();

  try {
    await client.query("BEGIN");
    await ensureSchemaCompatibility(client);

    const organizationId = await upsertOrganization(client);
    const userId = await upsertUser(client, organizationId);
    await upsertAdmin(client, userId);
    const apiKey = await upsertApiKey(client, organizationId, userId);

    await client.query("COMMIT");

    const sessionToken = createPlaywrightTestSessionToken(userId, organizationId);

    process.env.TEST_API_KEY = apiKey;
    process.env.TEST_USER_ID = userId;
    process.env.TEST_USER_EMAIL = TEST_USER_EMAIL;
    process.env.TEST_ORGANIZATION_ID = organizationId;
    process.env.TEST_SESSION_COOKIE_NAME = PLAYWRIGHT_TEST_SESSION_COOKIE_NAME;

    return {
      organizationId,
      userId,
      apiKey,
      sessionCookieName: PLAYWRIGHT_TEST_SESSION_COOKIE_NAME,
      sessionToken,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export function ensureLocalTestAuth(): Promise<LocalTestAuthContext> {
  bootstrapPromise ??= bootstrapLocalTestAuth();
  return bootstrapPromise;
}
