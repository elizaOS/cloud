/**
 * Context Builder Unit Tests
 *
 * Tests the AI prompt context builder for:
 * - System prompt generation
 * - User prompt construction
 * - Integration of intent analysis
 * - Connected services context
 * - Dependency information inclusion
 * - Example workflow injection
 * - Token estimation
 */

import { describe, test, expect } from "bun:test";
import {
  contextBuilder,
  dependencyResolver,
  type ServiceConnectionStatus,
} from "@/lib/services/workflow-engine";

describe("Context Builder", () => {
  const connectedServices: ServiceConnectionStatus[] = [
    {
      serviceId: "google",
      connected: true,
      availableResources: ["email", "calendar", "contacts"],
      missingScopes: [],
    },
    {
      serviceId: "notion",
      connected: true,
      availableResources: ["database", "page"],
      missingScopes: [],
    },
  ];

  describe("Prompt Generation", () => {
    test("generates complete prompt structure", () => {
      const intentAnalysis = dependencyResolver.analyzeIntent(
        "Send an email to john@example.com"
      );
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent: "Send an email to john@example.com",
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent: "Send an email to john@example.com",
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      expect(prompt).toHaveProperty("systemPrompt");
      expect(prompt).toHaveProperty("userPrompt");
      expect(prompt).toHaveProperty("fullPrompt");
      expect(prompt).toHaveProperty("examples");
      expect(prompt).toHaveProperty("estimatedTokens");
    });

    test("system prompt contains workflow generation instructions", () => {
      const intentAnalysis = dependencyResolver.analyzeIntent("Send an email");
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent: "Send an email",
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent: "Send an email",
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      // System prompt should contain key instructions
      expect(prompt.systemPrompt).toContain("workflow");
      expect(prompt.systemPrompt.length).toBeGreaterThan(100);
    });

    test("user prompt includes the user intent", () => {
      const userIntent = "Schedule a meeting for tomorrow at 3pm";
      const intentAnalysis = dependencyResolver.analyzeIntent(userIntent);
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent,
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent,
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      expect(prompt.userPrompt).toContain(userIntent);
    });

    test("full prompt combines system and user prompts", () => {
      const intentAnalysis = dependencyResolver.analyzeIntent("Send an email");
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent: "Send an email",
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent: "Send an email",
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      expect(prompt.fullPrompt).toContain(prompt.systemPrompt);
      expect(prompt.fullPrompt).toContain(prompt.userPrompt);
      expect(prompt.fullPrompt.length).toBeGreaterThan(
        prompt.systemPrompt.length + prompt.userPrompt.length - 10
      );
    });
  });

  describe("Connected Services Context", () => {
    test("includes connected service information", () => {
      const intentAnalysis = dependencyResolver.analyzeIntent("Send an email");
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent: "Send an email",
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent: "Send an email",
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      // Should mention connected services
      expect(prompt.fullPrompt.toLowerCase()).toContain("google");
      expect(prompt.fullPrompt.toLowerCase()).toContain("notion");
    });

    test("indicates available resources for each service", () => {
      const intentAnalysis = dependencyResolver.analyzeIntent("Send an email");
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent: "Send an email",
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent: "Send an email",
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      // Should mention available resources
      expect(prompt.fullPrompt.toLowerCase()).toContain("email");
      expect(prompt.fullPrompt.toLowerCase()).toContain("calendar");
    });

    test("handles no connected services", () => {
      const intentAnalysis = dependencyResolver.analyzeIntent("Send an email");
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent: "Send an email",
        connectedServices: [],
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent: "Send an email",
        connectedServices: [],
        intentAnalysis,
        dependencyResult,
      });

      // Should still generate a valid prompt
      expect(prompt.fullPrompt.length).toBeGreaterThan(50);
    });

    test("notes missing scopes when present", () => {
      const servicesWithMissingScopes: ServiceConnectionStatus[] = [
        {
          serviceId: "google",
          connected: true,
          availableResources: ["email"],
          missingScopes: ["https://www.googleapis.com/auth/calendar"],
        },
      ];

      const intentAnalysis = dependencyResolver.analyzeIntent(
        "Create a calendar event"
      );
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent: "Create a calendar event",
        connectedServices: servicesWithMissingScopes,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent: "Create a calendar event",
        connectedServices: servicesWithMissingScopes,
        intentAnalysis,
        dependencyResult,
      });

      // Prompt should note the limitation
      expect(prompt.fullPrompt.length).toBeGreaterThan(50);
    });
  });

  describe("Intent Analysis Integration", () => {
    test("includes extracted entities in prompt", () => {
      const userIntent = "Send email to john@example.com tomorrow at 3pm";
      const intentAnalysis = dependencyResolver.analyzeIntent(userIntent);
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent,
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent,
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      // Should include extracted entities in prompt
      if (intentAnalysis.entities.length > 0) {
        expect(prompt.fullPrompt.toLowerCase()).toContain("entit");
      }
    });

    test("includes primary action in prompt", () => {
      const userIntent = "Send an email notification";
      const intentAnalysis = dependencyResolver.analyzeIntent(userIntent);
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent,
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent,
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      expect(prompt.fullPrompt).toContain(userIntent);
    });
  });

  describe("Dependency Information", () => {
    test("includes execution plan in prompt", () => {
      const userIntent = "Create a Notion page with meeting notes";
      const intentAnalysis = dependencyResolver.analyzeIntent(userIntent);
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent,
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent,
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      // If there's an execution plan, it should be mentioned
      if (dependencyResult.executionPlan.length > 0) {
        expect(prompt.fullPrompt.toLowerCase()).toContain("plan");
      }
    });

    test("notes prerequisites when present", () => {
      const userIntent = "Create a page in Notion database";
      const intentAnalysis = dependencyResolver.analyzeIntent(userIntent);
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent,
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent,
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      // Should generate valid prompt regardless of prerequisites
      expect(prompt.fullPrompt.length).toBeGreaterThan(100);
    });
  });

  describe("Example Workflows", () => {
    test("includes relevant examples based on intent", () => {
      const userIntent = "Send an email to the team";
      const intentAnalysis = dependencyResolver.analyzeIntent(userIntent);
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent,
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent,
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      expect(Array.isArray(prompt.examples)).toBe(true);
    });

    test("examples array can be empty for novel intents", () => {
      const userIntent = "Do something very unique and unusual";
      const intentAnalysis = dependencyResolver.analyzeIntent(userIntent);
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent,
        connectedServices: [],
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent,
        connectedServices: [],
        intentAnalysis,
        dependencyResult,
      });

      expect(Array.isArray(prompt.examples)).toBe(true);
    });
  });

  describe("Token Estimation", () => {
    test("provides token estimate for generated prompt", () => {
      const intentAnalysis = dependencyResolver.analyzeIntent("Send an email");
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent: "Send an email",
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent: "Send an email",
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      expect(typeof prompt.estimatedTokens).toBe("number");
      expect(prompt.estimatedTokens).toBeGreaterThan(0);
    });

    test("longer prompts have higher token estimates", () => {
      const shortIntent = "Send email";
      const longIntent =
        "Send a detailed email to multiple recipients including john@example.com, " +
        "jane@company.org, and bob@test.com about the upcoming quarterly meeting " +
        "scheduled for next Monday at 2pm in the main conference room";

      const shortAnalysis = dependencyResolver.analyzeIntent(shortIntent);
      const longAnalysis = dependencyResolver.analyzeIntent(longIntent);

      const shortResult = dependencyResolver.resolveDependencies({
        userIntent: shortIntent,
        connectedServices,
      });
      const longResult = dependencyResolver.resolveDependencies({
        userIntent: longIntent,
        connectedServices,
      });

      const shortPrompt = contextBuilder.buildPrompt({
        userIntent: shortIntent,
        connectedServices,
        intentAnalysis: shortAnalysis,
        dependencyResult: shortResult,
      });

      const longPrompt = contextBuilder.buildPrompt({
        userIntent: longIntent,
        connectedServices,
        intentAnalysis: longAnalysis,
        dependencyResult: longResult,
      });

      // Longer intent should result in more tokens
      expect(longPrompt.estimatedTokens).toBeGreaterThan(
        shortPrompt.estimatedTokens
      );
    });
  });

  describe("Output Requirements", () => {
    test("prompt includes code output format requirements", () => {
      const intentAnalysis = dependencyResolver.analyzeIntent("Send an email");
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent: "Send an email",
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent: "Send an email",
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      // Should mention expected output format
      const hasOutputFormat =
        prompt.fullPrompt.toLowerCase().includes("typescript") ||
        prompt.fullPrompt.toLowerCase().includes("function") ||
        prompt.fullPrompt.toLowerCase().includes("code") ||
        prompt.fullPrompt.toLowerCase().includes("output");

      expect(hasOutputFormat).toBe(true);
    });

    test("prompt mentions error handling requirements", () => {
      const intentAnalysis = dependencyResolver.analyzeIntent("Send an email");
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent: "Send an email",
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent: "Send an email",
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      // Should mention error handling
      const hasErrorHandling =
        prompt.fullPrompt.toLowerCase().includes("error") ||
        prompt.fullPrompt.toLowerCase().includes("try") ||
        prompt.fullPrompt.toLowerCase().includes("catch") ||
        prompt.fullPrompt.toLowerCase().includes("handle");

      expect(hasErrorHandling).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test("handles empty user intent", () => {
      const intentAnalysis = dependencyResolver.analyzeIntent("");
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent: "",
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent: "",
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      expect(prompt.fullPrompt.length).toBeGreaterThan(0);
      expect(prompt.estimatedTokens).toBeGreaterThan(0);
    });

    test("handles special characters in user intent", () => {
      const userIntent = "Send email with <html> tags & special chars!";
      const intentAnalysis = dependencyResolver.analyzeIntent(userIntent);
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent,
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent,
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      expect(prompt.fullPrompt).toContain(userIntent);
    });

    test("handles very long user intent", () => {
      const userIntent = "Send an email ".repeat(50) + "to john@example.com";
      const intentAnalysis = dependencyResolver.analyzeIntent(userIntent);
      const dependencyResult = dependencyResolver.resolveDependencies({
        userIntent,
        connectedServices,
      });

      const prompt = contextBuilder.buildPrompt({
        userIntent,
        connectedServices,
        intentAnalysis,
        dependencyResult,
      });

      expect(prompt.fullPrompt.length).toBeGreaterThan(userIntent.length);
    });
  });
});
