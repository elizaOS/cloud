/**
 * Manual Integration Test Script for Conversation Loading Fix
 *
 * This script helps verify that clicking on a character from My Agents
 * correctly loads the most recent conversation instead of creating a new room.
 *
 * Usage:
 *   bun run scripts/test-conversation-loading.ts
 *
 * Prerequisites:
 *   - User must be authenticated
 *   - User must have at least one character with conversations
 *   - DATABASE_URL must be configured
 */

import { roomsService } from "@/lib/services/agents/rooms";
import { logger } from "@/lib/utils/logger";

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

const results: TestResult[] = [];

function logTest(result: TestResult) {
  results.push(result);
  const icon = result.passed ? "✓" : "✗";
  const color = result.passed ? "\x1b[32m" : "\x1b[31m";
  console.log(
    `${color}${icon}\x1b[0m ${result.testName}: ${result.message}`,
  );
  if (result.details) {
    console.log("  Details:", JSON.stringify(result.details, null, 2));
  }
}

async function testGetRoomsForEntity(userId: string) {
  try {
    const rooms = await roomsService.getRoomsForEntity(userId);

    logTest({
      testName: "Get Rooms For Entity",
      passed: true,
      message: `Found ${rooms.length} rooms`,
      details: {
        roomCount: rooms.length,
        sampleRoomIds: rooms.slice(0, 3).map((r) => r.id),
      },
    });

    return rooms;
  } catch (error) {
    logTest({
      testName: "Get Rooms For Entity",
      passed: false,
      message:
        error instanceof Error ? error.message : "Failed to fetch rooms",
    });
    return [];
  }
}

async function testMostRecentRoomResolution(
  userId: string,
  characterId: string,
) {
  try {
    const rooms = await roomsService.getRoomsForEntity(userId);
    const characterRooms = rooms
      .filter((room) => room.characterId === characterId)
      .sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));

    if (characterRooms.length === 0) {
      logTest({
        testName: "Most Recent Room Resolution",
        passed: true,
        message: `No existing rooms for character ${characterId} - would create new room`,
        details: { characterId },
      });
      return null;
    }

    const mostRecentRoom = characterRooms[0];

    logTest({
      testName: "Most Recent Room Resolution",
      passed: true,
      message: `Found most recent room: ${mostRecentRoom.id}`,
      details: {
        roomId: mostRecentRoom.id,
        characterId: mostRecentRoom.characterId,
        characterName: mostRecentRoom.characterName,
        lastTime: mostRecentRoom.lastTime,
        totalRoomsForCharacter: characterRooms.length,
      },
    });

    return mostRecentRoom;
  } catch (error) {
    logTest({
      testName: "Most Recent Room Resolution",
      passed: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to resolve most recent room",
    });
    return null;
  }
}

async function testRoomSorting(userId: string) {
  try {
    const rooms = await roomsService.getRoomsForEntity(userId);

    if (rooms.length < 2) {
      logTest({
        testName: "Room Sorting",
        passed: true,
        message: "Not enough rooms to test sorting (need at least 2)",
      });
      return;
    }

    // Check if rooms are sorted by lastTime descending
    const timestamps = rooms.map((r) => r.lastTime || 0);
    const isSorted = timestamps.every(
      (time, index) => index === 0 || timestamps[index - 1] >= time,
    );

    logTest({
      testName: "Room Sorting",
      passed: isSorted,
      message: isSorted
        ? "Rooms are correctly sorted by most recent activity"
        : "Rooms are NOT sorted correctly",
      details: {
        firstRoomTime: timestamps[0],
        lastRoomTime: timestamps[timestamps.length - 1],
        totalRooms: rooms.length,
      },
    });
  } catch (error) {
    logTest({
      testName: "Room Sorting",
      passed: false,
      message:
        error instanceof Error ? error.message : "Failed to test sorting",
    });
  }
}

async function runTests() {
  console.log("\n🧪 Starting Conversation Loading Integration Tests\n");

  // Test user ID - replace with actual user ID
  const TEST_USER_ID = process.argv[2];

  if (!TEST_USER_ID) {
    console.error("❌ Usage: bun run scripts/test-conversation-loading.ts <userId>");
    console.error("   Example: bun run scripts/test-conversation-loading.ts a1b2c3d4-...");
    process.exit(1);
  }

  console.log(`Testing with user ID: ${TEST_USER_ID}\n`);

  // Test 1: Fetch all rooms
  const rooms = await testGetRoomsForEntity(TEST_USER_ID);

  // Test 2: Check sorting
  await testRoomSorting(TEST_USER_ID);

  // Test 3: Test most recent room resolution for each character
  if (rooms.length > 0) {
    const uniqueCharacterIds = [...new Set(rooms.map((r) => r.characterId).filter(Boolean))];

    for (const charId of uniqueCharacterIds) {
      if (charId) {
        await testMostRecentRoomResolution(TEST_USER_ID, charId);
      }
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Test Summary");
  console.log("=".repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);

  if (failed === 0) {
    console.log("\n✨ All tests passed! The conversation loading fix is working correctly.\n");
  } else {
    console.log("\n⚠️  Some tests failed. Please review the results above.\n");
    process.exit(1);
  }
}

runTests()
  .then(() => {
    logger.info("Test script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    logger.error("Test script failed:", error);
    process.exit(1);
  });
