/**
 * Template Character Loader
 * Loads character templates from JSON files in lib/characters/templates/
 * Auto-creates characters in database when users interact with them
 */

import emberTemplate from "./templates/ember.json";
import ziloTemplate from "./templates/zilo.json";
import pixelTemplate from "./templates/pixel.json";
import lunaTemplate from "./templates/luna.json";
import codeMentorTemplate from "./templates/code-mentor.json";
import creativeSparkTemplate from "./templates/creative-spark.json";
import type { ExtendedCharacter } from "@/lib/types/my-agents";

// All available template characters
export const TEMPLATE_CHARACTERS: Record<string, ExtendedCharacter> = {
  "template-ember": emberTemplate as ExtendedCharacter,
  "template-zilo": ziloTemplate as ExtendedCharacter,
  "template-pixel": pixelTemplate as ExtendedCharacter,
  "template-luna": lunaTemplate as ExtendedCharacter,
  "template-code-mentor": codeMentorTemplate as ExtendedCharacter,
  "template-creative-spark": creativeSparkTemplate as ExtendedCharacter,
};

/**
 * Get all template characters as an array (for display in UI)
 */
export function getAllTemplates(): ExtendedCharacter[] {
  return Object.values(TEMPLATE_CHARACTERS);
}

/**
 * Get a specific template by ID
 */
export function getTemplate(id: string): ExtendedCharacter | null {
  return TEMPLATE_CHARACTERS[id] || null;
}

/**
 * Check if a character ID is a template
 */
export function isTemplateCharacter(characterId: string): boolean {
  return characterId.startsWith("template-");
}

/**
 * Convert template to database format (for auto-creation)
 */
export function templateToDbFormat(template: ExtendedCharacter, userId: string, organizationId: string) {
  return {
    organization_id: organizationId,
    user_id: userId,
    name: template.name,
    username: template.username ?? null,
    system: template.system ?? null,
    bio: template.bio,
    message_examples: (template.messageExamples ?? []) as Record<string, unknown>[][],
    post_examples: template.postExamples ?? [],
    topics: template.topics ?? [],
    adjectives: template.adjectives ?? [],
    knowledge: template.knowledge ?? [],
    plugins: template.plugins ?? [],
    settings: template.settings ?? {},
    secrets: template.secrets ?? {},
    style: template.style ?? {},
    character_data: template as unknown as Record<string, unknown>,
    is_template: true,
    is_public: true,
    avatar_url: template.avatarUrl,
    category: template.category,
    tags: template.tags ?? [],
    featured: template.featured ?? false,
    view_count: 0,
    interaction_count: 0,
    popularity_score: template.featured ? 9000 : 1000,
  };
}

