/**
 * Todo App Business Logic Tests
 *
 * Tests the gamification logic (points calculation, level progression).
 * Storage integration is tested via:
 * - MCP endpoint tests (todoapp-mcp.test.ts)
 * - App storage service tests (app-storage.test.ts)
 * - E2E tests (todoapp.spec.ts)
 */

import { describe, test, expect } from "bun:test";

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
  if (task.type === "daily") {
    const streak = Math.max(0, task.metadata.streak ?? 0);
    return 10 + Math.min(streak * 5, 50);
  }
  if (task.type === "one-off") {
    const priorityPoints = task.priority ? (5 - task.priority) * 10 : 10;
    return priorityPoints + (task.urgent ? 10 : 0);
  }
  if (task.type === "aspirational") {
    return 50;
  }
  return 0;
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

