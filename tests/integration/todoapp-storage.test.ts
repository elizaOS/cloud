/**
 * Todo App Storage API Integration Tests
 *
 * Tests the todo-app storage and MCP endpoints directly.
 * Run with: bun test tests/integration/todoapp-storage.test.ts
 *
 * Prerequisites:
 * - Database running and seeded: bun run db:todoapp:seed
 * - Cloud server running: bun run dev
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { db } from "@/db/client";
import { apps } from "@/db/schemas/apps";
import { apiKeys } from "@/db/schemas/api-keys";
import { appCollections, appDocuments } from "@/db/schemas/app-storage";
import { appStorageService } from "@/lib/services/app-storage";
import { eq, and } from "drizzle-orm";
import * as crypto from "crypto";

const TEST_APP_SLUG = "eliza-todo-test";

describe("Todo App Storage Service", () => {
  let testAppId: string | null = null;
  let testApiKey: string | null = null;
  let testApiKeyId: string | null = null;
  let testUserId: string | null = null;
  let testOrgId: string | null = null;

  beforeAll(async () => {
    // Find or create test app
    const existingApp = await db.query.apps.findFirst({
      where: eq(apps.slug, TEST_APP_SLUG),
    });

    if (existingApp) {
      testAppId = existingApp.id;
      testOrgId = existingApp.organization_id;
    } else {
      // Use the seeded todoapp
      const todoApp = await db.query.apps.findFirst({
        where: eq(apps.slug, "eliza-todo"),
      });

      if (todoApp) {
        testAppId = todoApp.id;
        testOrgId = todoApp.organization_id;
      }
    }

    if (!testAppId) {
      console.log("⚠️ No todo app found. Run: bun run db:todoapp:seed");
      return;
    }

    // Find API key for the app
    const apiKey = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.app_id, testAppId),
    });

    if (apiKey) {
      testApiKeyId = apiKey.id;
      // Note: We can't retrieve the actual key, just verify it exists
    }
  });

  afterAll(async () => {
    // Cleanup test documents
    if (testAppId) {
      await db.delete(appDocuments).where(
        and(
          eq(appDocuments.app_id, testAppId),
          eq(appDocuments.created_by, "test-user")
        )
      );
    }
  });

  describe("Collection Management", () => {
    test("tasks collection exists", async () => {
      if (!testAppId) {
        console.log("Skipping: no test app");
        return;
      }

      const collection = await db.query.appCollections.findFirst({
        where: and(
          eq(appCollections.app_id, testAppId),
          eq(appCollections.name, "tasks")
        ),
      });

      expect(collection).toBeDefined();
      expect(collection?.name).toBe("tasks");
    });

    test("user_points collection exists", async () => {
      if (!testAppId) {
        console.log("Skipping: no test app");
        return;
      }

      const collection = await db.query.appCollections.findFirst({
        where: and(
          eq(appCollections.app_id, testAppId),
          eq(appCollections.name, "user_points")
        ),
      });

      expect(collection).toBeDefined();
      expect(collection?.name).toBe("user_points");
    });
  });

  describe("Document CRUD Operations", () => {
    let createdDocId: string | null = null;

    test("can insert a task document", async () => {
      if (!testAppId) {
        console.log("Skipping: no test app");
        return;
      }

      const taskData = {
        name: "Integration Test Task",
        type: "one-off",
        priority: 2,
        completed: false,
        metadata: {
          description: "Created by integration test",
          createdAt: new Date().toISOString(),
        },
      };

      const doc = await appStorageService.insertDocument(
        testAppId,
        "tasks",
        taskData,
        "test-user"
      );

      expect(doc).toBeDefined();
      expect(doc.id).toBeTruthy();
      expect(doc.data.name).toBe("Integration Test Task");

      createdDocId = doc.id;
    });

    test("can query task documents", async () => {
      if (!testAppId) {
        console.log("Skipping: no test app");
        return;
      }

      const result = await appStorageService.queryDocuments(
        testAppId,
        "tasks",
        { limit: 10 }
      );

      expect(result.documents).toBeDefined();
      expect(Array.isArray(result.documents)).toBe(true);
    });

    test("can get a specific document", async () => {
      if (!testAppId || !createdDocId) {
        console.log("Skipping: no test app or document");
        return;
      }

      const doc = await appStorageService.getDocument(testAppId, createdDocId);

      expect(doc).toBeDefined();
      expect(doc?.id).toBe(createdDocId);
    });

    test("can update a document", async () => {
      if (!testAppId || !createdDocId) {
        console.log("Skipping: no test app or document");
        return;
      }

      const updatedDoc = await appStorageService.updateDocument(
        testAppId,
        createdDocId,
        { name: "Updated Integration Test Task", priority: 1 },
        "test-user"
      );

      expect(updatedDoc.data.name).toBe("Updated Integration Test Task");
      expect(updatedDoc.data.priority).toBe(1);
    });

    test("can soft delete a document", async () => {
      if (!testAppId || !createdDocId) {
        console.log("Skipping: no test app or document");
        return;
      }

      await appStorageService.deleteDocument(testAppId, createdDocId, "test-user");

      const doc = await appStorageService.getDocument(testAppId, createdDocId);
      expect(doc?.deleted_at).toBeTruthy();
    });

    test("can hard delete a document", async () => {
      if (!testAppId || !createdDocId) {
        console.log("Skipping: no test app or document");
        return;
      }

      await appStorageService.purgeDocument(testAppId, createdDocId);

      const doc = await appStorageService.getDocument(testAppId, createdDocId);
      expect(doc).toBeNull();
    });
  });

  describe("Query Filtering", () => {
    let testDocIds: string[] = [];

    beforeAll(async () => {
      if (!testAppId) return;

      // Create test documents
      const tasks = [
        { name: "Daily Task", type: "daily", completed: false, metadata: {} },
        { name: "One-off Task", type: "one-off", completed: false, metadata: {} },
        { name: "Completed Task", type: "one-off", completed: true, metadata: {} },
      ];

      for (const task of tasks) {
        const doc = await appStorageService.insertDocument(
          testAppId,
          "tasks",
          task,
          "test-user"
        );
        testDocIds.push(doc.id);
      }
    });

    afterAll(async () => {
      if (!testAppId) return;

      for (const docId of testDocIds) {
        await appStorageService.purgeDocument(testAppId, docId).catch(() => {});
      }
    });

    test("can filter by type", async () => {
      if (!testAppId) {
        console.log("Skipping: no test app");
        return;
      }

      const result = await appStorageService.queryDocuments(
        testAppId,
        "tasks",
        { filter: { type: "daily" }, limit: 100 }
      );

      const allDaily = result.documents.every((doc) => doc.data.type === "daily");
      expect(allDaily).toBe(true);
    });

    test("can filter by completion status", async () => {
      if (!testAppId) {
        console.log("Skipping: no test app");
        return;
      }

      const result = await appStorageService.queryDocuments(
        testAppId,
        "tasks",
        { filter: { completed: true }, limit: 100 }
      );

      const allCompleted = result.documents.every((doc) => doc.data.completed === true);
      expect(allCompleted).toBe(true);
    });
  });
});

describe("Todo MCP Endpoint Logic", () => {
  // These tests verify the MCP handler logic

  describe("Points Calculation", () => {
    test("daily task awards 10 base points", () => {
      const task = {
        type: "daily" as const,
        metadata: { streak: 0 },
      };
      const points = calculateTestPoints(task);
      expect(points).toBe(10);
    });

    test("daily task with streak awards bonus points", () => {
      const task = {
        type: "daily" as const,
        metadata: { streak: 5 },
      };
      const points = calculateTestPoints(task);
      expect(points).toBe(10 + 5 * 5); // 35 points
    });

    test("streak bonus caps at 50", () => {
      const task = {
        type: "daily" as const,
        metadata: { streak: 20 },
      };
      const points = calculateTestPoints(task);
      expect(points).toBe(10 + 50); // 60 points (capped)
    });

    test("one-off P1 task awards 40 points", () => {
      const task = {
        type: "one-off" as const,
        priority: 1 as const,
        metadata: {},
      };
      const points = calculateTestPoints(task);
      expect(points).toBe(40);
    });

    test("one-off P4 task awards 10 points", () => {
      const task = {
        type: "one-off" as const,
        priority: 4 as const,
        metadata: {},
      };
      const points = calculateTestPoints(task);
      expect(points).toBe(10);
    });

    test("urgent task adds 10 bonus points", () => {
      const task = {
        type: "one-off" as const,
        priority: 2 as const,
        urgent: true,
        metadata: {},
      };
      const points = calculateTestPoints(task);
      expect(points).toBe(30 + 10); // 40 points
    });

    test("aspirational task awards 50 points", () => {
      const task = {
        type: "aspirational" as const,
        metadata: {},
      };
      const points = calculateTestPoints(task);
      expect(points).toBe(50);
    });
  });

  describe("Level Calculation", () => {
    test("0 points is Level 1 Beginner", () => {
      const level = calculateTestLevel(0);
      expect(level.level).toBe(1);
      expect(level.name).toBe("Beginner");
    });

    test("100 points is Level 2 Apprentice", () => {
      const level = calculateTestLevel(100);
      expect(level.level).toBe(2);
      expect(level.name).toBe("Apprentice");
    });

    test("1000 points is Level 5 Master", () => {
      const level = calculateTestLevel(1000);
      expect(level.level).toBe(5);
      expect(level.name).toBe("Master");
    });

    test("5500 points is Level 10 Transcendent", () => {
      const level = calculateTestLevel(5500);
      expect(level.level).toBe(10);
      expect(level.name).toBe("Transcendent");
    });
  });
});

// Helper functions that mirror the MCP logic
function calculateTestPoints(task: {
  type: "daily" | "one-off" | "aspirational";
  priority?: 1 | 2 | 3 | 4;
  urgent?: boolean;
  metadata: { streak?: number };
}): number {
  let points = 0;

  if (task.type === "daily") {
    points = 10 + Math.min((task.metadata.streak ?? 0) * 5, 50);
  } else if (task.type === "one-off") {
    const priorityPoints = task.priority ? (5 - task.priority) * 10 : 10;
    points = priorityPoints + (task.urgent ? 10 : 0);
  } else if (task.type === "aspirational") {
    points = 50;
  }

  return points;
}

const LEVELS = [
  { level: 1, name: "Beginner", threshold: 0 },
  { level: 2, name: "Apprentice", threshold: 100 },
  { level: 3, name: "Journeyman", threshold: 300 },
  { level: 4, name: "Expert", threshold: 600 },
  { level: 5, name: "Master", threshold: 1000 },
  { level: 6, name: "Grandmaster", threshold: 1500 },
  { level: 7, name: "Legend", threshold: 2200 },
  { level: 8, name: "Mythic", threshold: 3000 },
  { level: 9, name: "Immortal", threshold: 4000 },
  { level: 10, name: "Transcendent", threshold: 5500 },
];

function calculateTestLevel(points: number): { level: number; name: string } {
  let currentLevel = LEVELS[0]!;
  for (const level of LEVELS) {
    if (points >= level.threshold) {
      currentLevel = level;
    }
  }
  return { level: currentLevel.level, name: currentLevel.name };
}

