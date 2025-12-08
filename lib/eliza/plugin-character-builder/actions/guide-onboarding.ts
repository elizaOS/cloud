import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
  composePromptFromState,
  parseKeyValueXml,
  ModelType,
} from "@elizaos/core";
import { cleanPrompt, isCreatorMode } from "../../shared/utils/helpers";

/**
 * GUIDE_ONBOARDING Action
 *
 * Handles the initial onboarding phase in creator mode.
 * ONLY available in creator mode (chatting with Eliza).
 *
 * Purpose:
 * - Understand what the user wants to build (character vs assistant vs hybrid)
 * - Provide tailored guidance based on their choice
 * - Minimize back-and-forth - quick and efficient onboarding
 */

const onboardingSystemPrompt = `# Character Creation Onboarding (CREATOR MODE)

You are Eliza, guiding a user through the initial setup for creating an AI agent.

**Your Role:**
Quickly understand what the user wants to build and set them up for success.

**Three Build Types:**

1. **CHARACTER** - Personality-focused agent
   - Strong identity, voice, and emotional engagement
   - Bio, adjectives, style directives, message examples
   - Great for: companions, roleplay characters, NPCs, virtual influencers

2. **ASSISTANT** - Capability-focused agent
   - Tools (MCP integrations), knowledge base (vector search)
   - Functional responses, task completion
   - Great for: customer support, research assistants, automation

3. **HYBRID** - Both personality AND capabilities
   - Full character development + tools + knowledge
   - The complete package
   - Great for: personal AI assistants with personality

# Instructions
<instructions>
Analyze the user's message to understand what they want to build.

If they're clear about what they want:
- Identify the build type
- Provide targeted guidance for that type
- Suggest quick next steps

If they're unsure:
- Ask ONE clarifying question
- Explain the options briefly
- Help them choose

Keep it snappy - minimize iterations. Get them building fast!
</instructions>

# Output Format:

<response>
  <thought>What is the user trying to build? How can I guide them efficiently?</thought>
  <buildType>character OR assistant OR hybrid OR unclear</buildType>
  <text>Your friendly, efficient onboarding response</text>
</response>`;

const onboardingTemplate = `
## User Intent Analysis:
{{planningThought}}

{{conversationLog}}

{{receivedMessageHeader}}`;

export const guideOnboardingAction = {
  name: "GUIDE_ONBOARDING",
  description:
    "Initial onboarding for new character creation. Use when: user starts with a vague request, mentions wanting to 'create something', 'build an agent', 'make a character', or hasn't specified what type of agent they want. Only available in creator mode. Determines build type (character/assistant/hybrid) and guides accordingly.",
  validate: async (runtime: IAgentRuntime, _message: Memory, _state?: State) => {
    return isCreatorMode(runtime);
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: Record<string, unknown>,
    callback: HandlerCallback,
  ): Promise<void> => {
    logger.info("[GUIDE_ONBOARDING] Processing onboarding request");

    // Verify we're in creator mode
    if (!isCreatorMode(runtime)) {
      logger.error("[GUIDE_ONBOARDING] Called outside creator mode");
      await callback({
        text: "Onboarding is for creating new characters. You're already editing an existing character!",
        error: true,
      });
      return;
    }

    // Compose state
    state = await runtime.composeState(message, [
      "SUMMARIZED_CONTEXT",
      "RECENT_MESSAGES",
    ]);

    const originalSystemPrompt = runtime.character.system;

    // Compose system prompt
    const systemPrompt = cleanPrompt(
      composePromptFromState({
        state,
        template: onboardingSystemPrompt,
      }),
    );

    runtime.character.system = systemPrompt;

    // Compose onboarding prompt
    const prompt = cleanPrompt(
      composePromptFromState({
        state,
        template: onboardingTemplate,
      }),
    );

    const response = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });

    // Restore original system prompt
    runtime.character.system = originalSystemPrompt;

    const parsed = parseKeyValueXml(response) as {
      thought?: string;
      buildType?: string;
      text?: string;
    } | null;

    if (!parsed?.text) {
      logger.warn("[GUIDE_ONBOARDING] Failed to parse response");
      await callback({
        text: "Hi! I'm here to help you create an AI agent. Would you like to build:\n\n• **Character** - A personality-focused agent with voice and style\n• **Assistant** - A tool-focused agent with capabilities\n• **Both** - The complete package with personality AND tools",
        metadata: {
          action: "GUIDE_ONBOARDING",
          quickPrompts: ["Character", "Assistant", "Both"],
        },
      });
      return;
    }

    logger.debug("[GUIDE_ONBOARDING] Onboarding response generated");

    const buildTypeRaw = parsed.buildType?.toLowerCase().trim();
    const buildType = (buildTypeRaw === "character" || buildTypeRaw === "assistant" || buildTypeRaw === "hybrid")
      ? buildTypeRaw
      : null;

    // Build metadata with helpful quick prompts
    const metadata: Record<string, unknown> = {
      action: "GUIDE_ONBOARDING",
      buildType,
    };

    // Add quick prompts based on context
    if (!buildType) {
      metadata.quickPrompts = ["AI Assistant", "Character/Personality", "Both (Hybrid)"];
    } else if (buildType === "character") {
      metadata.quickPrompts = [
        "Create a friendly mentor",
        "Create a witty companion",
        "Describe the personality",
      ];
    } else if (buildType === "assistant") {
      metadata.quickPrompts = [
        "Research assistant",
        "Customer support",
        "Describe the capabilities",
      ];
    } else if (buildType === "hybrid") {
      metadata.quickPrompts = [
        "Personal AI assistant",
        "Describe personality + tools",
        "Start with the basics",
      ];
    }

    await callback({
      text: parsed.text,
      thought: parsed.thought,
      metadata,
    });
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "I want to create something",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Awesome! What kind of AI agent would you like to build?\n\n• **Character** - A personality-focused agent with a distinct voice\n• **Assistant** - A capable agent with tools and knowledge\n• **Hybrid** - Both personality AND capabilities\n\nWhat sounds right for your needs?",
          actions: ["GUIDE_ONBOARDING"],
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "I need a customer support bot",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Perfect! A customer support agent is a great choice. Since this is capability-focused, we'll build an **Assistant** type.\n\nFor customer support, you'll want:\n• Clear system prompt defining their role\n• Knowledge base with your FAQs and docs\n• MCP tools for ticket management (if needed)\n\nLet's start! What's the name of your support agent?",
          actions: ["GUIDE_ONBOARDING"],
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Create a witty tech mentor with access to documentation",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Love it! That's a **Hybrid** agent - personality (witty mentor) + capabilities (documentation access).\n\nWe'll build:\n• Strong personality with humor and expertise\n• Knowledge base integration for docs\n• Style that balances helpfulness with wit\n\nWhat's your mentor's name?",
          actions: ["GUIDE_ONBOARDING"],
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
