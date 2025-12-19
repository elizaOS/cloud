/**
 * Deep Link Hook
 *
 * Handles deep links in the Tauri mobile app for:
 * - OAuth callbacks (Privy authentication)
 * - Billing success redirects
 * - App-specific deep links
 */

"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { isMobileApp } from "@/lib/api/mobile-client";
import { logger } from "@/lib/utils/logger";

/**
 * Deep link event data
 */
interface DeepLinkEvent {
  url: string;
  path: string;
  params: Record<string, string>;
}

/**
 * Deep link handler callback
 */
type DeepLinkHandler = (event: DeepLinkEvent) => void;

/**
 * Parse a deep link URL into components
 */
function parseDeepLink(urlString: string): DeepLinkEvent {
  const url = new URL(urlString);

  // Handle elizacloud:// scheme
  let path = url.pathname;
  if (url.protocol === "elizacloud:") {
    // elizacloud://auth/callback -> /auth/callback
    path = `/${url.host}${url.pathname}`.replace(/\/+/g, "/");
  }

  // Parse query parameters
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  return {
    url: urlString,
    path,
    params,
  };
}

/**
 * Check if Tauri listen is available
 */
async function getTauriListen(): Promise<
  | ((
      event: string,
      handler: (e: { payload: string }) => void,
    ) => Promise<() => void>)
  | null
> {
  if (typeof window === "undefined") return null;

  // @ts-expect-error - Tauri types not available at compile time
  if (window.__TAURI__?.event?.listen) {
    // @ts-expect-error - Tauri types
    return window.__TAURI__.event.listen;
  }

  // @ts-expect-error - Tauri types
  if (window.__TAURI_INTERNALS__?.event?.listen) {
    // @ts-expect-error - Tauri types
    return window.__TAURI_INTERNALS__.event.listen;
  }

  return null;
}

/**
 * Hook for handling deep links
 *
 * @param handlers - Optional map of path patterns to handlers
 */
export function useDeepLink(handlers?: Record<string, DeepLinkHandler>): void {
  const router = useRouter();
  const handlersRef = useRef(handlers);

  // Update ref in effect to avoid updating during render
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const handleDeepLink = useCallback(
    (urlString: string) => {
      const event = parseDeepLink(urlString);

      // Check for custom handlers
      const customHandlers = handlersRef.current;
      if (customHandlers) {
        for (const [pattern, handler] of Object.entries(customHandlers)) {
          if (event.path.startsWith(pattern) || event.path.includes(pattern)) {
            handler(event);
            return;
          }
        }
      }

      // Default handling: navigate to the path
      if (event.path && event.path !== "/") {
        const queryString = Object.entries(event.params)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join("&");

        const fullPath = queryString
          ? `${event.path}?${queryString}`
          : event.path;
        router.push(fullPath);
      }
    },
    [router],
  );

  useEffect(() => {
    if (!isMobileApp()) return;

    let unlisten: (() => void) | null = null;

    const setup = async () => {
      const listen = await getTauriListen();
      if (!listen) return;

      // Listen for auth callbacks
      const unlistenAuth = await listen(
        "auth-callback",
        (event: { payload: string }) => {
          handleDeepLink(event.payload);
        },
      );

      // Listen for billing success
      const unlistenBilling = await listen(
        "billing-success",
        (event: { payload: string }) => {
          handleDeepLink(event.payload);
        },
      );

      // Listen for generic deep links
      const unlistenGeneric = await listen(
        "deep-link",
        (event: { payload: string }) => {
          handleDeepLink(event.payload);
        },
      );

      unlisten = () => {
        unlistenAuth();
        unlistenBilling();
        unlistenGeneric();
      };
    };

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, [handleDeepLink]);
}

/**
 * Hook specifically for OAuth callback handling
 */
export function useAuthDeepLink(
  onCallback?: (params: Record<string, string>) => void,
): void {
  useDeepLink({
    "/auth/callback": (event) => {
      if (onCallback) {
        onCallback(event.params);
      } else {
        // Default: redirect to the callback page
        const queryString = Object.entries(event.params)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join("&");

        window.location.href = `/auth/callback?${queryString}`;
      }
    },
  });
}

/**
 * Hook for billing-related deep links
 */
export function useBillingDeepLink(onSuccess?: () => void): void {
  useDeepLink({
    "/billing/success": () => {
      if (onSuccess) {
        onSuccess();
      }
    },
  });
}

export type { DeepLinkEvent, DeepLinkHandler };
