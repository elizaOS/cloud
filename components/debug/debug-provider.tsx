"use client";

/**
 * Debug Provider - Development-Only Performance Monitoring
 * 
 * Automatically tracks and logs:
 * - React component renders (frequency, duration)
 * - API calls (duplicates, slow responses, errors)
 * 
 * Auto-logs summaries at sensible times:
 * - After initial page load (5s)
 * - Every 30 seconds if there's activity
 * - On route changes
 * - Before page unload
 */

import { useEffect, useRef, useCallback, Profiler, type ReactNode, type ProfilerOnRenderCallback } from "react";
import { usePathname } from "next/navigation";

// Only load in development
const isDev = process.env.NODE_ENV === "development";

// Lazy load debug tools to avoid bundling in production
let renderTracker: {
  logRenderSummary: () => void;
  shouldAutoLog: () => boolean;
  getInitialLogDelay: () => number;
  onRenderCallback: ProfilerOnRenderCallback;
} | null = null;

let apiTracker: {
  logApiSummary: () => void;
  shouldAutoLog: () => boolean;
} | null = null;

if (isDev && typeof window !== "undefined") {
  renderTracker = require("@/lib/debug/render-tracker");
  apiTracker = require("@/lib/debug/api-tracker");
}

// Track if we've logged initially
let hasLoggedInitial = false;
let lastRouteLogTime = 0;

function logSummary(reason: string): void {
  if (!isDev) return;
  
  console.group(`📊 Performance Summary (${reason})`);
  renderTracker?.logRenderSummary();
  apiTracker?.logApiSummary();
  console.groupEnd();
}

export function DebugProvider({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialLogRef = useRef<NodeJS.Timeout | null>(null);

  // Log on route change (debounced)
  useEffect(() => {
    if (!isDev) return;

    const now = Date.now();
    // Don't log too frequently on route changes
    if (now - lastRouteLogTime > 5000) {
      lastRouteLogTime = now;
      // Small delay to let the new page render
      setTimeout(() => {
        logSummary(`navigated to ${pathname}`);
      }, 1000);
    }
  }, [pathname]);

  // Initial setup and auto-logging
  useEffect(() => {
    if (!isDev) return;

    // Log after initial page load
    if (!hasLoggedInitial) {
      const delay = renderTracker?.getInitialLogDelay() || 5000;
      initialLogRef.current = setTimeout(() => {
        hasLoggedInitial = true;
        logSummary("initial page load");
      }, delay);
    }

    // Set up periodic logging (every 30s)
    intervalRef.current = setInterval(() => {
      const shouldLogRender = renderTracker?.shouldAutoLog() ?? false;
      const shouldLogApi = apiTracker?.shouldAutoLog() ?? false;
      
      if (shouldLogRender || shouldLogApi) {
        logSummary("periodic check");
      }
    }, 30000);

    // Log on page unload
    const handleBeforeUnload = () => {
      logSummary("page unload");
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Log on visibility change (when user comes back to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const shouldLog = (renderTracker?.shouldAutoLog() ?? false) || 
                         (apiTracker?.shouldAutoLog() ?? false);
        if (shouldLog) {
          logSummary("tab focused");
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Log startup message
    console.log(
      "%c🛠️ Debug Mode Active",
      "color: #10b981; font-weight: bold; font-size: 14px;",
      "\n\nAuto-logging enabled. Manual commands:",
      "\n  window.__logRenderSummary__() - Render stats",
      "\n  window.__logApiSummary__() - API stats",
      "\n  window.__resetRenderStats__() - Reset render tracking",
      "\n  window.__resetApiStats__() - Reset API tracking"
    );

    return () => {
      if (initialLogRef.current) clearTimeout(initialLogRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Wrap children in Profiler for automatic render tracking
  const handleRender: ProfilerOnRenderCallback = useCallback(
    (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      renderTracker?.onRenderCallback(
        id,
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime
      );
    },
    []
  );

  if (!isDev) {
    if (children) return children;
    return null;
  }

  // Wrap in Profiler to track all renders
  return (
    <Profiler id="App" onRender={handleRender}>
      {children}
    </Profiler>
  );
}

// No-op for production
export function DebugProviderNoop({ children }: { children?: ReactNode }) {
  if (children) return children;
  return null;
}

// Smart export
const Provider = isDev ? DebugProvider : DebugProviderNoop;
export default Provider;
