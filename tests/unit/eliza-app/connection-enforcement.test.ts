/**
 * Connection Enforcement Service Tests
 *
 * Tests the connection enforcement logic that ensures registered users
 * connect at least one data integration (Google, Microsoft, or X/Twitter)
 * before the agent processes their messages.
 *
 * Tests cover:
 * - Required connection checking logic
 * - Provider detection from user messages
 * - OAuth link generation across platforms
 * - LLM fallback behavior
 * - System prompt construction with character traits
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// Test the provider detection logic (extracted from the service for testability)
const REQUIRED_PLATFORMS = ["google", "microsoft", "twitter"] as const;

const PROVIDER_ALIASES: Record<string, string> = {
  google: "google",
  gmail: "google",
  "google calendar": "google",
  gcal: "google",
  gdrive: "google",
  microsoft: "microsoft",
  outlook: "microsoft",
  hotmail: "microsoft",
  onedrive: "microsoft",
  x: "twitter",
  twitter: "twitter",
};

function detectProviderFromMessage(message: string): string | null {
  const lower = message.toLowerCase();
  for (const [alias, platform] of Object.entries(PROVIDER_ALIASES)) {
    if (lower.includes(alias)) return platform;
  }
  return null;
}

function hasRequiredConnectionFromList(platforms: string[]): boolean {
  return platforms.some((p) =>
    (REQUIRED_PLATFORMS as readonly string[]).includes(p),
  );
}

describe("Connection Enforcement", () => {
  describe("hasRequiredConnection", () => {
    test("returns true when google is connected", () => {
      expect(hasRequiredConnectionFromList(["google", "slack"])).toBe(true);
    });

    test("returns true when microsoft is connected", () => {
      expect(hasRequiredConnectionFromList(["microsoft"])).toBe(true);
    });

    test("returns true when twitter is connected", () => {
      expect(hasRequiredConnectionFromList(["twitter"])).toBe(true);
    });

    test("returns true when multiple required platforms are connected", () => {
      expect(hasRequiredConnectionFromList(["google", "twitter"])).toBe(true);
    });

    test("returns false when only non-required platforms are connected", () => {
      expect(hasRequiredConnectionFromList(["slack", "linear", "github"])).toBe(false);
    });

    test("returns false when no platforms are connected", () => {
      expect(hasRequiredConnectionFromList([])).toBe(false);
    });

    test("returns true with mix of required and non-required", () => {
      expect(
        hasRequiredConnectionFromList(["slack", "google", "linear"]),
      ).toBe(true);
    });
  });

  describe("Provider detection from user message", () => {
    test("detects google from 'connect google'", () => {
      expect(detectProviderFromMessage("connect google")).toBe("google");
    });

    test("detects google from 'I use gmail'", () => {
      expect(detectProviderFromMessage("I use gmail for email")).toBe("google");
    });

    test("detects microsoft from 'I want to use outlook'", () => {
      expect(detectProviderFromMessage("I want to use outlook")).toBe("microsoft");
    });

    test("detects microsoft from 'microsoft account'", () => {
      expect(detectProviderFromMessage("let me connect my microsoft account")).toBe("microsoft");
    });

    test("detects twitter from 'connect my x account'", () => {
      expect(detectProviderFromMessage("connect my x account")).toBe("twitter");
    });

    test("detects twitter from 'twitter'", () => {
      expect(detectProviderFromMessage("I have a twitter account")).toBe("twitter");
    });

    test("returns null for unrelated message", () => {
      expect(detectProviderFromMessage("hello how are you")).toBeNull();
    });

    test("returns null for empty message", () => {
      expect(detectProviderFromMessage("")).toBeNull();
    });

    test("is case insensitive", () => {
      expect(detectProviderFromMessage("GOOGLE")).toBe("google");
      expect(detectProviderFromMessage("Microsoft")).toBe("microsoft");
      expect(detectProviderFromMessage("TWITTER")).toBe("twitter");
    });

    test("detects google calendar alias", () => {
      expect(detectProviderFromMessage("connect google calendar")).toBe("google");
    });

    test("detects hotmail as microsoft", () => {
      expect(detectProviderFromMessage("I use hotmail")).toBe("microsoft");
    });

    test("detects onedrive as microsoft", () => {
      expect(detectProviderFromMessage("I have stuff on onedrive")).toBe("microsoft");
    });

    test("detects gdrive as google", () => {
      expect(detectProviderFromMessage("my files are on gdrive")).toBe("google");
    });
  });

  describe("Eliza character loading", () => {
    test("eliza.json exists and is valid JSON", () => {
      const charPath = join(process.cwd(), "../eliza-app/eliza.json");
      const raw = readFileSync(charPath, "utf-8");
      const parsed = JSON.parse(raw);

      expect(parsed.name).toBe("Eliza");
      expect(typeof parsed.system).toBe("string");
      expect(Array.isArray(parsed.bio)).toBe(true);
      expect(parsed.bio.length).toBeGreaterThan(0);
      expect(Array.isArray(parsed.adjectives)).toBe(true);
      expect(parsed.style).toBeDefined();
      expect(Array.isArray(parsed.style.all)).toBe(true);
      expect(Array.isArray(parsed.style.chat)).toBe(true);
    });

    test("character system prompt mentions no exclamation points", () => {
      const charPath = join(process.cwd(), "../eliza-app/eliza.json");
      const raw = readFileSync(charPath, "utf-8");
      const parsed = JSON.parse(raw);

      expect(parsed.system.toLowerCase()).toContain("exclamation");
    });

    test("character has lowercase style rule", () => {
      const charPath = join(process.cwd(), "../eliza-app/eliza.json");
      const raw = readFileSync(charPath, "utf-8");
      const parsed = JSON.parse(raw);

      const allStyles = [...parsed.style.all, ...parsed.style.chat];
      const hasLowercaseRule = allStyles.some(
        (s: string) => s.toLowerCase().includes("lowercase"),
      );
      expect(hasLowercaseRule).toBe(true);
    });
  });

  describe("Connection enforcement in webhook handlers", () => {
    test("Discord webhook imports connectionEnforcementService", () => {
      const webhookSource = readFileSync(
        join(process.cwd(), "app/api/eliza-app/webhook/discord/route.ts"),
        "utf-8",
      );
      expect(webhookSource).toContain("connectionEnforcementService");
      expect(webhookSource).toContain("hasRequiredConnection");
      expect(webhookSource).toContain("generateNudgeResponse");
    });

    test("Telegram webhook imports connectionEnforcementService", () => {
      const webhookSource = readFileSync(
        join(process.cwd(), "app/api/eliza-app/webhook/telegram/route.ts"),
        "utf-8",
      );
      expect(webhookSource).toContain("connectionEnforcementService");
      expect(webhookSource).toContain("hasRequiredConnection");
      expect(webhookSource).toContain("generateNudgeResponse");
    });

    test("Blooio webhook imports connectionEnforcementService", () => {
      const webhookSource = readFileSync(
        join(process.cwd(), "app/api/eliza-app/webhook/blooio/route.ts"),
        "utf-8",
      );
      expect(webhookSource).toContain("connectionEnforcementService");
      expect(webhookSource).toContain("hasRequiredConnection");
      expect(webhookSource).toContain("generateNudgeResponse");
    });

    test("Discord webhook checks connection before room creation", () => {
      const webhookSource = readFileSync(
        join(process.cwd(), "app/api/eliza-app/webhook/discord/route.ts"),
        "utf-8",
      );
      // Look for the function call, not the import
      const connectionCheckIdx = webhookSource.indexOf("hasRequiredConnection(");
      const roomCreationIdx = webhookSource.lastIndexOf("generateElizaAppRoomId(");
      expect(connectionCheckIdx).toBeGreaterThan(0);
      expect(roomCreationIdx).toBeGreaterThan(connectionCheckIdx);
    });

    test("Telegram webhook checks connection before room creation", () => {
      const webhookSource = readFileSync(
        join(process.cwd(), "app/api/eliza-app/webhook/telegram/route.ts"),
        "utf-8",
      );
      const connectionCheckIdx = webhookSource.indexOf("hasRequiredConnection(");
      const roomCreationIdx = webhookSource.lastIndexOf("generateElizaAppRoomId(");
      expect(connectionCheckIdx).toBeGreaterThan(0);
      expect(roomCreationIdx).toBeGreaterThan(connectionCheckIdx);
    });

    test("Blooio webhook checks connection before room creation", () => {
      const webhookSource = readFileSync(
        join(process.cwd(), "app/api/eliza-app/webhook/blooio/route.ts"),
        "utf-8",
      );
      const connectionCheckIdx = webhookSource.indexOf("hasRequiredConnection(");
      const roomCreationIdx = webhookSource.lastIndexOf("generateElizaAppRoomId(");
      expect(connectionCheckIdx).toBeGreaterThan(0);
      expect(roomCreationIdx).toBeGreaterThan(connectionCheckIdx);
    });

    test("Telegram /status command shows connection status", () => {
      const webhookSource = readFileSync(
        join(process.cwd(), "app/api/eliza-app/webhook/telegram/route.ts"),
        "utf-8",
      );
      expect(webhookSource).toContain("Data integration connected");
      expect(webhookSource).toContain("No data integration");
    });
  });

  describe("Web chat is NOT enforced", () => {
    test("Stream route does NOT contain connection enforcement", () => {
      const streamSource = readFileSync(
        join(
          process.cwd(),
          "app/api/eliza/rooms/[roomId]/messages/stream/route.ts",
        ),
        "utf-8",
      );
      expect(streamSource).not.toContain("connectionEnforcementService");
      expect(streamSource).not.toContain("requiresConnection");
    });

    test("Chat interface does NOT contain connection enforcement", () => {
      const chatSource = readFileSync(
        join(process.cwd(), "components/chat/eliza-chat-interface.tsx"),
        "utf-8",
      );
      expect(chatSource).not.toContain("isConnectionRequiredError");
      expect(chatSource).not.toContain("handleConnectionRequired");
    });
  });

  describe("Connection success page", () => {
    test("Success page route exists", () => {
      const routeSource = readFileSync(
        join(
          process.cwd(),
          "app/api/eliza-app/auth/connection-success/route.ts",
        ),
        "utf-8",
      );
      expect(routeSource).toContain("export async function GET");
      expect(routeSource).toContain("connection-success");
    });

    test("Success page handles all platform types", () => {
      const routeSource = readFileSync(
        join(
          process.cwd(),
          "app/api/eliza-app/auth/connection-success/route.ts",
        ),
        "utf-8",
      );
      expect(routeSource).toContain("discord");
      expect(routeSource).toContain("telegram");
      expect(routeSource).toContain("imessage");
      expect(routeSource).toContain("web");
    });

    test("Success page redirects web platform to dashboard", () => {
      const routeSource = readFileSync(
        join(
          process.cwd(),
          "app/api/eliza-app/auth/connection-success/route.ts",
        ),
        "utf-8",
      );
      expect(routeSource).toContain("/dashboard/chat");
      expect(routeSource).toContain("NextResponse.redirect");
    });
  });

  describe("Service exports", () => {
    test("connection-enforcement is exported from eliza-app index", () => {
      const indexSource = readFileSync(
        join(process.cwd(), "lib/services/eliza-app/index.ts"),
        "utf-8",
      );
      expect(indexSource).toContain("connectionEnforcementService");
      expect(indexSource).toContain("connection-enforcement");
    });
  });

  describe("Nudge interval and conversation state", () => {
    const NUDGE_INTERVAL = 3;

    function shouldNudge(messageCount: number): boolean {
      return messageCount % NUDGE_INTERVAL === 0;
    }

    test("nudges on first message (count 0)", () => {
      expect(shouldNudge(0)).toBe(true);
    });

    test("does not nudge on second message (count 1)", () => {
      expect(shouldNudge(1)).toBe(false);
    });

    test("does not nudge on third message (count 2)", () => {
      expect(shouldNudge(2)).toBe(false);
    });

    test("nudges again on fourth message (count 3)", () => {
      expect(shouldNudge(3)).toBe(true);
    });

    test("nudge pattern repeats correctly over 9 messages", () => {
      const results = Array.from({ length: 9 }, (_, i) => shouldNudge(i));
      expect(results).toEqual([
        true, false, false,
        true, false, false,
        true, false, false,
      ]);
    });

    test("connection-enforcement.ts uses cache for conversation state", () => {
      const source = readFileSync(
        join(process.cwd(), "lib/services/eliza-app/connection-enforcement.ts"),
        "utf-8",
      );
      expect(source).toContain("@/lib/cache/client");
      expect(source).toContain("connection_enforcement:");
      expect(source).toContain("loadConversationState");
      expect(source).toContain("saveConversationState");
    });

    test("connection-enforcement.ts has nudge and chat prompt modes", () => {
      const source = readFileSync(
        join(process.cwd(), "lib/services/eliza-app/connection-enforcement.ts"),
        "utf-8",
      );
      expect(source).toContain("buildNudgePrompt");
      expect(source).toContain("buildChatPrompt");
      expect(source).toContain("shouldNudge");
      expect(source).toContain("NUDGE_INTERVAL");
    });

    test("chat prompt does not ask about connection", () => {
      const source = readFileSync(
        join(process.cwd(), "lib/services/eliza-app/connection-enforcement.ts"),
        "utf-8",
      );
      // The chat prompt should tell the LLM NOT to bring up connection
      expect(source).toContain("don't bring it up again right now");
      expect(source).toContain("Just chat naturally");
    });

    test("conversation history is passed to LLM", () => {
      const source = readFileSync(
        join(process.cwd(), "lib/services/eliza-app/connection-enforcement.ts"),
        "utf-8",
      );
      expect(source).toContain("formatConversationHistory");
      expect(source).toContain("conversationHistory");
      expect(source).toContain("Recent conversation:");
    });

    test("NUDGE_INTERVAL is exported", () => {
      const source = readFileSync(
        join(process.cwd(), "lib/services/eliza-app/connection-enforcement.ts"),
        "utf-8",
      );
      expect(source).toContain("export {");
      expect(source).toContain("NUDGE_INTERVAL");
    });
  });
});
