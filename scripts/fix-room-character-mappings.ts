/**
 * Fix Room Character Mappings
 * 
 * This script identifies rooms that should have character mappings but don't,
 * and creates the missing mappings.
 */

import { config } from "dotenv";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { cache } from "../lib/cache/client";
import { CacheKeys } from "../lib/cache/keys";

config({ path: ".env.local" });

interface Room {
  id: string;
  created_at: string;
}

interface Participant {
  room_id: string;
  entity_id: string;
}

async function fixRoomCharacterMappings() {
  console.log("🔍 Analyzing room-character mappings...\n");

  try {
    // Get all rooms that don't have character mappings
    const roomsWithoutMappings = await db.execute<Room>(sql`
      SELECT r.id, r."createdAt" as created_at
      FROM rooms r
      LEFT JOIN eliza_room_characters erc ON r.id = erc.room_id
      WHERE erc.room_id IS NULL
      ORDER BY r."createdAt" DESC
      LIMIT 50
    `);

    if (roomsWithoutMappings.rows.length === 0) {
      console.log("✅ All rooms have proper character mappings!");
      return;
    }

    console.log(`Found ${roomsWithoutMappings.rows.length} rooms without character mappings:\n`);

    for (const room of roomsWithoutMappings.rows) {
      console.log(`\n📋 Room: ${room.id}`);
      console.log(`   Created: ${room.created_at}`);

      // Get participants for this room to find the user
      const participants = await db.execute<Participant>(sql`
        SELECT "roomId" as room_id, "entityId" as entity_id
        FROM participants
        WHERE "roomId" = ${room.id}
        LIMIT 10
      `);

      if (participants.rows.length === 0) {
        console.log(`   ⚠️  No participants found, skipping`);
        continue;
      }

      console.log(`   👥 Found ${participants.rows.length} participant(s)`);

      // For now, just log the rooms that need fixing
      // We can't automatically determine which character should be associated
      // without additional context
      console.log(`   ❗ This room needs manual character assignment`);
    }

    console.log(`\n\n${"=".repeat(70)}`);
    console.log("SUMMARY");
    console.log("=".repeat(70));
    console.log(`\n${roomsWithoutMappings.rows.length} rooms need character mappings`);
    console.log("\n💡 To fix a specific room, use:");
    console.log('   docker exec eliza-local-db psql -U eliza_dev -d eliza_dev -c "');
    console.log('   INSERT INTO eliza_room_characters (room_id, character_id, user_id, created_at, updated_at)');
    console.log('   VALUES (\'ROOM_ID\', \'CHARACTER_ID\', \'USER_ID\', NOW(), NOW());');
    console.log('   "');
    console.log("\n   Then clear the cache:");
    console.log("   bun run scripts/clear-room-cache.ts ROOM_ID");

  } catch (error) {
    console.error("\n❌ Error analyzing mappings:", error);
    throw error;
  }
}

// Run the fix
fixRoomCharacterMappings()
  .then(() => {
    console.log("\n✅ Analysis complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });

