/**
 * Privy Mobile Configuration
 * 
 * Mobile-specific Privy configuration for Tauri apps.
 * Handles deep link redirects and platform-specific auth methods.
 */

import { isMobileApp, isIOS, isAndroid } from "@/lib/api/mobile-client";
import type { PrivyClientConfig } from "@privy-io/react-auth";

/**
 * Deep link scheme for the app
 */
export const DEEP_LINK_SCHEME = "elizacloud";

/**
 * OAuth redirect URI for mobile
 * Uses custom URL scheme that Tauri handles
 */
export const MOBILE_REDIRECT_URI = `${DEEP_LINK_SCHEME}://auth/callback`;

/**
 * Web redirect URI
 */
export const WEB_REDIRECT_URI = typeof window !== "undefined" 
  ? `${window.location.origin}/auth/callback`
  : "http://localhost:3000/auth/callback";

/**
 * Get the appropriate redirect URI based on platform
 */
export function getRedirectUri(): string {
  return isMobileApp() ? MOBILE_REDIRECT_URI : WEB_REDIRECT_URI;
}

/**
 * Login methods available on each platform
 * 
 * Mobile: Limited to methods that work well in WebView
 * - wallet: Works via WalletConnect deep links
 * - email: Native email input, no redirect needed
 * - Social logins may have issues in WebView, so we disable them by default
 * 
 * Web: Full set of login methods
 */
export type LoginMethod = "wallet" | "email" | "google" | "discord" | "github";

export const MOBILE_LOGIN_METHODS: LoginMethod[] = [
  "wallet",
  "email",
];

export const WEB_LOGIN_METHODS: LoginMethod[] = [
  "wallet", 
  "email", 
  "google", 
  "discord", 
  "github",
];

/**
 * Get login methods for current platform
 */
export function getLoginMethods(): LoginMethod[] {
  return isMobileApp() ? MOBILE_LOGIN_METHODS : WEB_LOGIN_METHODS;
}

/**
 * Get platform-specific Privy configuration
 */
export function getPrivyMobileConfig(): Partial<PrivyClientConfig> {
  const isMobile = isMobileApp();
  const loginMethods = getLoginMethods();
  
  return {
    loginMethods: loginMethods as PrivyClientConfig["loginMethods"],
    
    embeddedWallets: {
      ethereum: {
        createOnLogin: "users-without-wallets",
      },
      solana: {
        createOnLogin: "users-without-wallets",
      },
    },
    
    appearance: {
      walletChainType: "ethereum-and-solana",
      theme: "dark",
      accentColor: "#FF5800", // Eliza Cloud orange
      // Mobile-specific appearance settings
      showWalletLoginFirst: isMobile, // Show wallet first on mobile
    },
    
    // Mobile-specific external wallet config
    externalWallets: isMobile ? {
      // On mobile, external wallets connect via deep links
      ethereum: {
        enabled: true,
      },
      solana: {
        enabled: true,
      },
    } : undefined,
    
    // Legal requirements
    legal: {
      privacyPolicyUrl: "https://elizacloud.ai/privacy-policy",
      termsAndConditionsUrl: "https://elizacloud.ai/terms-of-service",
    },
  };
}

/**
 * Check if we're in a WebView (Tauri or native)
 */
export function isWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  
  const userAgent = navigator.userAgent.toLowerCase();
  
  // Check for common WebView indicators
  return (
    userAgent.includes("wv") || // Android WebView
    userAgent.includes("webview") ||
    (isIOS() && !userAgent.includes("safari")) || // iOS WebView (not Safari)
    isMobileApp() // Tauri
  );
}

/**
 * Handle OAuth callback in mobile app
 * Called when returning from external auth provider
 */
export function handleMobileOAuthCallback(url: string): void {
  if (!isMobileApp()) return;
  
  console.log("[Privy Mobile] OAuth callback:", url);
  
  // The Tauri app should have handled this via deep links
  // This function can be used for additional processing if needed
  
  // Dispatch event that Privy can listen to
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("privy-oauth-callback", { 
      detail: { url } 
    }));
  }
}

/**
 * Get WalletConnect project ID
 */
export function getWalletConnectProjectId(): string {
  return process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
}

/**
 * Platform-specific settings for debugging
 */
export function getPlatformDebugInfo(): Record<string, unknown> {
  return {
    isMobileApp: isMobileApp(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    isWebView: isWebView(),
    loginMethods: getLoginMethods(),
    redirectUri: getRedirectUri(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
  };
}

