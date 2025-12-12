import { db } from "@/db/client";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("Adding organization_id to secret_bindings...");
  
  // Add column
  await db.execute(sql`
    ALTER TABLE "secret_bindings" 
    ADD COLUMN IF NOT EXISTS "organization_id" UUID REFERENCES "organizations"("id") ON DELETE CASCADE
  `);
  
  // Backfill from secrets table
  await db.execute(sql`
    UPDATE "secret_bindings" sb
    SET "organization_id" = s."organization_id"
    FROM "secrets" s
    WHERE sb."secret_id" = s."id" AND sb."organization_id" IS NULL
  `);
  
  // Make NOT NULL
  await db.execute(sql`
    ALTER TABLE "secret_bindings" 
    ALTER COLUMN "organization_id" SET NOT NULL
  `);
  
  // Add index
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "secret_bindings_org_idx" 
    ON "secret_bindings" ("organization_id")
  `);
  
  console.log("Done!");
  process.exit(0);
}

migrate().catch(e => {
  console.error("Migration failed:", e);
  process.exit(1);
});
