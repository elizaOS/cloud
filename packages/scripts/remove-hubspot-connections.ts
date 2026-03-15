#!/usr/bin/env bun
/**
 * Remove HubSpot OAuth connections from the database.
 * Use this to clear existing HubSpot connections so you can re-test the OAuth flow.
 *
 * Usage (from repo root):
 *   bun run scripts/remove-hubspot-connections.ts
 *   bun run scripts/remove-hubspot-connections.ts <organization-id>   # only that org
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

import { and, eq } from "drizzle-orm";
import { dbWrite } from "@/db/client";
import { platformCredentials } from "@/db/schemas/platform-credentials";

async function main() {
  const orgId = process.argv[2]?.trim();

  const condition = orgId
    ? and(
        eq(platformCredentials.platform, "hubspot"),
        eq(platformCredentials.organization_id, orgId),
      )
    : eq(platformCredentials.platform, "hubspot");

  const deleted = await dbWrite
    .delete(platformCredentials)
    .where(condition)
    .returning({ id: platformCredentials.id });

  console.log(`Removed ${deleted.length} HubSpot connection(s) from the database.`);
  if (orgId) {
    console.log(`(Scoped to organization: ${orgId})`);
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
