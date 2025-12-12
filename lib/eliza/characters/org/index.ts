/**
 * Org Agent Characters
 *
 * These characters are designed to work with the cloud's Eliza runtime
 * and use org-tools MCP for core functionality. They replace the standalone
 * the-org agents with cloud-integrated versions.
 *
 * Characters:
 * - Jimmy (Project Manager): Team coordination, check-ins, reports, todos
 * - Eli5 (Community Manager): Community moderation, welcoming, support
 * - Eddy (DevRel): Developer support, documentation, technical guidance
 * - Ruby (Liaison): Cross-platform awareness, community information
 * - Laura (Social Media Manager): Marketing, content creation, messaging
 * - Maya (Growth Manager): SEO, advertising, analytics, growth strategy
 */

export { projectManagerCharacter } from "./project-manager";
export { communityManagerCharacter } from "./community-manager";
export { devRelCharacter } from "./devrel";
export { liaisonCharacter } from "./liaison";
export { socialMediaManagerCharacter } from "./social-media-manager";
export { growthManagerCharacter } from "./growth-manager";

import { projectManagerCharacter } from "./project-manager";
import { communityManagerCharacter } from "./community-manager";
import { devRelCharacter } from "./devrel";
import { liaisonCharacter } from "./liaison";
import { socialMediaManagerCharacter } from "./social-media-manager";
import { growthManagerCharacter } from "./growth-manager";

/**
 * All org characters with their IDs for easy lookup
 */
export const orgCharacters = {
  "org-project-manager": projectManagerCharacter,
  "org-community-manager": communityManagerCharacter,
  "org-devrel": devRelCharacter,
  "org-liaison": liaisonCharacter,
  "org-social-media-manager": socialMediaManagerCharacter,
  "org-growth-manager": growthManagerCharacter,
} as const;

/**
 * Character IDs for org agents
 */
export const ORG_CHARACTER_IDS = Object.keys(orgCharacters) as Array<
  keyof typeof orgCharacters
>;

/**
 * Check if a character ID is an org character
 */
export function isOrgCharacter(characterId: string): boolean {
  return characterId in orgCharacters;
}

/**
 * Get an org character by ID
 */
export function getOrgCharacter(characterId: string) {
  if (isOrgCharacter(characterId)) {
    return orgCharacters[characterId as keyof typeof orgCharacters];
  }
  return null;
}

