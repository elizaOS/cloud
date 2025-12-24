#!/usr/bin/env bun
/**
 * Database Cleanup Script: Fix Contaminated Rooms
 *
 * This script identifies and fixes rooms where the room's agentId doesn't match
 * the agentIds in the room's messages, which causes conversation contamination.
 *
 * The contamination occurred when BUILD mode updated room agentIds without
 * checking if it was a regular chat room, causing Character A's messages to
 * appear in Character B's room.
 *
 * Usage:
 *   bun scripts/fix-contaminated-rooms.ts [--dry-run] [--fix]
 *
 * Options:
 *   --dry-run   : Only report issues without making changes (default)
 *   --fix       : Actually fix the contaminated rooms
 */

import { db } from "@/db/client";
import { roomTable, memoryTable } from "@/db/schemas/eliza";
import { eq, and, sql } from "drizzle-orm";

interface ContaminatedRoom {
  roomId: string;
  roomName: string;
  roomAgentId: string;
  messageAgentIds: string[];
  messageCount: number;
  correctAgentId: string;
  confidence: "high" | "medium" | "low";
}

async function findContaminatedRooms(): Promise<ContaminatedRoom[]> {
  console.log("🔍 Scanning database for contaminated rooms...\n");

  // Query to find rooms where message agentIds differ from room agentId
  const results = await db.execute<{
    room_id: string;
    room_name: string;
    room_agent_id: string;
    message_agent_ids: string[];
    message_count: number;
  }>(sql`
    SELECT
      r.id as room_id,
      r.name as room_name,
      r.agent_id as room_agent_id,
      array_agg(DISTINCT m.agent_id) FILTER (WHERE m.agent_id IS NOT NULL) as message_agent_ids,
      COUNT(m.id) as message_count
    FROM ${roomTable} r
    INNER JOIN ${memoryTable} m ON m.room_id = r.id
    WHERE m.type = 'messages'
      AND r.agent_id IS NOT NULL
    GROUP BY r.id, r.name, r.agent_id
    HAVING array_agg(DISTINCT m.agent_id) FILTER (WHERE m.agent_id IS NOT NULL) != ARRAY[r.agent_id]::uuid[]
    ORDER BY COUNT(m.id) DESC
  `);

  const contaminated: ContaminatedRoom[] = [];

  for (const row of results.rows) {
    const messageAgentIds = row.message_agent_ids || [];
    const roomId = row.room_id;

    // Query actual message counts per agent ID for this room
    const agentCountsResult = await db.execute<{
      agent_id: string;
      message_count: number;
    }>(sql`
      SELECT 
        m.agent_id,
        COUNT(*) as message_count
      FROM ${memoryTable} m
      WHERE m.room_id = ${roomId}
        AND m.type = 'messages'
        AND m.agent_id IS NOT NULL
      GROUP BY m.agent_id
      ORDER BY COUNT(*) DESC
    `);

    const agentIdCounts: Record<string, number> = {};
    let totalMessages = 0;

    for (const count of agentCountsResult.rows) {
      const msgCount = Number(count.message_count);
      agentIdCounts[count.agent_id] = msgCount;
      totalMessages += msgCount;
    }

    // Find the most common agentId in messages
    const sortedAgentIds = Object.entries(agentIdCounts).sort((a, b) => b[1] - a[1]);
    const mostCommonAgentId = sortedAgentIds[0]?.[0];
    const mostCommonCount = sortedAgentIds[0]?.[1] || 0;
    const totalUniqueAgents = messageAgentIds.length;

    // Determine confidence level based on actual message distribution
    let confidence: "high" | "medium" | "low";
    if (totalUniqueAgents === 1) {
      // All messages from same agent, very clear
      confidence = "high";
    } else if (mostCommonCount / totalMessages > 0.8) {
      // >80% of messages from one agent
      confidence = "high";
    } else if (mostCommonCount / totalMessages > 0.5) {
      // >50% of messages from one agent
      confidence = "medium";
    } else {
      // No clear majority
      confidence = "low";
    }

    contaminated.push({
      roomId: row.room_id,
      roomName: row.room_name || "Unnamed",
      roomAgentId: row.room_agent_id,
      messageAgentIds: messageAgentIds,
      messageCount: Number(row.message_count),
      correctAgentId: mostCommonAgentId || row.room_agent_id,
      confidence,
    });
  }

  return contaminated;
}

