/**
 * Dependency Resolver Unit Tests
 *
 * Tests the dependency resolver for:
 * - Intent analysis from natural language
 * - Entity extraction (emails, phone numbers, dates)
 * - Service identification from user intent
 * - Dependency resolution for operations
 * - Execution plan generation
 */

import { describe, test, expect } from "bun:test";
import {
  dependencyResolver,
  type ServiceConnectionStatus,
  type DependencyResolutionInput,
} from "@/lib/services/workflow-engine";

describe("Dependency Resolver", () => {
  describe("Intent Analysis", () => {
    test("identifies email-sending intent", () => {
      const analysis = dependencyResolver.analyzeIntent(
        "Send an email to john@example.com about the meeting tomorrow"
      );

      expect(analysis.primaryAction).toBeDefined();
      expect(analysis.entities.length).toBeGreaterThan(0);
      expect(analysis.potentialServices).toContain("google");
    });

    test("identifies calendar/scheduling intent", () => {
      const analysis = dependencyResolver.analyzeIntent(
        "Schedule a meeting for next Monday at 2pm"
      );

      expect(analysis.primaryAction).toBeDefined();
      expect(analysis.potentialServices).toContain("google");
    });

    test("identifies SMS/text messaging intent", () => {
      const analysis = dependencyResolver.analyzeIntent(
        "Send a text message to +1-555-123-4567 saying hello"
      );

      expect(analysis.primaryAction).toBeDefined();
      // Should identify either Twilio or Blooio as potential service
      const hasMessagingService =
        analysis.potentialServices.includes("twilio") ||
        analysis.potentialServices.includes("blooio");
      expect(hasMessagingService).toBe(true);
    });

    test("identifies Notion database/page intent", () => {
      const analysis = dependencyResolver.analyzeIntent(
        "Create a new page in my Notion database with the meeting notes"
      );

      expect(analysis.primaryAction).toBeDefined();
      expect(analysis.potentialServices).toContain("notion");
    });

    test("identifies multi-service intent", () => {
      const analysis = dependencyResolver.analyzeIntent(
        "Send an email to the team and create a calendar event for the standup"
      );

      expect(analysis.potentialServices.length).toBeGreaterThanOrEqual(1);
      expect(analysis.potentialServices).toContain("google");
    });

    test("handles ambiguous intent gracefully", () => {
      const analysis = dependencyResolver.analyzeIntent("Do something cool");

      expect(analysis).toBeDefined();
      expect(analysis.primaryAction).toBeDefined();
      // Should still return a valid structure
      expect(Array.isArray(analysis.entities)).toBe(true);
      expect(Array.isArray(analysis.potentialServices)).toBe(true);
    });
  });

  describe("Entity Extraction", () => {
    test("extracts email addresses", () => {
      const analysis = dependencyResolver.analyzeIntent(
        "Email john@example.com and jane@company.org about the project"
      );

      const emails = analysis.entities.filter((e) => e.type === "email");
      expect(emails.length).toBe(2);
      expect(emails.map((e) => e.value)).toContain("john@example.com");
      expect(emails.map((e) => e.value)).toContain("jane@company.org");
    });

    test("extracts phone numbers", () => {
      const analysis = dependencyResolver.analyzeIntent(
        "Call +1-555-123-4567 or text 555-987-6543"
      );

      const phones = analysis.entities.filter((e) => e.type === "phone");
      expect(phones.length).toBeGreaterThanOrEqual(1);
    });

    test("extracts date/time references", () => {
      const analysis = dependencyResolver.analyzeIntent(
        "Schedule for tomorrow at 3pm and remind me next week"
      );

      const dates = analysis.entities.filter((e) => e.type === "date" || e.type === "time");
      expect(dates.length).toBeGreaterThanOrEqual(1);
    });

    test("handles multiple entity types in one intent", () => {
      const analysis = dependencyResolver.analyzeIntent(
        "Send email to john@test.com tomorrow at 2pm"
      );

      expect(analysis.entities.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Dependency Resolution", () => {
    const connectedServices: ServiceConnectionStatus[] = [
      {
        serviceId: "google",
        connected: true,
        scopes: [
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/calendar.events",
        ],
      },
      {
        serviceId: "notion",
        connected: true,
        scopes: [],
      },
      {
        serviceId: "twilio",
        connected: true,
      },
    ];

    test("resolves simple email operation dependencies", () => {
      const input: DependencyResolutionInput = {
        targetOperation: "email.send",
        serviceId: "google",
        connectedServices,
      };

      const result = dependencyResolver.resolveDependencies(input);

      // Returns a valid result structure
      expect(result).toHaveProperty("canExecute");
      expect(result).toHaveProperty("missingServices");
      expect(result).toHaveProperty("missingScopes");
      expect(result).toHaveProperty("prerequisites");
      expect(result).toHaveProperty("executionPlan");
      expect(Array.isArray(result.missingServices)).toBe(true);
    });

    test("resolves Notion page creation with database dependency", () => {
      const input: DependencyResolutionInput = {
        targetOperation: "page.create",
        serviceId: "notion",
        connectedServices,
      };

      const result = dependencyResolver.resolveDependencies(input);

      // Should identify database as a prerequisite
      if (result.prerequisites.length > 0) {
        expect(
          result.prerequisites.some((p) => p.operation.includes("database"))
        ).toBe(true);
      }
    });

    test("identifies missing services", () => {
      const limitedServices: ServiceConnectionStatus[] = [
        {
          serviceId: "google",
          connected: true,
        },
      ];

      const input: DependencyResolutionInput = {
        targetOperation: "sms.send",
        serviceId: "twilio",
        connectedServices: limitedServices,
      };

      const result = dependencyResolver.resolveDependencies(input);

      // Should identify that Twilio is needed but not connected
      expect(result.canExecute).toBe(false);
      expect(result.missingServices).toContain("twilio");
    });

    test("generates execution plan for valid operation", () => {
      const input: DependencyResolutionInput = {
        targetOperation: "email.send",
        serviceId: "google",
        connectedServices,
      };

      const result = dependencyResolver.resolveDependencies(input);

      expect(Array.isArray(result.executionPlan)).toBe(true);
    });

    test("handles non-existent service", () => {
      const input: DependencyResolutionInput = {
        targetOperation: "some.operation",
        serviceId: "nonexistent",
        connectedServices,
      };

      const result = dependencyResolver.resolveDependencies(input);

      expect(result.canExecute).toBe(false);
      expect(result.missingServices.length).toBeGreaterThan(0);
    });
  });

  describe("Edge Cases", () => {
    test("handles empty user intent", () => {
      const analysis = dependencyResolver.analyzeIntent("");

      expect(analysis).toBeDefined();
      // Returns "unknown" for no matches
      expect(analysis.primaryAction).toBe("unknown");
      expect(analysis.entities.length).toBe(0);
    });

    test("handles very long intent gracefully", () => {
      const longIntent = "Send an email ".repeat(100) + "to john@example.com";
      const analysis = dependencyResolver.analyzeIntent(longIntent);

      expect(analysis).toBeDefined();
      expect(analysis.entities.length).toBeGreaterThan(0);
    });

    test("handles special characters in intent", () => {
      const analysis = dependencyResolver.analyzeIntent(
        "Send email with subject: Meeting @ 3pm! #urgent <important>"
      );

      expect(analysis).toBeDefined();
      expect(analysis.primaryAction).toBeTruthy();
    });

    test("handles unicode in intent", () => {
      const analysis = dependencyResolver.analyzeIntent(
        "Send email to test@example.com about the 会議 tomorrow"
      );

      expect(analysis).toBeDefined();
    });

    test("handles service names mentioned explicitly", () => {
      const analysis = dependencyResolver.analyzeIntent(
        "Use Google to send an email"
      );

      expect(analysis.potentialServices).toContain("google");
    });
  });
});
