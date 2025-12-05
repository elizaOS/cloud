/**
 * Default Avatar Generation using DiceBear API
 */

export type AvatarStyle =
  | "bottts"
  | "avataaars"
  | "pixel-art"
  | "shapes"
  | "initials"
  | "lorelei"
  | "micah"
  | "fun-emoji";

interface DefaultAvatarOptions {
  style?: AvatarStyle;
  backgroundColor?: string;
}

/**
 * Generate a default avatar URL using DiceBear.
 */
export function generateDefaultAvatarUrl(
  name: string,
  options: DefaultAvatarOptions = {}
): string {
  const { style = "bottts", backgroundColor = "0a0a0a" } = options;
  const seed = encodeURIComponent(name?.trim() || `char-${Date.now()}`);
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}&backgroundColor=${backgroundColor}`;
}

/**
 * Get available avatar styles for the UI
 */
export function getAvailableAvatarStyles(): Array<{ id: AvatarStyle; name: string; description: string }> {
  return [
    { id: "bottts", name: "Robot", description: "Friendly robot avatars" },
    { id: "avataaars", name: "Human", description: "Cartoon human avatars" },
    { id: "pixel-art", name: "Pixel Art", description: "Retro pixel art style" },
    { id: "shapes", name: "Abstract", description: "Geometric shapes" },
  ];
}

/**
 * Check if a URL is a DiceBear avatar
 */
export function isDiceBearAvatar(url: string): boolean {
  return url.includes("api.dicebear.com");
}
