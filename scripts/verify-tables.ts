import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

async function verifyTables() {
  try {
    const tables = [
      "eliza_room_characters",
      "entities",
      "memories",
      "user_characters",
    ];

    console.log("\n🔍 Verifying database tables...\n");

    for (const table of tables) {
      try {
        const result = await db.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = ${table}
          );
        `);

        const exists = result.rows[0]?.exists;
        console.log(
          `${exists ? "✅" : "❌"} Table "${table}": ${exists ? "EXISTS" : "MISSING"}`,
        );
      } catch (error) {
        console.error(`❌ Error checking table "${table}":`, error);
      }
    }

    console.log("\n✨ Verification complete!\n");
  } catch (error) {
    console.error("Error verifying tables:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyTables();
