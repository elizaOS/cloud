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
import { MESSAGE_EXAMPLES_FORMAT_INSTRUCTIONS } from "../providers/character-guide";

/**
 * PROPOSE_CHARACTER_CHANGES Action
 * 
 * Conversational proposal of character improvements.
 * NO JSON output - just friendly explanation of what would be changed and why.
 * References best practices and research.
 * 
 * Uses reasoning trace from planning phase to inform recommendations.
 */

// System prompt for propose action
const proposeSystemPrompt = `# Character Design Expert (BUILD MODE)

You are a Character Design Expert helping users refine their AI character.

**Your Role:**
Help users improve their AI character using research-based best practices:
- EmotionPrompt techniques for engaging personalities
- Narrative bio construction for causal logic
- Strategic trait and topic selection
- Style directives (positive + negative constraints)
- Few-shot learning with message examples

**Current Context:**
- Character being edited: {{agentName}}
- Mode: BUILD (character design and iteration)
- Available fields: system, bio, adjectives, topics, style, messageExamples

## Best Practices Guide:
{{characterGuide}}

# Instructions
<instructions>
You are analyzing a user's request to modify their character. Propose improvements conversationally - explain what you'd change and why, referencing best practices and research. Be friendly, educational, and specific. NO JSON output.
</instructions>

# Output Format:

CRITICAL: You MUST wrap your entire response in the following XML structure. Do not omit any tags under any circumstances:

<response>
  <thought>Your internal reasoning about the recommendations</thought>
  <text>Your natural, conversational explanation of proposed changes goes here</text>
</response>

REQUIREMENTS:
- The <response> tag MUST wrap everything
- The <thought> tag is REQUIRED - include your reasoning process
- The <text> tag is REQUIRED - include your full conversational explanation inside
- Do not output anything outside these XML tags
- Always close all tags properly
- Your entire conversational response explaining the proposed changes goes inside the <text> tags`;

// Template for propose action
const proposeTemplate = `
## Current Character:
{{agentName}}

## Current Character JSON:
{{currentCharacter}}

# Conversation Context:
{{conversationLogWithAgentThoughts}}
`;
export const proposeCharacterChangesAction = {
  name: "PROPOSE_CHARACTER_CHANGES",
  description:
    "User needs guidance on what to update in their character. Use when user requests modifications but needs help understanding what should change: 'make it more funny', 'add traits', 'improve the bio', etc. Provides conversational explanation with best practices. Does NOT save changes - only proposes them.",
  validate: async (_runtime: IAgentRuntime, _message: Memory, state?: State) => {
      return false;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: Record<string, unknown>,
    callback: HandlerCallback,
  ): Promise<void> => {
    try {
      logger.info("[PROPOSE_CHARACTER_CHANGES] 🎨 Generating conversational proposal");

      state = await runtime.composeState(message, [
        "SHORT_TERM_MEMORY",
        "CURRENT_CHARACTER",
        "CHARACTER_GUIDE",
      ]);

      const originalSystemPrompt = runtime.character.system;

      // Compose system prompt
      const systemPrompt = composePromptFromState({
        state,
        template: proposeSystemPrompt,
      });

      runtime.character.system = systemPrompt;

      // Compose prompt with character context and reasoning
      // Then append messageExamples format (preserves {{user1}} placeholder)
      const composedPrompt = composePromptFromState({
        state,
        template: proposeTemplate,
      });
      const prompt = composedPrompt + MESSAGE_EXAMPLES_FORMAT_INSTRUCTIONS;

      const response = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });

      logger.debug("*** RAW LLM RESPONSE ***\n", response);
  
      const parsedResponse = parseKeyValueXml(response);

      // Restore original system prompt
      runtime.character.system = originalSystemPrompt;

      if (!parsedResponse?.text) {
        logger.warn("[PROPOSE_CHARACTER_CHANGES] Failed to parse response - no text field in parsed XML");
        await callback({ 
          text: `Failed to parse LLM response: No 'text' field found in XML output. Raw response may be malformed.`,
          error: true,
        });
        return;
      }

      logger.info("[PROPOSE_CHARACTER_CHANGES] ✅ Proposal generated successfully");

      // Callback to frontend with the conversational proposal
      await callback({
        text: parsedResponse.text,
        metadata: {
          action: "PROPOSE_CHARACTER_CHANGES",
          thought: parsedResponse.thought,
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error(
        {
          message: err.message,
          stack: err.stack,
        },
        "[PROPOSE_CHARACTER_CHANGES] Exception during proposal"
      );
      await callback({ 
        text: `Exception during proposal generation: ${err.message}`,
        error: true,
      });
    }
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "Make it more funny",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I'd make your character funnier by updating the system prompt to emphasize playful energy...",
          actions: ["PROPOSE_CHARACTER_CHANGES"],
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Add flirty personality",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "To add a flirty personality, I'd update the adjectives to include 'playful', 'teasing', and 'charming'...",
          actions: ["PROPOSE_CHARACTER_CHANGES"],
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Improve the system prompt",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I'd improve the system prompt by adding EmotionPrompt stakes and clearer role definition...",
          actions: ["PROPOSE_CHARACTER_CHANGES"],
        },
      },
    ],
  ] as ActionExample[][],
} as Action;

