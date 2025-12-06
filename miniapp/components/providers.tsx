"use client";

import { ThemeProvider } from "@/components/theme-provider";

/**
 * Providers for the miniapp
 * 
 * Note: We don't use Privy directly in the miniapp.
 * Instead, we use token-based auth via pass-through to Eliza Cloud.
 * This avoids needing to register miniapp domains with Privy.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
