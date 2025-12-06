/**
 * Why Did You Render Setup
 * 
 * This file sets up the @welldone-software/why-did-you-render library
 * to help identify unnecessary re-renders in development.
 * 
 * IMPORTANT: For WDYR to work properly with Next.js App Router,
 * we need to patch React before it's used. This file should be
 * imported as early as possible in the application lifecycle.
 * 
 * @see https://github.com/welldone-software/why-did-you-render
 */

import type { UpdateInfo } from "@welldone-software/why-did-you-render";
import React from "react";

// Track if WDYR has been initialized
let isInitialized = false;

// Configuration for WDYR
interface WDYRConfig {
  /** Enable/disable WDYR entirely */
  enabled: boolean;
  /** Log even when values are different (verbose mode) */
  logOnDifferentValues: boolean;
  /** Threshold before warning about excessive re-renders */
  renderCountThreshold: number;
  /** Time window in ms for counting re-renders */
  timeWindowMs: number;
}

// Default configuration - can be overridden via window.__WDYR_CONFIG__
const defaultConfig: WDYRConfig = {
  enabled: true,
  logOnDifferentValues: false, // Only log when props are same (true performance issues)
  renderCountThreshold: 10,
  timeWindowMs: 5000,
};

/**
 * Get current WDYR configuration
 */
function getConfig(): WDYRConfig {
  if (typeof window !== "undefined") {
    const windowConfig = (window as Window & { __WDYR_CONFIG__?: Partial<WDYRConfig> }).__WDYR_CONFIG__;
    return { ...defaultConfig, ...windowConfig };
  }
  return defaultConfig;
}

/**
 * Initialize WDYR - must be called before any React rendering
 */
export function initializeWDYR(): void {
  // Only run in development, on client, and once
  if (
    process.env.NODE_ENV !== "development" ||
    typeof window === "undefined" ||
    isInitialized
  ) {
    return;
  }

  const config = getConfig();
  if (!config.enabled) {
    console.log("%c🔍 Why Did You Render disabled via config", "color: #888;");
    return;
  }

  isInitialized = true;

  // Import and initialize synchronously for proper React patching
  // Note: Dynamic import won't patch React properly, but it's the best we can do
  // in Next.js App Router without ejecting webpack config
  import("@welldone-software/why-did-you-render").then((whyDidYouRender) => {
    // Render count tracking
    const renderCounts: Record<string, { count: number; firstRenderTime: number }> = {};

    whyDidYouRender.default(React, {
      // Track all pure components (React.memo, PureComponent)
      trackAllPureComponents: true,
      
      // Track hooks (useCallback, useMemo, etc.)
      trackHooks: true,
      
      // Track extra hooks - empty for now
      trackExtraHooks: [],
      
      // Log when props/state are different (verbose mode)
      logOnDifferentValues: config.logOnDifferentValues,
      
      // Show owner component info
      logOwnerReasons: true,
      
      // Collapse console groups for cleaner output
      collapseGroups: true,
      
      // Custom notifier for excessive re-render detection
      notifier: (info: UpdateInfo) => {
        const componentName = info.displayName || "Unknown";
        const now = Date.now();
        
        // Initialize or update render count
        if (!renderCounts[componentName]) {
          renderCounts[componentName] = { count: 0, firstRenderTime: now };
        }
        
        const entry = renderCounts[componentName];
        
        // Reset if outside time window
        if (now - entry.firstRenderTime > config.timeWindowMs) {
          entry.count = 0;
          entry.firstRenderTime = now;
        }
        
        entry.count += 1;
        
        // Warn on excessive re-renders
        if (entry.count === config.renderCountThreshold) {
          console.error(
            `🚨 [WDYR] "${componentName}" re-rendered ${entry.count} times in ${config.timeWindowMs}ms!`,
            "\n  Reason:", info.reason,
            "\n  This likely indicates a performance issue.",
            "\n  Common causes:",
            "\n    - Inline object/array/function creation in props",
            "\n    - Missing useCallback/useMemo for expensive computations",
            "\n    - State updates in useEffect without proper deps"
          );
        }
      },
      
      // Include all components
      include: [/./],
      
      // Exclude library components we can't control
      exclude: [
        /^Link$/,
        /^Image$/,
        /^Router/,
        /^Head$/,
        /^Script$/,
        /^NextRouter/,
        /^Slot$/,
        /^Portal$/,
        /^Presence$/,
        /^Motion/,
        /^AnimatePresence$/,
        /^ThemeProvider$/,
        /^DevProvider$/,
        /^Providers$/,
      ],
    });
    
    // Store render counts globally for debugging
    (window as Window & { __WDYR_RENDER_COUNTS__?: typeof renderCounts }).__WDYR_RENDER_COUNTS__ = renderCounts;
    
    console.log(
      "%c🔍 Why Did You Render initialized",
      "color: #61dafb; font-weight: bold;",
      "\n  Tracking unnecessary re-renders.",
      "\n  Configure via window.__WDYR_CONFIG__ = { enabled, logOnDifferentValues, renderCountThreshold, timeWindowMs }"
    );
  }).catch((err) => {
    console.warn("[WDYR] Failed to initialize:", err);
  });
}

// Auto-initialize disabled - WDYR causes hook order issues with React 18+ strict mode
// To re-enable, uncomment the following:
// if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
//   initializeWDYR();
// }

export {};
