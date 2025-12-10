/**
 * Cloud Services Unit Tests
 * 
 * Tests the service layer directly:
 * - tasksService
 * - checkinsService  
 * - botsService
 * 
 * Requirements:
 * - Database connection configured
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";

// These tests require database access
// They test the service layer directly without HTTP

const TEST_ORG_ID = process.env.TEST_ORGANIZATION_ID;

// Skip if no test org configured
const shouldSkip = !TEST_ORG_ID;

describe("Org Todos Service", () => {
  test("skipped if no TEST_ORGANIZATION_ID", () => {
    if (shouldSkip) {
      console.log("⚠️ Skipping service tests - set TEST_ORGANIZATION_ID to run");
    }
    expect(true).toBe(true);
  });

  test.skipIf(shouldSkip)("imports without error", async () => {
    const { tasksService } = await import("@/lib/services/tasks");
    expect(tasksService).toBeDefined();
    expect(typeof tasksService.create).toBe("function");
    expect(typeof tasksService.list).toBe("function");
    expect(typeof tasksService.get).toBe("function");
    expect(typeof tasksService.update).toBe("function");
    expect(typeof tasksService.delete).toBe("function");
    expect(typeof tasksService.getStats).toBe("function");
  });

  test.skipIf(shouldSkip)("list returns array structure", async () => {
    const { tasksService } = await import("@/lib/services/tasks");
    
    const result = await tasksService.list({
      organizationId: TEST_ORG_ID!,
      limit: 10,
    });
    
    expect(result).toHaveProperty("todos");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.todos)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  test.skipIf(shouldSkip)("getStats returns valid structure", async () => {
    const { tasksService } = await import("@/lib/services/tasks");
    
    const stats = await tasksService.getStats(TEST_ORG_ID!);
    
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("pending");
    expect(stats).toHaveProperty("inProgress");
    expect(stats).toHaveProperty("completed");
    expect(stats).toHaveProperty("cancelled");
    expect(stats).toHaveProperty("overdue");
    expect(stats).toHaveProperty("dueToday");
    expect(stats).toHaveProperty("dueTomorrow");
  });

  test.skipIf(shouldSkip)("CRUD operations work", async () => {
    const { tasksService } = await import("@/lib/services/tasks");
    
    // Create
    const created = await tasksService.create({
      organizationId: TEST_ORG_ID!,
      title: "Service Test Todo",
      description: "Created by service test",
      priority: "medium",
      sourcePlatform: "web",
    });
    
    expect(created.id).toBeDefined();
    expect(created.title).toBe("Service Test Todo");
    expect(created.status).toBe("pending");
    
    // Read
    const fetched = await tasksService.get(created.id, TEST_ORG_ID!);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    
    // Update
    const updated = await tasksService.update(created.id, TEST_ORG_ID!, {
      status: "completed",
    });
    expect(updated.status).toBe("completed");
    expect(updated.completed_at).not.toBeNull();
    
    // Delete
    await tasksService.delete(created.id, TEST_ORG_ID!);
    
    // Verify deleted
    const deleted = await tasksService.get(created.id, TEST_ORG_ID!);
    expect(deleted).toBeNull();
  });
});

describe("Org Checkins Service", () => {
  test.skipIf(shouldSkip)("imports without error", async () => {
    const { checkinsService } = await import("@/lib/services/checkins");
    expect(checkinsService).toBeDefined();
    expect(typeof checkinsService.createSchedule).toBe("function");
    expect(typeof checkinsService.listSchedules).toBe("function");
    expect(typeof checkinsService.getSchedule).toBe("function");
    expect(typeof checkinsService.recordResponse).toBe("function");
    expect(typeof checkinsService.generateReport).toBe("function");
  });

  test.skipIf(shouldSkip)("listSchedules returns array", async () => {
    const { checkinsService } = await import("@/lib/services/checkins");
    
    const schedules = await checkinsService.listSchedules(TEST_ORG_ID!);
    
    expect(Array.isArray(schedules)).toBe(true);
  });
});

describe("Org Platforms Service", () => {
  test.skipIf(shouldSkip)("imports without error", async () => {
    const { botsService } = await import("@/lib/services/bots");
    expect(botsService).toBeDefined();
    expect(typeof botsService.getConnections).toBe("function");
    expect(typeof botsService.getConnection).toBe("function");
    expect(typeof botsService.connectDiscord).toBe("function");
    expect(typeof botsService.connectTelegram).toBe("function");
    expect(typeof botsService.disconnect).toBe("function");
  });

  test.skipIf(shouldSkip)("getConnections returns array", async () => {
    const { botsService } = await import("@/lib/services/bots");
    
    const connections = await botsService.getConnections(TEST_ORG_ID!);
    
    expect(Array.isArray(connections)).toBe(true);
  });
});

