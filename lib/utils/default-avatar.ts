/**
 * Default Avatar Selection from Built-in Avatars
 *
 * Uses a curated set of character avatars instead of external services.
 * All avatars are stored locally in /public/avatars/
 */

/**
 * Available character avatars for random selection when creating new characters.
 * These are fun, personality-driven avatars that give new characters visual identity.
 */
export const CHARACTER_AVATARS = [
  "/avatars/codementor.png",
  "/avatars/comedybot.png",
  "/avatars/creativespark.png",
  "/avatars/gamemaster.png",
  "/avatars/historyscholar.png",
  "/avatars/mysticoracle.png",
] as const;

/**
 * The default fallback avatar used when a character has no avatar set.
 * This is the Eliza mascot avatar.
 */
export const DEFAULT_AVATAR = "/avatars/eliza.png";

/**
 * All available avatars including special ones (for UI selection purposes)
 */
export const ALL_AVATARS = [
  ...CHARACTER_AVATARS,
  "/avatars/eliza.png",
  "/avatars/amara.png",
  "/avatars/luna.png",
  "/avatars/prof_ada.png",
  "/avatars/voiceai.png",
  "/avatars/wellnesscoach.png",
  "/avatars/edad.png",
] as const;

export type AvatarStyle = "random" | "eliza";

/**
 * Generate a default avatar URL for a new character.
 * Randomly selects from the curated CHARACTER_AVATARS list.
 *
 * @param name - The character name (used for deterministic selection if needed)
 * @param options - Optional configuration
 * @returns A local avatar URL from /public/avatars/
 */
export function generateDefaultAvatarUrl(
  name?: string,
  _options: { style?: AvatarStyle } = {},
): string {
  // Use the name to create a deterministic but seemingly random selection
  // This ensures the same name always gets the same avatar
  if (name) {
    const hash = simpleHash(name);
    const index = hash % CHARACTER_AVATARS.length;
    return CHARACTER_AVATARS[index];
  }

  // Truly random selection if no name provided
  const randomIndex = Math.floor(Math.random() * CHARACTER_AVATARS.length);
  return CHARACTER_AVATARS[randomIndex];
}

/**
 * Simple hash function for deterministic avatar selection
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Get a fallback avatar URL for characters without an avatar.
 * Returns the Eliza mascot avatar.
 */
export function getFallbackAvatarUrl(): string {
  return DEFAULT_AVATAR;
}

/**
 * Check if a URL is one of our built-in avatars.
 * Used to determine if Next.js Image optimization should be applied.
 */
export function isBuiltInAvatar(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    url.startsWith("/avatars/") ||
    ALL_AVATARS.some((avatar) => url.includes(avatar))
  );
}

/**
 * Get available avatar options for UI selection
 */
export function getAvailableAvatarStyles(): Array<{
  id: string;
  name: string;
  url: string;
}> {
  return [
    { id: "codementor", name: "Code Mentor", url: "/avatars/codementor.png" },
    { id: "comedybot", name: "Comedy Bot", url: "/avatars/comedybot.png" },
    {
      id: "creativespark",
      name: "Creative Spark",
      url: "/avatars/creativespark.png",
    },
    { id: "gamemaster", name: "Game Master", url: "/avatars/gamemaster.png" },
    {
      id: "historyscholar",
      name: "History Scholar",
      url: "/avatars/historyscholar.png",
    },
    {
      id: "mysticoracle",
      name: "Mystic Oracle",
      url: "/avatars/mysticoracle.png",
    },
    { id: "eliza", name: "Eliza", url: "/avatars/eliza.png" },
    { id: "amara", name: "Amara", url: "/avatars/amara.png" },
    { id: "luna", name: "Luna", url: "/avatars/luna.png" },
    { id: "prof_ada", name: "Prof Ada", url: "/avatars/prof_ada.png" },
  ];
}

/**
 * Ensure a character has an avatar URL, using the fallback if needed.
 *
 * @param avatarUrl - The character's current avatar URL (may be null/undefined/empty)
 * @returns A valid avatar URL (either the original or the fallback)
 */
export function ensureAvatarUrl(avatarUrl: string | null | undefined): string {
  if (avatarUrl && avatarUrl.trim() !== "") {
    return avatarUrl;
  }
  return DEFAULT_AVATAR;
}
