import { describe, test, expect } from "bun:test";
import {
  generateRandomName,
  generateDisplayName,
  generateWorkflowName,
  generateServiceName,
  generateNameForType,
  type EntityType,
} from "@/lib/utils/random-names";

describe("Name Format Validation", () => {
  test("generateRandomName produces slug format", () => {
    for (let i = 0; i < 100; i++) {
      const name = generateRandomName();
      expect(name).toMatch(/^[a-z]+-[a-z]+$/);
      expect(name.split("-").length).toBe(2);
    }
  });

  test("generateDisplayName produces Title Case format", () => {
    for (let i = 0; i < 100; i++) {
      const name = generateDisplayName();
      expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    }
  });

  test("generateWorkflowName produces adjective-noun format", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateWorkflowName()).toMatch(/^[a-z]+-[a-z]+$/);
    }
  });

  test("generateServiceName produces adjective-suffix format", () => {
    const validSuffixes = ["api", "service", "hub", "connect", "sync", "flow", "bridge"];
    for (let i = 0; i < 100; i++) {
      const name = generateServiceName();
      expect(name).toMatch(/^[a-z]+-[a-z]+$/);
      expect(validSuffixes).toContain(name.split("-")[1]);
    }
  });
});

describe("Uniqueness and Distribution", () => {
  test("generates diverse names across 1000 iterations", () => {
    const names = new Set<string>();
    for (let i = 0; i < 1000; i++) names.add(generateRandomName());
    expect(names.size).toBeGreaterThan(700);
  });

  test("workflow names use different noun pool than random names", () => {
    const workflowNouns = new Set<string>();
    const randomNouns = new Set<string>();
    for (let i = 0; i < 500; i++) {
      workflowNouns.add(generateWorkflowName().split("-")[1]);
      randomNouns.add(generateRandomName().split("-")[1]);
    }
    const intersection = [...workflowNouns].filter((n) => randomNouns.has(n));
    expect(intersection.length).toBeLessThan(workflowNouns.size * 0.2);
  });

  test("service suffixes are all valid", () => {
    const expected = new Set(["api", "service", "hub", "connect", "sync", "flow", "bridge"]);
    const found = new Set<string>();
    for (let i = 0; i < 200; i++) found.add(generateServiceName().split("-")[1]);
    found.forEach((s) => expect(expected.has(s)).toBe(true));
    expect(found.size).toBeGreaterThanOrEqual(5);
  });
});

describe("generateNameForType", () => {
  test("returns display name for app/agent/miniapp types", () => {
    (["app", "agent", "miniapp"] as EntityType[]).forEach((type) => {
      for (let i = 0; i < 20; i++) {
        expect(generateNameForType(type)).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      }
    });
  });

  test("returns workflow name for workflow type", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateNameForType("workflow")).toMatch(/^[a-z]+-[a-z]+$/);
    }
  });

  test("returns service name for service type", () => {
    const validSuffixes = ["api", "service", "hub", "connect", "sync", "flow", "bridge"];
    for (let i = 0; i < 20; i++) {
      const name = generateNameForType("service");
      expect(validSuffixes).toContain(name.split("-")[1]);
    }
  });
});

describe("Edge Cases", () => {
  test("names are never empty and have reasonable length", () => {
    for (let i = 0; i < 100; i++) {
      [generateRandomName(), generateDisplayName(), generateWorkflowName(), generateServiceName()].forEach((name) => {
        expect(name.length).toBeGreaterThanOrEqual(3);
        expect(name.length).toBeLessThanOrEqual(50);
      });
    }
  });

  test("names contain no special characters", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateRandomName()).not.toMatch(/[^a-z-]/);
      expect(generateDisplayName()).not.toMatch(/[^a-zA-Z ]/);
    }
  });

  test("consecutive calls produce varied results", () => {
    const results = Array(10).fill(null).map(() => generateRandomName());
    expect(new Set(results).size).toBeGreaterThanOrEqual(5);
  });
});
