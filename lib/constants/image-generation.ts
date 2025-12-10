/**
 * Shared constants for image generation across miniapp and main app
 */

export const IMAGE_GENERATION_VIBES = [
  "flirty",
  "shy",
  "bold",
  "spicy",
  "romantic",
  "playful",
  "mysterious",
  "intellectual",
] as const;

export type ImageGenerationVibe = (typeof IMAGE_GENERATION_VIBES)[number];

export const DEFAULT_VIBE: ImageGenerationVibe = "playful";
