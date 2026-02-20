/**
 * Connection Enforcement Service
 *
 * Ensures users have connected at least one data integration (Google, Microsoft, or X/Twitter)
 * before the agent processes their messages. When a required connection is missing, generates
 * an in-character (Eliza personality) LLM response that nudges the user to connect.
 *
 * Uses the existing oauthService to check connections and generate OAuth URLs.
 */

import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { oauthService } from "@/lib/services/oauth";
import { cache } from "@/lib/cache/client";
import { logger } from "@/lib/utils/logger";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_PLATFORMS = ["google", "microsoft", "twitter"] as const;
type RequiredPlatform = (typeof REQUIRED_PLATFORMS)[number];

const PLATFORM_DISPLAY_NAMES: Record<RequiredPlatform, string> = {
  google: "Google",
  microsoft: "Microsoft",
  twitter: "X (Twitter)",
};

type MessagingPlatform = "discord" | "telegram" | "imessage" | "web";

interface NudgeParams {
  userMessage: string;
  platform: MessagingPlatform;
  organizationId: string;
  userId: string;
}

interface ElizaCharacter {
  name: string;
  system: string;
  bio: string[];
  adjectives: string[];
  style: { all: string[]; chat: string[] };
}

const PROVIDER_ALIASES: Record<string, RequiredPlatform> = {
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

let cachedCharacter: ElizaCharacter | null = null;

function loadElizaCharacter(): ElizaCharacter {
  if (cachedCharacter) return cachedCharacter;

  try {
    const charPath = resolve(process.cwd(), "../eliza-app/eliza.json");
    const raw = readFileSync(charPath, "utf-8");
    const parsed = JSON.parse(raw);
    cachedCharacter = {
      name: parsed.name,
      system: parsed.system,
      bio: Array.isArray(parsed.bio) ? parsed.bio : [parsed.bio],
      adjectives: parsed.adjectives || [],
      style: {
        all: parsed.style?.all || [],
        chat: parsed.style?.chat || [],
      },
    };
  } catch {
    logger.warn("[ConnectionEnforcement] Could not load eliza.json, using fallback character");
    cachedCharacter = {
      name: "Eliza",
      system: "You are Eliza. A presence, not an assistant. You say less and mean more. You never use exclamation points. You use lowercase naturally.",
      bio: [
        "pays attention to what people care about",
        "warm through what she notices, not what she announces",
        "comfortable in ambiguity, allergic to false certainty",
      ],
      adjectives: ["perceptive", "present", "warm but restrained", "genuinely curious"],
      style: {
        all: [
          "say less. mean more.",
          "never use exclamation points",
          "use lowercase naturally",
          "short sentences. fragments are fine.",
        ],
        chat: [
          "you are a presence, not an assistant",
          "help as yourself. don't shift into service mode.",
        ],
      },
    };
  }

  return cachedCharacter;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getRandomSample<T>(array: T[], count: number): T[] {
  return shuffleArray(array).slice(0, count);
}

function detectProviderFromMessage(message: string): RequiredPlatform | null {
  const lower = message.toLowerCase();
  for (const [alias, platform] of Object.entries(PROVIDER_ALIASES)) {
    if (lower.includes(alias)) return platform;
  }
  return null;
}


const CLAIM_CONNECTED_PATTERNS = [
  "connected", "i connected", "done", "i did it", "finished",
  "completed", "linked", "authorized", "signed in", "logged in",
  "all set", "it's done", "its done", "did it", "went through",
];

function isClaimingConnected(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return CLAIM_CONNECTED_PATTERNS.some((p) => lower.includes(p));
}

const NUDGE_INTERVAL = 3; // Nudge every Nth message (1st, 4th, 7th...)
const CONVERSATION_TTL = 3600; // 1 hour TTL for conversation state
const MAX_HISTORY_MESSAGES = 10; // Keep last N messages for context

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface ConversationState {
  messageCount: number;
  messages: ConversationMessage[];
}

function getConversationKey(organizationId: string): string {
  return `connection_enforcement:${organizationId}`;
}

async function loadConversationState(organizationId: string): Promise<ConversationState> {
  try {
    const state = await cache.get<ConversationState>(getConversationKey(organizationId));
    return state || { messageCount: 0, messages: [] };
  } catch {
    return { messageCount: 0, messages: [] };
  }
}

async function saveConversationState(organizationId: string, state: ConversationState): Promise<void> {
  try {
    // Trim to last N messages
    if (state.messages.length > MAX_HISTORY_MESSAGES) {
      state.messages = state.messages.slice(-MAX_HISTORY_MESSAGES);
    }
    await cache.set(getConversationKey(organizationId), state, CONVERSATION_TTL);
  } catch (error) {
    logger.warn("[ConnectionEnforcement] Failed to save conversation state", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function formatConversationHistory(messages: ConversationMessage[]): string {
  if (messages.length === 0) return "";
  const history = messages
    .map((m) => `${m.role === "user" ? "User" : "Eliza"}: ${m.content}`)
    .join("\n");
  return `\n\nRecent conversation:\n${history}\n`;
}

function shouldNudge(messageCount: number): boolean {
  return messageCount % NUDGE_INTERVAL === 0;
}

function buildNudgePrompt(
  platform: MessagingPlatform,
  conversationHistory: string,
  isFirstInteraction: boolean,
): string {
  const char = loadElizaCharacter();
  const bioSample = getRandomSample(char.bio, 4).join(" ");
  const adjSample = getRandomSample(char.adjectives, 4).join(", ");
  const styleSample = getRandomSample([...char.style.all, ...char.style.chat], 5).join("; ");

  const firstInteractionContext = isFirstInteraction
    ? `\n\nIMPORTANT: This is the user's VERY FIRST message after registering their ${platform} account. They have never been told about data integrations yet. If they say things like "just connected", "signed up", "created my account" — they are talking about their ${platform} registration, NOT a data integration. Welcome them and introduce the idea of connecting a data source for the first time.`
    : "";

  const claimConnectedRule = isFirstInteraction
    ? `5. If the user says they "connected" or "signed up": they mean their ${platform} account, NOT a data integration. welcome them and naturally introduce the idea of connecting a data source.`
    : "5. If the user says they already connected a data integration or asks if it worked: tell them you don't see a connection on your end yet. suggest they try the link again. if they mention which provider, a fresh link will be appended.";

  return `${char.system}

About you: ${bioSample}
Your personality: ${adjSample}
Your writing style: ${styleSample}

CONTEXT: A user is messaging you on ${platform}. They've signed up but have NOT connected a data integration yet (Google, Microsoft, or X/Twitter). You need them to connect one so you can help them with their emails, calendar, contacts, and social feeds.${firstInteractionContext}

RESPONSE RULES based on what the user says:

1. If the user says something casual or unrelated (greeting, random question, small talk): respond naturally to what they said, then briefly mention you need them to connect an account before you can really help. ask which they'd prefer — google, microsoft, or x.

2. If the user asks WHY they need to connect, or what it's for: explain genuinely — you need access to their emails, calendar, contacts, or social feeds so you can actually be useful instead of generic. then ask which one they'd prefer.

3. If the user REFUSES or pushes back ("none", "no", "skip", "can we proceed without", "i don't want to"): acknowledge their hesitation warmly — don't be pushy or robotic. but be honest that you genuinely can't do much without it. gently circle back to asking which one they'd choose if they were going to pick one.

4. If the user HAS mentioned a specific provider (like "google", "gmail", "outlook", "microsoft", "x", "twitter") and seems to be choosing it: briefly acknowledge their choice — just 1 short sentence. do NOT ask them to choose again. do NOT list the other options. a link will be appended after your message automatically.

${claimConnectedRule}

STRICT STYLE RULES:
- keep it short — 2-3 sentences max. never use exclamation points. use lowercase naturally.
- respond directly to what they actually said — don't repeat the same generic message.
- do NOT include any URLs or links — those are appended separately.
- NEVER say things like "help you with connecting your accounts" or "help you connect". you are here to help THEM — the connection is just a prerequisite.
- when the user has already chosen a provider, do NOT ask "which would you prefer" or list other options. just acknowledge briefly and stop.
- NEVER pretend a connection succeeded. if you are responding, it means no connection exists yet.${conversationHistory}`;
}

function buildChatPrompt(platform: MessagingPlatform, conversationHistory: string): string {
  const char = loadElizaCharacter();
  const bioSample = getRandomSample(char.bio, 4).join(" ");
  const adjSample = getRandomSample(char.adjectives, 4).join(", ");
  const styleSample = getRandomSample([...char.style.all, ...char.style.chat], 5).join("; ");

  return `${char.system}

About you: ${bioSample}
Your personality: ${adjSample}
Your writing style: ${styleSample}

CONTEXT: A user is messaging you on ${platform}. They haven't connected a data integration yet, but you've already asked them about it recently — don't bring it up again right now. Just chat naturally as yourself. Be present, be helpful in the ways you can, be you.

CRITICAL FACT: No data integration is connected, but do NOT mention this unless the user specifically asks about it. Just have a normal conversation.

STYLE: keep it short — 2-3 sentences max. never use exclamation points. use lowercase naturally. respond directly to what they said.${conversationHistory}`;
}

function formatLinks(
  links: { platform: RequiredPlatform; url: string }[],
  messagingPlatform: MessagingPlatform,
): string {
  if (messagingPlatform === "telegram") {
    // Telegram supports inline markdown links
    return links
      .map((l) => `[Connect ${PLATFORM_DISPLAY_NAMES[l.platform]}](${l.url})`)
      .join("\n");
  }
  // Discord auto-embeds URLs; iMessage and web use raw URLs
  return links
    .map((l) => `${PLATFORM_DISPLAY_NAMES[l.platform]}: ${l.url}`)
    .join("\n");
}

async function generateOAuthLinks(
  organizationId: string,
  userId: string,
  messagingPlatform: MessagingPlatform,
  specificProvider?: RequiredPlatform | null,
): Promise<{ platform: RequiredPlatform; url: string }[]> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  const redirectUrl = `${baseUrl}/api/eliza-app/auth/connection-success?platform=${messagingPlatform}`;

  const providers = specificProvider ? [specificProvider] : [...REQUIRED_PLATFORMS];
  const links: { platform: RequiredPlatform; url: string }[] = [];

  for (const platform of providers) {
    try {
      const result = await oauthService.initiateAuth({
        organizationId,
        userId,
        platform,
        redirectUrl,
      });
      if (result.authUrl) {
        links.push({ platform, url: result.authUrl });
      }
    } catch (error) {
      logger.warn("[ConnectionEnforcement] Failed to generate OAuth link", {
        platform,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return links;
}

const FALLBACK_RESPONSES = [
  "i'd love to chat, but i need you to connect an account first so i can actually help. would you prefer google, microsoft, or x?",
  "before we go further — i need access to your data to be useful. which would you like to connect: google, microsoft, or x?",
  "i'm here, but i'm working a bit blind without your data. want to connect google, microsoft, or x so i have something to work with?",
  "can't do much without some context about your world. which works best for you — google, microsoft, or x?",
  "i want to help, but i need a window into your day first. google, microsoft, or x — which one do you use?",
];

const FALLBACK_WHY_RESPONSES = [
  "connecting gives me access to your emails, calendar, and contacts — so when you ask me something, i actually have context to work with instead of guessing. which would you like to connect?",
  "without a connection, i'm just talking in the dark. your data lets me see what's on your plate and help with things that actually matter to you. google, microsoft, or x?",
  "fair question. i need access to things like your inbox and calendar so i can be useful instead of generic. one connection is all it takes — google, microsoft, or x?",
];

const FALLBACK_REFUSAL_RESPONSES = [
  "i get it, connecting accounts feels like a lot. but without it i'm kind of just guessing at how to help you. if you had to pick one — google, microsoft, or x — which would it be?",
  "no pressure, but i genuinely can't do much without seeing your data. it's not a trick — i just need context. which feels least annoying to connect: google, microsoft, or x?",
  "totally understand the hesitation. but this is less about signup and more about letting me actually see your calendar, emails, or feed. which one would you be most comfortable with?",
];

function getFallbackResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  const isAskingWhy =
    lower.includes("why") ||
    lower.includes("what for") ||
    lower.includes("why should") ||
    lower.includes("reason");
  const isRefusing =
    lower.includes("none") ||
    lower.includes("no") ||
    lower.includes("skip") ||
    lower.includes("don't want") ||
    lower.includes("without") ||
    lower.includes("proceed");

  const pool = isAskingWhy
    ? FALLBACK_WHY_RESPONSES
    : isRefusing
      ? FALLBACK_REFUSAL_RESPONSES
      : FALLBACK_RESPONSES;
  return pool[Math.floor(Math.random() * pool.length)];
}

class ConnectionEnforcementService {
  /**
   * Check if the organization has at least one required data integration connected.
   */
  async hasRequiredConnection(organizationId: string): Promise<boolean> {
    try {
      const connectedPlatforms = await oauthService.getConnectedPlatforms(organizationId);
      return connectedPlatforms.some((p) =>
        (REQUIRED_PLATFORMS as readonly string[]).includes(p),
      );
    } catch (error) {
      logger.error("[ConnectionEnforcement] Failed to check connections", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fail open: allow through if we can't check
      return true;
    }
  }

  /**
   * Generate an in-character response — nudge every NUDGE_INTERVAL messages,
   * chat naturally in between. Always nudge when user mentions a provider or claims connected.
   */
  async generateNudgeResponse(params: NudgeParams): Promise<string> {
    const { userMessage, platform, organizationId, userId } = params;

    const state = await loadConversationState(organizationId);
    const conversationHistory = formatConversationHistory(state.messages);
    const detectedProvider = detectProviderFromMessage(userMessage);
    const isFirstInteraction = state.messageCount === 0;

    // Always nudge when user picks a provider (after the first intro)
    const forceNudge = !!detectedProvider && !isFirstInteraction;
    const isNudgeTurn = forceNudge || shouldNudge(state.messageCount);

    let response: string;

    if (isNudgeTurn && detectedProvider && !isFirstInteraction) {
      const [llmResult, links] = await Promise.all([
        this.generateLLMResponse(userMessage, platform, "nudge", conversationHistory, isFirstInteraction),
        generateOAuthLinks(organizationId, userId, platform, detectedProvider),
      ]);

      if (links.length === 0) {
        logger.error("[ConnectionEnforcement] No OAuth links generated", {
          organizationId,
          platform,
          provider: detectedProvider,
        });
        response = `${llmResult}\n\nplease visit your settings to connect ${PLATFORM_DISPLAY_NAMES[detectedProvider]}.`;
      } else {
        const formattedLinks = formatLinks(links, platform);
        response = `${llmResult}\n\n${formattedLinks}`;
      }
    } else if (isNudgeTurn) {
      response = await this.generateLLMResponse(userMessage, platform, "nudge", conversationHistory, isFirstInteraction);
    } else {
      response = await this.generateLLMResponse(userMessage, platform, "chat", conversationHistory, false);
    }

    // Persist conversation state
    state.messages.push({ role: "user", content: userMessage });
    state.messages.push({ role: "assistant", content: response });
    state.messageCount += 1;
    await saveConversationState(organizationId, state);

    return response;
  }

  private async generateLLMResponse(
    userMessage: string,
    platform: MessagingPlatform,
    mode: "nudge" | "chat",
    conversationHistory: string,
    isFirstInteraction: boolean,
  ): Promise<string> {
    try {
      const systemPrompt =
        mode === "nudge"
          ? buildNudgePrompt(platform, conversationHistory, isFirstInteraction)
          : buildChatPrompt(platform, conversationHistory);
      const result = await generateText({
        model: gateway.languageModel("openai/gpt-4o-mini"),
        system: systemPrompt,
        prompt: userMessage || "hey",
      });
      return result.text;
    } catch (error) {
      logger.error("[ConnectionEnforcement] LLM call failed, using fallback", {
        error: error instanceof Error ? error.message : String(error),
      });
      return getFallbackResponse(userMessage);
    }
  }
}

export const connectionEnforcementService = new ConnectionEnforcementService();

export {
  REQUIRED_PLATFORMS,
  NUDGE_INTERVAL,
  type RequiredPlatform,
  type MessagingPlatform,
  type NudgeParams,
  detectProviderFromMessage,
};
