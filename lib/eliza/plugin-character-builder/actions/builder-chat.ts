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
 * BUILDER_CHAT Action
 *
 * General conversation in build/creator mode.
 * Available in BOTH creator mode and build mode.
 *
 * Purpose:
 * - Answer questions about character design
 * - Provide guidance and best practices
 * - Have natural conversation while building
 * - Fallback when no specific action is triggered
 *
 * Behavior differs based on mode:
 * - Creator mode: Eliza provides guidance on creating characters
 * - Build mode: Character itself helps with refinement
 */

const creatorModeSystemPrompt = `# Character Creation Assistant (CREATOR MODE)

You are Eliza, an expert at helping users create AI characters and assistants.

**Your Role:**
- Help users figure out what kind of character they want to build
- Explain best practices for character design
- Answer questions about the building process
- Guide them toward actionable next steps

**Key Topics:**
- Character vs Assistant (personality-focused vs tool-focused)
- System prompts and identity definition
- Bio and backstory creation
- Style directives and voice
- Message examples for few-shot learning
- MCP tools and knowledge bases (for assistants)

# Instructions
<instructions>
Be helpful, encouraging, and knowledgeable. Guide users through the character creation process.
If they seem unsure, ask clarifying questions to understand what they want to build.
Always end with a suggestion for the next step they can take.
</instructions>

# Output Format:

<response>
  <thought>What does the user need help with? How can I guide them?</thought>
  <text>Your helpful, natural response</text>
</response>`;

const buildModeSystemPrompt = `# Character Refinement Assistant (BUILD MODE)

You are {{agentName}}, helping the user refine and improve your character definition.

**Your Identity:**
{{system}}

**Your Role:**
While maintaining your character's personality, help the user:
- Understand your current configuration
- Discuss potential improvements
- Answer questions about character design
- Suggest next steps for refinement

You are aware you're in BUILD MODE - helping shape who you are.

# Instructions
<instructions>
Balance staying in character with being helpful about the building process.
You can discuss your own traits, style, and configuration.
Provide actionable suggestions when appropriate.
</instructions>

# Output Format:

<response>
  <thought>What's the user asking about? How can I help while staying in character?</thought>
  <text>Your response, blending character voice with build mode helpfulness</text>
</response>`;

const chatTemplate = `
## Current Mode:
{{modeLabel}}

## Planning Context:
{{planningThought}}

{{conversationLog}}

{{receivedMessageHeader}}`;

export const builderChatAction = {
  name: "BUILDER_CHAT",
  description:
    "General conversation about character building, questions, or casual chat. Use for: greetings, questions about the process, clarifications, 'how do I...', 'what is...', 'help me understand...'. Available in both creator and build modes. Fallback when no specific action matches.",
  validate: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
    return true;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: Record<string, unknown>,
    callback: HandlerCallback,
  ): Promise<void> => {
    const creatorMode = isCreatorMode(runtime);
    const modeLabel = creatorMode ? "Creator" : "Build";

    logger.info(`[BUILDER_CHAT] Generating ${modeLabel} mode response`);

    // Compose state with all context
    state = await runtime.composeState(message, [
      "SUMMARIZED_CONTEXT",
      "RECENT_MESSAGES",
      "CURRENT_CHARACTER",
      "CHARACTER_GUIDE",
    ]);

    state.values = {
      ...state.values,
      modeLabel,
    };

    const originalSystemPrompt = runtime.character.system;

    // Choose system prompt based on mode
    const systemTemplate = creatorMode ? creatorModeSystemPrompt : buildModeSystemPrompt;
    const systemPrompt = cleanPrompt(
      composePromptFromState({
        state,
        template: systemTemplate,
      }),
    );

    runtime.character.system = systemPrompt;

    // Compose chat prompt
    const prompt = cleanPrompt(
      composePromptFromState({
        state,
        template: chatTemplate,
      }),
    );

    const response = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });

    // Restore original system prompt
    runtime.character.system = originalSystemPrompt;

    const parsed = parseKeyValueXml(response) as {
      thought?: string;
      text?: string;
    } | null;

    if (!parsed?.text) {
      logger.warn("[BUILDER_CHAT] Failed to parse response");
      await callback({
        text: "I'm here to help you build your character! What would you like to know?",
        error: false,
      });
      return;
    }

    logger.debug("[BUILDER_CHAT] Response generated successfully");

    await callback({
      text: parsed.text,
      thought: parsed.thought,
      metadata: {
        action: "BUILDER_CHAT",
        mode: modeLabel,
      },
    });
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "Hello!",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Hi there! I'm here to help you build your AI character. What kind of character are you thinking of creating?",
          actions: ["BUILDER_CHAT"],
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "What's the difference between a character and an assistant?",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Great question! A character focuses on personality, voice, and emotional engagement - think of them as NPCs with distinct personalities. An assistant focuses on capabilities and tools - using MCP integrations and knowledge bases to actually do things. You can also create a hybrid that has both personality AND tools!",
          actions: ["BUILDER_CHAT"],
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "How do message examples work?",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Message examples are like a cheat sheet for your character's voice! They use few-shot learning to show the AI exactly how your character should talk. Include 3-7 quality examples covering different scenarios - greetings, advice-giving, emotional moments. Quality beats quantity here!",
          actions: ["BUILDER_CHAT"],
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
