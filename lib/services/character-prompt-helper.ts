/**
 * Character Prompt Helper
 *
 * Extracts character personality traits for use in social media post generation.
 * Provides a simplified interface for getting character voice/style without
 * needing the full ElizaOS runtime.
 */

import { charactersService } from "./characters/characters";
import { logger } from "@/lib/utils/logger";

export interface CharacterPromptContext {
  name: string;
  bio: string;
  adjectives: string[];
  topics: string[];
  postExamples: string[];
  postStyle: string[];
  allStyle: string[];
}

/**
 * Get character personality context for social media post generation.
 * Returns null if character not found.
 */
export async function getCharacterPromptContext(
  characterId: string
): Promise<CharacterPromptContext | null> {
  const character = await charactersService.getById(characterId);

  if (!character) {
    logger.warn("[CharacterPromptHelper] Character not found", { characterId });
    return null;
  }

  const bio = Array.isArray(character.bio)
    ? character.bio.join(" ")
    : character.bio || "";

  const style = character.style || {};
  const postStyle = style.post || [];
  const allStyle = style.all || [];

  const context = {
    name: character.name,
    bio,
    adjectives: character.adjectives || [],
    topics: character.topics || [],
    postExamples: character.post_examples || [],
    postStyle,
    allStyle,
  };

  // Log detailed character context for debugging
  logger.info("[CharacterPromptHelper] Loaded character context", {
    characterId,
    name: context.name,
    bioLength: context.bio.length,
    adjectiveCount: context.adjectives.length,
    topicCount: context.topics.length,
    postExampleCount: context.postExamples.length,
    styleCount: context.postStyle.length + context.allStyle.length,
  });

  return context;
}

/**
 * Build a system prompt section for character-voiced content generation.
 * Used by Twitter, Discord, Telegram automation services.
 */
export function buildCharacterSystemPrompt(
  context: CharacterPromptContext
): string {
  const parts: string[] = [];

  parts.push(`You are ${context.name}.`);

  if (context.bio) {
    parts.push(`About you: ${context.bio}`);
  }

  if (context.adjectives.length > 0) {
    const selectedAdjectives = context.adjectives
      .sort(() => 0.5 - Math.random())
      .slice(0, 5);
    parts.push(`Your personality: ${selectedAdjectives.join(", ")}`);
  }

  if (context.topics.length > 0) {
    const selectedTopics = context.topics
      .sort(() => 0.5 - Math.random())
      .slice(0, 5);
    parts.push(`Topics you enjoy: ${selectedTopics.join(", ")}`);
  }

  const styleGuidelines = [...context.postStyle, ...context.allStyle];
  if (styleGuidelines.length > 0) {
    parts.push(`Your writing style: ${styleGuidelines.slice(0, 5).join("; ")}`);
  }

  if (context.postExamples.length > 0) {
    const examples = context.postExamples
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);
    parts.push(
      `Example posts you've written:\n${examples.map((ex) => `- "${ex}"`).join("\n")}`
    );
  }

  const prompt = parts.join("\n\n");

  // Log the generated prompt for debugging
  logger.debug("[CharacterPromptHelper] Built character prompt", {
    name: context.name,
    promptLength: prompt.length,
    promptPreview: prompt.substring(0, 200) + "...",
  });

  return prompt;
}