async function fixContaminatedRoom(room: ContaminatedRoom): Promise<boolean> {
  try {
    console.log(`  🔧 Fixing room ${room.roomId}...`);

    // Update the room's agentId to match the correct one
    await db
      .update(roomTable)
      .set({ agentId: room.correctAgentId })
      .where(eq(roomTable.id, room.roomId));

    console.log(`  ✅ Updated room agentId from ${room.roomAgentId} to ${room.correctAgentId}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to fix room ${room.roomId}:`, error);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--fix");

  if (dryRun) {
    console.log("🔎 Running in DRY-RUN mode (no changes will be made)");
    console.log("   Use --fix flag to actually fix the issues\n");
  } else {
    console.log("⚠️  Running in FIX mode (will modify database)\n");
  }

  const contaminated = await findContaminatedRooms();

  if (contaminated.length === 0) {
    console.log("✨ No contaminated rooms found! Database is clean.");
    return;
  }

  console.log(`Found ${contaminated.length} contaminated room(s):\n`);

  // Group by confidence level
  const high = contaminated.filter(r => r.confidence === "high");
  const medium = contaminated.filter(r => r.confidence === "medium");
  const low = contaminated.filter(r => r.confidence === "low");

  console.log("═".repeat(80));
  console.log(`HIGH CONFIDENCE (${high.length} rooms) - Safe to auto-fix`);
  console.log("═".repeat(80));
  for (const room of high) {
    console.log(`\n📦 Room: ${room.roomId}`);
    console.log(`   Name: ${room.roomName}`);
    console.log(`   Current agentId: ${room.roomAgentId}`);
    console.log(`   Message agentIds: [${room.messageAgentIds.join(", ")}]`);
    console.log(`   Message count: ${room.messageCount}`);
    console.log(`   ➡️  Should be: ${room.correctAgentId}`);
  }

  if (medium.length > 0) {
    console.log("\n" + "═".repeat(80));
    console.log(`MEDIUM CONFIDENCE (${medium.length} rooms) - Review before fixing`);
    console.log("═".repeat(80));
    for (const room of medium) {
      console.log(`\n📦 Room: ${room.roomId}`);
      console.log(`   Name: ${room.roomName}`);
      console.log(`   Current agentId: ${room.roomAgentId}`);
      console.log(`   Message agentIds: [${room.messageAgentIds.join(", ")}]`);
      console.log(`   Message count: ${room.messageCount}`);
      console.log(`   ➡️  Suggested: ${room.correctAgentId}`);
    }
  }

  if (low.length > 0) {
    console.log("\n" + "═".repeat(80));
    console.log(`LOW CONFIDENCE (${low.length} rooms) - Manual review required`);
    console.log("═".repeat(80));
    for (const room of low) {
      console.log(`\n📦 Room: ${room.roomId}`);
      console.log(`   Name: ${room.roomName}`);
      console.log(`   Current agentId: ${room.roomAgentId}`);
      console.log(`   Message agentIds: [${room.messageAgentIds.join(", ")}]`);
      console.log(`   Message count: ${room.messageCount}`);
      console.log(`   ⚠️  Cannot determine correct agentId - manual review needed`);
    }
  }

  if (dryRun) {
    console.log("\n" + "═".repeat(80));
    console.log("🔎 DRY-RUN complete. No changes were made.");
    console.log("   Run with --fix flag to apply fixes to high confidence rooms.");
    console.log("═".repeat(80));
  } else {
    console.log("\n" + "═".repeat(80));
    console.log("🔧 Applying fixes...");
    console.log("═".repeat(80));

    let fixed = 0;
    let failed = 0;

    // Only auto-fix high confidence rooms
    for (const room of high) {
      const success = await fixContaminatedRoom(room);
      if (success) {
        fixed++;
      } else {
        failed++;
      }
    }

    console.log("\n" + "═".repeat(80));
    console.log(`✅ Fix complete:`);
    console.log(`   - ${fixed} room(s) fixed`);
    console.log(`   - ${failed} room(s) failed`);
    console.log(`   - ${medium.length + low.length} room(s) require manual review`);
    console.log("═".repeat(80));
  }
}

main()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
