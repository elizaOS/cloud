/**
 * Service Specs Registry Unit Tests
 *
 * Tests the service specification registry for:
 * - Service retrieval by ID
 * - Service search by capability
 * - Example retrieval
 * - Dependency lookup
 * - Context generation for AI prompts
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  serviceSpecsRegistry,
  type ServiceSpecification,
  type ServiceConnectionStatus,
} from "@/lib/services/workflow-engine";

describe("Service Specs Registry", () => {
  describe("Service Retrieval", () => {
    test("returns all registered services", () => {
      const services = serviceSpecsRegistry.getAll();

      expect(Array.isArray(services)).toBe(true);
      expect(services.length).toBeGreaterThan(0);

      // Should have our 4 main services
      const serviceIds = services.map((s) => s.id);
      expect(serviceIds).toContain("google");
      expect(serviceIds).toContain("notion");
      expect(serviceIds).toContain("blooio");
      expect(serviceIds).toContain("twilio");
    });

    test("retrieves Google service spec by ID", () => {
      const google = serviceSpecsRegistry.get("google");

      expect(google).toBeDefined();
      expect(google!.id).toBe("google");
      expect(google!.name).toBe("Google");
      expect(google!.authentication.type).toBe("oauth2");
    });

    test("retrieves Notion service spec by ID", () => {
      const notion = serviceSpecsRegistry.get("notion");

      expect(notion).toBeDefined();
      expect(notion!.id).toBe("notion");
      expect(notion!.authentication.type).toBe("oauth2");
    });

    test("retrieves Blooio service spec by ID", () => {
      const blooio = serviceSpecsRegistry.get("blooio");

      expect(blooio).toBeDefined();
      expect(blooio!.id).toBe("blooio");
      expect(blooio!.authentication.type).toBe("api_key");
    });

    test("retrieves Twilio service spec by ID", () => {
      const twilio = serviceSpecsRegistry.get("twilio");

      expect(twilio).toBeDefined();
      expect(twilio!.id).toBe("twilio");
      expect(twilio!.authentication.type).toBe("basic");
    });

    test("returns undefined for non-existent service", () => {
      const unknown = serviceSpecsRegistry.get("nonexistent-service");

      expect(unknown).toBeUndefined();
    });
  });

  describe("Google Service Spec", () => {
    let google: ServiceSpecification;

    beforeAll(() => {
      google = serviceSpecsRegistry.get("google")!;
    });

    test("has email resource with required operations", () => {
      expect(google.resources).toHaveProperty("email");
      expect(google.resources.email).toHaveProperty("list");
      expect(google.resources.email).toHaveProperty("read");
      expect(google.resources.email).toHaveProperty("send");
    });

    test("has calendar resource with event operations", () => {
      expect(google.resources).toHaveProperty("calendar");
      expect(google.resources.calendar).toHaveProperty("list_events");
      expect(google.resources.calendar).toHaveProperty("create_event");
    });

    test("has contacts resource", () => {
      expect(google.resources).toHaveProperty("contacts");
      expect(google.resources.contacts).toHaveProperty("list");
    });

    test("specifies required OAuth scopes", () => {
      expect(google.authentication.scopes).toBeDefined();
      expect(google.authentication.scopes!.length).toBeGreaterThan(0);
      expect(google.authentication.scopes).toContain(
        "https://www.googleapis.com/auth/gmail.send"
      );
    });

    test("has workflow examples", () => {
      expect(google.examples).toBeDefined();
      expect(google.examples!.length).toBeGreaterThan(0);

      const example = google.examples![0];
      expect(example).toHaveProperty("intent");
      expect(example).toHaveProperty("operations");
      expect(example).toHaveProperty("code");
    });
  });

  describe("Notion Service Spec", () => {
    let notion: ServiceSpecification;

    beforeAll(() => {
      notion = serviceSpecsRegistry.get("notion")!;
    });

    test("has database resource with operations", () => {
      expect(notion.resources).toHaveProperty("database");
      expect(notion.resources.database).toHaveProperty("list");
      expect(notion.resources.database).toHaveProperty("query");
      expect(notion.resources.database).toHaveProperty("create");
    });

    test("has page resource with operations", () => {
      expect(notion.resources).toHaveProperty("page");
      expect(notion.resources.page).toHaveProperty("get");
      expect(notion.resources.page).toHaveProperty("create");
      expect(notion.resources.page).toHaveProperty("update");
    });

    test("defines page.create dependency on database", () => {
      const pageDeps = notion.dependencies.filter(
        (d) => d.operation === "page.create"
      );

      expect(pageDeps.length).toBeGreaterThan(0);
      expect(pageDeps[0].dependsOn).toContain("database.exists_or_create");
      expect(pageDeps[0].resolution).toBe("create");
    });
  });

  describe("Blooio Service Spec", () => {
    let blooio: ServiceSpecification;

    beforeAll(() => {
      blooio = serviceSpecsRegistry.get("blooio")!;
    });

    test("has message resource for iMessage operations", () => {
      expect(blooio.resources).toHaveProperty("message");
      expect(blooio.resources.message).toHaveProperty("send");
      expect(blooio.resources.message).toHaveProperty("send_media");
    });

    test("uses API key authentication", () => {
      expect(blooio.authentication.type).toBe("api_key");
      expect(blooio.authentication.requiredCredentials).toContain("api_key");
    });

    test("send operation has rate limits", () => {
      const sendOp = blooio.resources.message.send;
      expect(sendOp.rateLimit).toBeDefined();
    });
  });

  describe("Twilio Service Spec", () => {
    let twilio: ServiceSpecification;

    beforeAll(() => {
      twilio = serviceSpecsRegistry.get("twilio")!;
    });

    test("has SMS resource", () => {
      expect(twilio.resources).toHaveProperty("sms");
      expect(twilio.resources.sms).toHaveProperty("send");
    });

    test("has voice resource for calls", () => {
      expect(twilio.resources).toHaveProperty("voice");
      expect(twilio.resources.voice).toHaveProperty("make_call");
    });

    test("uses basic authentication", () => {
      expect(twilio.authentication.type).toBe("basic");
      expect(twilio.authentication.requiredCredentials).toContain("account_sid");
      expect(twilio.authentication.requiredCredentials).toContain("auth_token");
    });
  });

  describe("Dependency Lookup", () => {
    test("returns dependencies for Notion page.create", () => {
      const deps = serviceSpecsRegistry.getDependencies("notion", "page.create");

      expect(deps.length).toBeGreaterThan(0);
      expect(deps.some((d) => d.dependsOn.includes("database.exists_or_create"))).toBe(
        true
      );
    });

    test("returns empty array for operation without dependencies", () => {
      const deps = serviceSpecsRegistry.getDependencies("google", "email.list");

      expect(Array.isArray(deps)).toBe(true);
      expect(deps.length).toBe(0);
    });

    test("returns empty array for non-existent service", () => {
      const deps = serviceSpecsRegistry.getDependencies("fake", "operation");

      expect(Array.isArray(deps)).toBe(true);
      expect(deps.length).toBe(0);
    });
  });

  describe("Example Search", () => {
    test("finds relevant examples for email-related intent", () => {
      const examples = serviceSpecsRegistry.findRelevantExamples(
        "send an email to my team"
      );

      expect(examples.length).toBeGreaterThan(0);
      // Should find Google email examples
      const hasEmailExample = examples.some(
        (item) =>
          (item.example.intent && item.example.intent.toLowerCase().includes("email")) ||
          (item.example.operations && item.example.operations.some((op: string) => op.includes("email")))
      );
      expect(hasEmailExample).toBe(true);
    });

    test("finds relevant examples for calendar-related intent", () => {
      const examples = serviceSpecsRegistry.findRelevantExamples(
        "schedule a meeting for tomorrow"
      );

      expect(examples.length).toBeGreaterThan(0);
    });

    test("finds relevant examples for messaging intent", () => {
      const examples = serviceSpecsRegistry.findRelevantExamples(
        "send a text message to John"
      );

      expect(examples.length).toBeGreaterThan(0);
    });

    test("respects limit parameter", () => {
      const examples = serviceSpecsRegistry.findRelevantExamples(
        "send email and create calendar event",
        2
      );

      expect(examples.length).toBeLessThanOrEqual(2);
    });
  });

  describe("Service Summary Generation", () => {
    test("generates summary for Google service", () => {
      const summary = serviceSpecsRegistry.generateServiceSummary("google");

      expect(summary).toContain("Google");
      expect(summary).toContain("email");
      expect(summary).toContain("calendar");
      expect(summary.length).toBeGreaterThan(50);
    });

    test("generates summary for Notion service", () => {
      const summary = serviceSpecsRegistry.generateServiceSummary("notion");

      expect(summary).toContain("Notion");
      expect(summary).toContain("database");
      expect(summary).toContain("page");
    });

    test("returns empty string for non-existent service", () => {
      const summary = serviceSpecsRegistry.generateServiceSummary("fake");

      expect(summary).toBe("");
    });
  });

  describe("Full Context Generation", () => {
    test("generates context for connected services", () => {
      const connectedServices: ServiceConnectionStatus[] = [
        {
          serviceId: "google",
          connected: true,
          availableResources: ["email", "calendar"],
          missingScopes: [],
        },
        {
          serviceId: "notion",
          connected: true,
          availableResources: ["database", "page"],
          missingScopes: [],
        },
      ];

      const context = serviceSpecsRegistry.generateFullContext(connectedServices);

      expect(context.toLowerCase()).toContain("google");
      expect(context.toLowerCase()).toContain("notion");
      expect(context.toLowerCase()).toContain("connected");
      expect(context.length).toBeGreaterThan(100);
    });

    test("handles partially connected services", () => {
      const connectedServices: ServiceConnectionStatus[] = [
        {
          serviceId: "google",
          connected: true,
          availableResources: ["email"],
          missingScopes: ["https://www.googleapis.com/auth/calendar"],
        },
      ];

      const context = serviceSpecsRegistry.generateFullContext(connectedServices);

      expect(context.toLowerCase()).toContain("google");
      expect(context.toLowerCase()).toContain("email");
    });

    test("returns minimal context for empty connections", () => {
      const context = serviceSpecsRegistry.generateFullContext([]);

      expect(typeof context).toBe("string");
    });
  });
});
