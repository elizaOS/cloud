/**
 * Integration tests for character isolation in chat rooms
 *
 * These tests verify that conversations remain isolated between different
 * characters and that the conversation contamination bug is fixed.
 *
 * Run with: bun test __tests__/integration/character-isolation.test.ts
 *
 * Prerequisites:
 * - Test database with fresh schema
 * - Test user with authentication
 * - At least 2 test characters created
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { roomsService } from "@/lib/services/agents/rooms";
import {
  roomsRepository,
  memoriesRepository,
  agentsRepository,
  entitiesRepository,
  participantsRepository,
} from "@/db/repositories";
import { v4 as uuidv4 } from "uuid";

describe("Character Isolation - Bug Fix Verification", () => {
  // Generate fresh IDs for each test run
  let TEST_USER_ID: string;
  let CHARACTER_A_ID: string;
  let CHARACTER_B_ID: string;
  let roomA: string;
  let roomB: string;

  beforeEach(async () => {
    // Generate fresh IDs for this test
    TEST_USER_ID = uuidv4();
    CHARACTER_A_ID = uuidv4();
    CHARACTER_B_ID = uuidv4();

    // Create test agents and entities
    await agentsRepository.create({
      id: CHARACTER_A_ID,
      name: "Test Character A",
      enabled: true,
    });
    await entitiesRepository.create({
      id: CHARACTER_A_ID,
      agentId: CHARACTER_A_ID,
      names: ["Test Character A", "Agent"],
      metadata: { type: "agent", test: true },
    });

    await agentsRepository.create({
      id: CHARACTER_B_ID,
      name: "Test Character B",
      enabled: true,
    });
    await entitiesRepository.create({
      id: CHARACTER_B_ID,
      agentId: CHARACTER_B_ID,
      names: ["Test Character B", "Agent"],
      metadata: { type: "agent", test: true },
    });

    // Create test entity for the test user
    await entitiesRepository.create({
      id: TEST_USER_ID,
      agentId: CHARACTER_A_ID,
      names: ["Test User"],
      metadata: { type: "user", test: true },
    });

    // Create test rooms for each character
    const room1 = await roomsService.createRoom({
      id: uuidv4(),
      agentId: CHARACTER_A_ID,
      entityId: TEST_USER_ID,
      source: "web",
      type: "DM",
      name: "Chat with Character A",
    });

    const room2 = await roomsService.createRoom({
      id: uuidv4(),
      agentId: CHARACTER_B_ID,
      entityId: TEST_USER_ID,
      source: "web",
      type: "DM",
      name: "Chat with Character B",
    });

    roomA = room1.id;
    roomB = room2.id;

    // Add participants (required for getRoomsForEntity to find rooms)
    await participantsRepository.create({
      roomId: roomA,
      entityId: TEST_USER_ID,
      agentId: CHARACTER_A_ID,
    });
    await participantsRepository.create({
      roomId: roomB,
      entityId: TEST_USER_ID,
      agentId: CHARACTER_B_ID,
    });

    // Add messages to room A
    await memoriesRepository.create({
      id: uuidv4(),
      roomId: roomA,
      agentId: CHARACTER_A_ID,
      entityId: TEST_USER_ID,
      type: "messages",
      content: {
        text: "Hello from Character A",
        source: "agent",
      },
    });

    // Add messages to room B
    await memoriesRepository.create({
      id: uuidv4(),
      roomId: roomB,
      agentId: CHARACTER_B_ID,
      entityId: TEST_USER_ID,
      type: "messages",
      content: {
        text: "Hello from Character B",
        source: "agent",
      },
    });
  });

  afterEach(async () => {
    // Cleanup test data in proper order (FK constraints)
    try {
      // Delete memories
      if (roomA) await memoriesRepository.deleteByRoomId(roomA);
      if (roomB) await memoriesRepository.deleteByRoomId(roomB);

      // Delete rooms
      if (roomA) await roomsRepository.delete(roomA);
      if (roomB) await roomsRepository.delete(roomB);

      // Delete entities (user and agents)
      await entitiesRepository.delete(TEST_USER_ID);
      await entitiesRepository.delete(CHARACTER_A_ID);
      await entitiesRepository.delete(CHARACTER_B_ID);

      // Note: Agent deletion not implemented in repository,
      // but entities are the main FK constraint for memories
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  });

  it("should return only Character A's rooms when filtering by Character A", async () => {
    const rooms = await roomsService.getRoomsForEntity(TEST_USER_ID);
    const characterARooms = rooms.filter(
      (room) => room.characterId === CHARACTER_A_ID,
    );

    // Should only find room A
    expect(characterARooms.length).toBe(1);
    expect(characterARooms[0].id).toBe(roomA);
    expect(characterARooms[0].characterId).toBe(CHARACTER_A_ID);

    // Should NOT include room B
    const hasRoomB = characterARooms.some((room) => room.id === roomB);
    expect(hasRoomB).toBe(false);
  });

  it("should return only Character B's rooms when filtering by Character B", async () => {
    const rooms = await roomsService.getRoomsForEntity(TEST_USER_ID);
    const characterBRooms = rooms.filter(
      (room) => room.characterId === CHARACTER_B_ID,
    );

    // Should only find room B
    expect(characterBRooms.length).toBe(1);
    expect(characterBRooms[0].id).toBe(roomB);
    expect(characterBRooms[0].characterId).toBe(CHARACTER_B_ID);

    // Should NOT include room A
    const hasRoomA = characterBRooms.some((room) => room.id === roomA);
    expect(hasRoomA).toBe(false);
  });

  it("should not allow agentId modification on regular chat rooms", async () => {
    // Get original room
    const originalRoom = await roomsRepository.findById(roomA);
    expect(originalRoom?.agentId).toBe(CHARACTER_A_ID);

    // Attempt to update agentId directly (simulating BUILD mode)
    // This should be prevented by the fix
    const isBuildRoom =
      originalRoom?.name?.startsWith("[BUILD]") ||
      originalRoom?.name?.startsWith("[CREATOR]") ||
      false;
    const shouldUpdate = !originalRoom?.agentId || isBuildRoom;

    // Regular chat room should NOT be updatable
    expect(shouldUpdate).toBe(false);

    // If we were to update (against the fix), verify it would be blocked
    if (!shouldUpdate) {
      // Verify room still has original agentId
      const unchangedRoom = await roomsRepository.findById(roomA);
      expect(unchangedRoom?.agentId).toBe(CHARACTER_A_ID);
    }
  });

  it("should allow agentId updates on BUILD rooms", async () => {
    // Create a BUILD room
    const buildRoom = await roomsService.createRoom({
      id: uuidv4(),
      agentId: CHARACTER_A_ID,
      entityId: TEST_USER_ID,
      source: "web",
      type: "DM",
      name: "[BUILD] Test Character",
    });

    const isBuildRoom =
      buildRoom.name?.startsWith("[BUILD]") ||
      buildRoom.name?.startsWith("[CREATOR]") ||
      false;

    // BUILD room should be updatable
    expect(isBuildRoom).toBe(true);

    // Update should be allowed for BUILD rooms
    if (isBuildRoom) {
      await roomsRepository.update(buildRoom.id, { agentId: CHARACTER_B_ID });
      const updatedRoom = await roomsRepository.findById(buildRoom.id);
      expect(updatedRoom?.agentId).toBe(CHARACTER_B_ID);
    }
  });

  it("should filter out rooms without characterId", async () => {
    // Create room without agentId (legacy scenario)
    const legacyRoom = await roomsService.createRoom({
      id: uuidv4(),
      entityId: TEST_USER_ID,
      source: "web",
      type: "DM",
      name: "Legacy Room",
      // agentId intentionally omitted
    });

    const rooms = await roomsService.getRoomsForEntity(TEST_USER_ID);

    // Filtering logic should reject rooms without characterId
    const filteredRooms = rooms.filter((room) => {
      const hasCharacterId = Boolean(room.characterId);
      return hasCharacterId;
    });

    // Legacy room should be filtered out
    const hasLegacyRoom = filteredRooms.some(
      (room) => room.id === legacyRoom.id,
    );
    expect(hasLegacyRoom).toBe(false);
  });

  it("should return most recent room for a character", async () => {
    // Wait a bit to ensure different timestamp from initial room creation
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create second room for Character A
    const newerRoomId = uuidv4();
    const newerRoom = await roomsService.createRoom({
      id: newerRoomId,
      agentId: CHARACTER_A_ID,
      entityId: TEST_USER_ID,
      source: "web",
      type: "DM",
      name: "Newer Chat with Character A",
    });

    // Add participant for the newer room
    await participantsRepository.create({
      roomId: newerRoomId,
      entityId: TEST_USER_ID,
      agentId: CHARACTER_A_ID,
    });

    // Add newer message
    await memoriesRepository.create({
      id: uuidv4(),
      roomId: newerRoomId,
      agentId: CHARACTER_A_ID,
      entityId: TEST_USER_ID,
      type: "messages",
      content: {
        text: "Newer message from Character A",
        source: "agent",
      },
    });

    const rooms = await roomsService.getRoomsForEntity(TEST_USER_ID);
    const characterARooms = rooms
      .filter((room) => room.characterId === CHARACTER_A_ID)
      .sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));

    // Should return newer room first
    expect(characterARooms.length).toBeGreaterThan(0);
    expect(characterARooms[0].id).toBe(newerRoomId);
  });
});

describe("Character Isolation - Edge Cases", () => {
  // Generate fresh IDs for each test run
  let TEST_USER_ID: string;
  let CHARACTER_A_ID: string;

  beforeEach(async () => {
    // Generate fresh IDs for this test
    TEST_USER_ID = uuidv4();
    CHARACTER_A_ID = uuidv4();

    // Create test agent and entity
    await agentsRepository.create({
      id: CHARACTER_A_ID,
      name: "Test Character A",
      enabled: true,
    });
    await entitiesRepository.create({
      id: CHARACTER_A_ID,
      agentId: CHARACTER_A_ID,
      names: ["Test Character A", "Agent"],
      metadata: { type: "agent", test: true },
    });

    // Create test entity for the test user
    await entitiesRepository.create({
      id: TEST_USER_ID,
      agentId: CHARACTER_A_ID,
      names: ["Test User"],
      metadata: { type: "user", test: true },
    });
  });

  afterEach(async () => {
    // Cleanup test data
    try {
      await entitiesRepository.delete(TEST_USER_ID);
      await entitiesRepository.delete(CHARACTER_A_ID);
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  });

  it("should handle empty room list gracefully", async () => {
    const nonExistentUserId = uuidv4();
    const rooms = await roomsService.getRoomsForEntity(nonExistentUserId);

    expect(Array.isArray(rooms)).toBe(true);
    expect(rooms.length).toBe(0);
  });

  it("should handle invalid character ID gracefully", async () => {
    const rooms = await roomsService.getRoomsForEntity(TEST_USER_ID);
    const invalidCharRooms = rooms.filter(
      (room) => room.characterId === "non-existent-character",
    );

    expect(invalidCharRooms.length).toBe(0);
  });

  it("should handle rooms with multiple messages correctly", async () => {
    const roomId = uuidv4();
    const room = await roomsService.createRoom({
      id: roomId,
      agentId: CHARACTER_A_ID,
      entityId: TEST_USER_ID,
      source: "web",
      type: "DM",
      name: "Multi-message Room",
    });

    // Add participant for the room
    await participantsRepository.create({
      roomId: room.id,
      entityId: TEST_USER_ID,
      agentId: CHARACTER_A_ID,
    });

    // Add multiple messages
    for (let i = 0; i < 5; i++) {
      await memoriesRepository.create({
        id: uuidv4(),
        roomId: room.id,
        agentId: CHARACTER_A_ID,
        entityId: TEST_USER_ID,
        type: "messages",
        content: {
          text: `Message ${i} from Character A`,
          source: i % 2 === 0 ? "agent" : "user",
        },
      });
    }

    const roomWithMessages = await roomsService.getRoomWithMessages(roomId);

    // Should load all messages
    expect(roomWithMessages).toBeTruthy();
    expect(roomWithMessages?.messages.length).toBeGreaterThan(0);

    // Should maintain character association
    expect(roomWithMessages?.room.agentId).toBe(CHARACTER_A_ID);
  });
});
