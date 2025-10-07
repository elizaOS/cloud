"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";

const LIGHT_LOGO_URL = "https://raw.githubusercontent.com/elizaOS/brandkit/refs/heads/main/Logos/RGB/Logo_ElizaOS_Black_RGB.svg";
const DARK_LOGO_URL = "https://raw.githubusercontent.com/elizaOS/brandkit/f408fd7d505525033723586791cad03eee8a5f7e/Logos/RGB/Logo_ElizaOS_White_RGB.svg";

/**
 * Custom hook to get the appropriate logo URL based on the current theme.
 * Handles theme loading state to prevent flashing during hydration.
 * 
 * @returns The URL of the logo appropriate for the current theme
 */
export function useThemeLogo() {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isLightMode = mounted && (resolvedTheme === "light" || theme === "light");
  return isLightMode ? LIGHT_LOGO_URL : DARK_LOGO_URL;
}
