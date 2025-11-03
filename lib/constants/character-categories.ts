import type { CategoryId, CategoryInfo } from "@/lib/types/marketplace";

export interface CategoryDefinition {
  id: CategoryId;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export const CHARACTER_CATEGORIES: Record<
  Uppercase<CategoryId>,
  CategoryDefinition
> = {
  ASSISTANT: {
    id: "assistant",
    name: "Assistants",
    description: "Helpful AI assistants for productivity and support",
    icon: "🤖",
    color: "blue",
  },
  ANIME: {
    id: "anime",
    name: "Anime & Manga",
    description: "Characters from anime, manga, and Japanese culture",
    icon: "🎌",
    color: "pink",
  },
  CREATIVE: {
    id: "creative",
    name: "Creativity & Writing",
    description: "Creative partners for writing, brainstorming, and art",
    icon: "✍️",
    color: "purple",
  },
  GAMING: {
    id: "gaming",
    name: "Gaming & RPG",
    description: "Game characters, dungeon masters, and RPG companions",
    icon: "🎮",
    color: "green",
  },
  LEARNING: {
    id: "learning",
    name: "Learning & Education",
    description: "Teachers, tutors, and educational companions",
    icon: "📚",
    color: "orange",
  },
  ENTERTAINMENT: {
    id: "entertainment",
    name: "Entertainment",
    description: "Fun, humor, and entertainment characters",
    icon: "🎭",
    color: "red",
  },
  HISTORY: {
    id: "history",
    name: "Historical Figures",
    description: "Historical personalities and period characters",
    icon: "🏛️",
    color: "amber",
  },
  LIFESTYLE: {
    id: "lifestyle",
    name: "Lifestyle & Wellness",
    description: "Health, fitness, wellness, and lifestyle coaches",
    icon: "🌿",
    color: "teal",
  },
} as const;

export const CATEGORY_ORDER: Array<keyof typeof CHARACTER_CATEGORIES> = [
  "ASSISTANT",
  "ANIME",
  "CREATIVE",
  "GAMING",
  "LEARNING",
  "ENTERTAINMENT",
  "HISTORY",
  "LIFESTYLE",
];

export function getCategoryById(
  id: CategoryId,
): CategoryDefinition | undefined {
  const key = id.toUpperCase() as keyof typeof CHARACTER_CATEGORIES;
  return CHARACTER_CATEGORIES[key];
}

export function getAllCategories(): CategoryDefinition[] {
  return CATEGORY_ORDER.map((key) => CHARACTER_CATEGORIES[key]);
}

export function getCategoryColor(id: CategoryId): string {
  const category = getCategoryById(id);
  return category?.color || "gray";
}

export function getCategoryIcon(id: CategoryId): string {
  const category = getCategoryById(id);
  return category?.icon || "📝";
}
