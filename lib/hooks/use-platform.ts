"use client";

import { useState, useEffect } from "react";

interface PlatformInfo {
  os: string;
  arch: string;
  is_mobile: boolean;
  is_ios: boolean;
  is_android: boolean;
}

interface UsePlatformResult {
  isTauri: boolean;
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isLoading: boolean;
  platformInfo: PlatformInfo | null;
}

/**
 * Hook to detect if running in Tauri and get platform info
 *
 * Usage:
 * ```tsx
 * const { isTauri, isMobile, isIOS } = usePlatform();
 *
 * if (isMobile) {
 *   return <MobileBillingCard />;
 * }
 * ```
 */
export function usePlatform(): UsePlatformResult {
  const [isTauri, setIsTauri] = useState(false);
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function detectPlatform() {
      // Check if Tauri is available
      if (typeof window !== "undefined" && "__TAURI__" in window) {
        setIsTauri(true);

        // Dynamically import Tauri API to avoid SSR issues
        const { invoke } = await import("@tauri-apps/api/core");

        const info = await invoke<PlatformInfo>("get_platform_info");
        setPlatformInfo(info);
      }
      setIsLoading(false);
    }

    detectPlatform();
  }, []);

  return {
    isTauri,
    isMobile: platformInfo?.is_mobile ?? false,
    isIOS: platformInfo?.is_ios ?? false,
    isAndroid: platformInfo?.is_android ?? false,
    isLoading,
    platformInfo,
  };
}

/**
 * Check if we're in Tauri environment (sync, for SSR safety)
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}
