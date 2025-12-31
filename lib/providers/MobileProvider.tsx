/**
 * Mobile Provider
 *
 * Wraps the application with mobile-specific functionality when running
 * in the Tauri mobile app. This includes:
 * - Deep link handling
 * - Platform detection
 * - Safe area insets
 * - Mobile-specific context
 */

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import { useDeepLink } from "@/lib/hooks/use-deep-link";
import {
  getPlatformConfig,
  type Platform,
  getUserAgentInfo,
} from "@/lib/utils/platform";

/**
 * Mobile context value
 */
interface MobileContextValue {
  /** Current platform */
  platform: Platform;
  /** Whether running in Tauri */
  isTauri: boolean;
  /** Whether running as mobile app */
  isMobile: boolean;
  /** Whether touch is supported */
  isTouch: boolean;
  /** Whether IAP is supported */
  supportsIAP: boolean;
  /** Whether the provider is initialized */
  isReady: boolean;
  /** Safe area insets for notched devices */
  safeAreaInsets: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

const MobileContext = createContext<MobileContextValue | null>(null);

/**
 * Mobile Provider Component
 */
export function MobileProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [config, setConfig] = useState<ReturnType<
    typeof getPlatformConfig
  > | null>(null);
  const [safeAreaInsets, setSafeAreaInsets] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  // Set up deep link handling
  useDeepLink();

  // Initialize platform detection
  useEffect(() => {
    const platformConfig = getPlatformConfig();

    // Use queueMicrotask to avoid cascading render warnings
    queueMicrotask(() => {
      setConfig(platformConfig);
    });

    // Set up safe area CSS variables
    if (typeof window !== "undefined" && platformConfig.isMobile) {
      const style = document.documentElement.style;

      // These CSS variables are set by the viewport-fit=cover meta tag
      // and env() safe-area-inset-* properties
      style.setProperty("--sat", "env(safe-area-inset-top, 0px)");
      style.setProperty("--sar", "env(safe-area-inset-right, 0px)");
      style.setProperty("--sab", "env(safe-area-inset-bottom, 0px)");
      style.setProperty("--sal", "env(safe-area-inset-left, 0px)");

      // Read computed values after a brief delay
      setTimeout(() => {
        const computedStyle = getComputedStyle(document.documentElement);
        setSafeAreaInsets({
          top: parseInt(computedStyle.getPropertyValue("--sat") || "0", 10),
          right: parseInt(computedStyle.getPropertyValue("--sar") || "0", 10),
          bottom: parseInt(computedStyle.getPropertyValue("--sab") || "0", 10),
          left: parseInt(computedStyle.getPropertyValue("--sal") || "0", 10),
        });
      }, 100);
    }

    queueMicrotask(() => {
      setIsReady(true);
    });
  }, []);

  // Set up status bar styling for mobile
  useEffect(() => {
    if (!config?.isMobile || typeof document === "undefined") return;

    // Add viewport-fit=cover for safe areas
    let viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      const content = viewportMeta.getAttribute("content") || "";
      if (!content.includes("viewport-fit=cover")) {
        viewportMeta.setAttribute("content", `${content}, viewport-fit=cover`);
      }
    }

    // Add theme-color meta for status bar
    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement("meta");
      themeMeta.setAttribute("name", "theme-color");
      document.head.appendChild(themeMeta);
    }
    themeMeta.setAttribute("content", "#000000");

    // Add apple-specific meta tags
    if (config.platform === "ios") {
      const appleMeta = document.createElement("meta");
      appleMeta.setAttribute("name", "apple-mobile-web-app-status-bar-style");
      appleMeta.setAttribute("content", "black-translucent");
      document.head.appendChild(appleMeta);
    }
  }, [config]);

  const value: MobileContextValue = useMemo(
    () => ({
      platform: config?.platform || "unknown",
      isTauri: config?.isTauri || false,
      isMobile: config?.isMobile || false,
      isTouch: config?.isTouch || false,
      supportsIAP: config?.supportsIAP || false,
      isReady,
      safeAreaInsets,
    }),
    [config, isReady, safeAreaInsets],
  );

  return (
    <MobileContext.Provider value={value}>{children}</MobileContext.Provider>
  );
}

/**
 * Hook to access mobile context
 */
export function useMobile(): MobileContextValue {
  const context = useContext(MobileContext);

  if (!context) {
    // Return sensible defaults when used outside provider
    return {
      platform: "web",
      isTauri: false,
      isMobile: false,
      isTouch: false,
      supportsIAP: false,
      isReady: false,
      safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    };
  }

  return context;
}

/**
 * HOC to conditionally render based on platform
 */
export function withMobileOnly<P extends object>(
  Component: React.ComponentType<P>,
): React.FC<P> {
  return function MobileOnlyComponent(props: P) {
    const { isMobile } = useMobile();

    if (!isMobile) {
      return null;
    }

    return <Component {...props} />;
  };
}

/**
 * HOC to conditionally render on web only
 */
export function withWebOnly<P extends object>(
  Component: React.ComponentType<P>,
): React.FC<P> {
  return function WebOnlyComponent(props: P) {
    const { isMobile, isTauri } = useMobile();

    if (isMobile || isTauri) {
      return null;
    }

    return <Component {...props} />;
  };
}

export type { MobileContextValue };
