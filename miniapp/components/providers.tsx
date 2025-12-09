"use client";

import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/theme-provider";
import { DevProvider } from "@/lib/dev/dev-provider";

/**
 * Providers for the miniapp
 * 
 * Note: We don't use Privy directly in the miniapp.
 * Instead, we use token-based auth via pass-through to Eliza Cloud.
 * This avoids needing to register miniapp domains with Privy.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {/* DevProvider initializes why-did-you-render and render tracking in development */}
      <DevProvider>{children}</DevProvider>
      <Toaster richColors position="top-center" />
    </ThemeProvider>
  );
}
