/**
 * Theme Configuration
 *
 * Centralized theme tokens for the miniapp.
 * Change this file to rebrand the entire application.
 *
 * Usage:
 * 1. Import `activeTheme` to access current theme values
 * 2. CSS variables are set in globals.css based on these values
 * 3. Use Tailwind classes like `bg-brand`, `text-brand-foreground`, etc.
 */

export interface ThemeColors {
  brand: {
    DEFAULT: string;
    foreground: string;
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
  };
  accent: {
    DEFAULT: string;
    foreground: string;
    400: string;
    500: string;
    600: string;
  };
}

export interface ThemeConfig {
  name: string;
  colors: {
    light: ThemeColors;
    dark: ThemeColors;
  };
  gradients: {
    primary: string;
    primaryHover: string;
    subtle: string;
    subtleHover: string;
  };
}

/**
 * FriendAI / Create a Character Theme
 * Pink primary with purple accent
 */
export const friendAITheme: ThemeConfig = {
  name: "friendai",
  colors: {
    light: {
      brand: {
        DEFAULT: "oklch(66.5% 0.1804 47.04)",
        foreground: "oklch(100% 0 0)",
        50: "oklch(97% 0.02 350)",
        100: "oklch(94% 0.04 350)",
        200: "oklch(88% 0.08 350)",
        300: "oklch(80% 0.12 350)",
        400: "oklch(70% 0.16 350)",
        500: "oklch(63% 0.2 350)",
        600: "oklch(55% 0.2 350)",
        700: "oklch(45% 0.18 350)",
      },
      accent: {
        DEFAULT: "oklch(55% 0.2 300)",
        foreground: "oklch(100% 0 0)",
        400: "oklch(65% 0.2 300)",
        500: "oklch(55% 0.2 300)",
        600: "oklch(45% 0.2 300)",
      },
    },
    dark: {
      brand: {
        DEFAULT: "oklch(70% 0.16 350)",
        foreground: "oklch(100% 0 0)",
        50: "oklch(20% 0.02 350)",
        100: "oklch(25% 0.04 350)",
        200: "oklch(30% 0.06 350)",
        300: "oklch(40% 0.1 350)",
        400: "oklch(55% 0.14 350)",
        500: "oklch(70% 0.16 350)",
        600: "oklch(75% 0.14 350)",
        700: "oklch(80% 0.12 350)",
      },
      accent: {
        DEFAULT: "oklch(65% 0.2 300)",
        foreground: "oklch(100% 0 0)",
        400: "oklch(70% 0.18 300)",
        500: "oklch(65% 0.2 300)",
        600: "oklch(55% 0.2 300)",
      },
    },
  },
  gradients: {
    primary: "from-brand to-brand-600",
    primaryHover: "from-brand-400 to-brand",
    subtle: "from-brand/20 to-accent-brand/20",
    subtleHover: "from-brand/30 to-accent-brand/30",
  },
};

/**
 * Clone Ur Crush Theme
 * Red/rose primary with warm accent
 */
export const cloneUrCrushTheme: ThemeConfig = {
  name: "cloneurcrush",
  colors: {
    light: {
      brand: {
        DEFAULT: "oklch(60% 0.22 25)",
        foreground: "oklch(100% 0 0)",
        50: "oklch(97% 0.02 25)",
        100: "oklch(94% 0.05 25)",
        200: "oklch(88% 0.1 25)",
        300: "oklch(78% 0.15 25)",
        400: "oklch(68% 0.2 25)",
        500: "oklch(60% 0.22 25)",
        600: "oklch(52% 0.22 25)",
        700: "oklch(42% 0.2 25)",
      },
      accent: {
        DEFAULT: "oklch(65% 0.18 45)",
        foreground: "oklch(100% 0 0)",
        400: "oklch(72% 0.16 45)",
        500: "oklch(65% 0.18 45)",
        600: "oklch(55% 0.18 45)",
      },
    },
    dark: {
      brand: {
        DEFAULT: "oklch(68% 0.2 25)",
        foreground: "oklch(100% 0 0)",
        50: "oklch(18% 0.02 25)",
        100: "oklch(22% 0.04 25)",
        200: "oklch(28% 0.06 25)",
        300: "oklch(38% 0.1 25)",
        400: "oklch(52% 0.16 25)",
        500: "oklch(68% 0.2 25)",
        600: "oklch(74% 0.18 25)",
        700: "oklch(80% 0.14 25)",
      },
      accent: {
        DEFAULT: "oklch(70% 0.16 45)",
        foreground: "oklch(100% 0 0)",
        400: "oklch(75% 0.14 45)",
        500: "oklch(70% 0.16 45)",
        600: "oklch(60% 0.16 45)",
      },
    },
  },
  gradients: {
    primary: "from-brand to-brand-600",
    primaryHover: "from-brand-400 to-brand",
    subtle: "from-brand/20 to-accent-brand/20",
    subtleHover: "from-brand/30 to-accent-brand/30",
  },
};

/**
 * Active theme - change this to switch themes
 * This is the single point of configuration for theming
 */
export const activeTheme: ThemeConfig = friendAITheme;

/**
 * All available themes for potential runtime switching
 */
export const themes = {
  friendai: friendAITheme,
  cloneurcrush: cloneUrCrushTheme,
} as const;

export type ThemeName = keyof typeof themes;
