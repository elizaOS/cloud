/**
 * Render Tracking Utilities
 * 
 * These utilities help track and identify components that render too frequently
 * or have performance issues. Only active in development mode.
 * 
 * IMPORTANT: All hooks follow React's Rules of Hooks - they're always called,
 * but their internal logic is no-op in production for zero overhead.
 */

import { useEffect, useRef } from "react";

// Check once at module load - this enables tree-shaking in production
const isDev = process.env.NODE_ENV === "development";

// Global render tracking state (only created in dev)
const renderCounts = isDev 
  ? new Map<string, { count: number; timestamps: number[] }>()
  : null;

// Configuration
const RENDER_THRESHOLD = 10;
const TIME_WINDOW_MS = 1000;

// Verbosity levels
type LogLevel = "silent" | "warn" | "error" | "verbose";
let logLevel: LogLevel = "error";

/**
 * Set the logging verbosity for render tracking
 */
export function setLogLevel(level: LogLevel): void {
  logLevel = level;
}

/**
 * Hook to track render counts for a component
 * 
 * @param componentName - Name of the component to track
 * @param options - Configuration options
 */
export function useRenderTracking(
  componentName: string,
  options: {
    threshold?: number;
    warnOnly?: boolean;
  } = {}
): void {
  const { threshold = RENDER_THRESHOLD, warnOnly = false } = options;
  
  // Always call hooks unconditionally (React rules)
  const renderCountRef = useRef(0);
  const lastLogRef = useRef<number>(0);

  // Track render in effect to avoid impure function calls during render
  useEffect(() => {
    if (!isDev || !renderCounts) return;
    
    renderCountRef.current += 1;
    const now = Date.now();

    let entry = renderCounts.get(componentName);
    if (!entry) {
      entry = { count: 0, timestamps: [] };
      renderCounts.set(componentName, entry);
    }

    entry.timestamps.push(now);
    entry.count = entry.timestamps.length;
    entry.timestamps = entry.timestamps.filter((t) => now - t < TIME_WINDOW_MS);

    const recentRenders = entry.timestamps.length;

    if (logLevel !== "silent" && recentRenders >= threshold) {
      if (now - lastLogRef.current > 1000) {
        lastLogRef.current = now;
        
        const message = `🔄 [Render Tracking] "${componentName}" rendered ${recentRenders} times in the last ${TIME_WINDOW_MS}ms (threshold: ${threshold})`;
        
        if (warnOnly || logLevel === "warn") {
          console.warn(message);
        } else {
          console.error(message);
        }
      }
    }
  });

  // Always call useEffect unconditionally
  useEffect(() => {
    // Only do work in development
    if (!isDev) return;
    
    if (logLevel === "verbose" && renderCountRef.current === 1) {
      console.log(`📊 [Render Tracking] "${componentName}" mounted`);
    }
    
    return () => {
      if (logLevel === "verbose") {
        console.log(
          `📊 [Render Tracking] "${componentName}" unmounted after ${renderCountRef.current} renders`
        );
      }
    };
  }, [componentName]);
}

/**
 * Hook to track why a component re-rendered (what props changed)
 */
export function useWhyDidUpdate(
  componentName: string,
  props: Record<string, unknown>
): void {
  // Always call hooks unconditionally
  const previousProps = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    // Only do work in development
    if (!isDev || logLevel === "silent") return;
    
    if (previousProps.current) {
      const allKeys = new Set([
        ...Object.keys(previousProps.current),
        ...Object.keys(props),
      ]);

      const changes: Record<string, { from: unknown; to: unknown }> = {};

      allKeys.forEach((key) => {
        if (previousProps.current![key] !== props[key]) {
          changes[key] = {
            from: previousProps.current![key],
            to: props[key],
          };
        }
      });

      if (Object.keys(changes).length > 0 && logLevel === "verbose") {
        console.log(`🔍 [Why Update] "${componentName}" props changed:`, changes);
      }
    }

    previousProps.current = { ...props };
  });
}

/**
 * Hook to measure component render cycle duration
 * 
 * Note: This measures time from effect to effect,
 * which captures the commit phase timing.
 * Returns a getter function to access the duration outside of render.
 */
export function useRenderProfiling(
  componentName: string,
  threshold = 16
): { getRenderDuration: () => number | null } {
  // Always call hooks unconditionally
  const lastDuration = useRef<number | null>(null);
  const renderStartRef = useRef<number>(0);

  useEffect(() => {
    // Only do work in development
    if (!isDev) return;
    
    // Capture start time for next render
    const now = performance.now();
    
    if (renderStartRef.current > 0) {
      // Calculate duration from last render start
      const duration = now - renderStartRef.current;
      lastDuration.current = duration;

      if (logLevel !== "silent" && duration > threshold) {
        console.warn(
          `⏱️ [Render Profiling] "${componentName}" render cycle took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`
        );
      }
    }
    
    renderStartRef.current = now;
  });

  // Return a getter function to access the ref value outside of render
  return { 
    getRenderDuration: () => isDev ? lastDuration.current : null 
  };
}

// Alias for compatibility
export const useRenderTime = useRenderProfiling;

/**
 * Get current render statistics for all tracked components
 */
export function getRenderStats(): Record<string, { count: number; recentRenders: number }> {
  if (!isDev || !renderCounts) {
    return {};
  }

  const now = Date.now();
  const stats: Record<string, { count: number; recentRenders: number }> = {};

  renderCounts.forEach((entry, name) => {
    const recentRenders = entry.timestamps.filter((t) => now - t < TIME_WINDOW_MS).length;
    stats[name] = {
      count: entry.count,
      recentRenders,
    };
  });

  return stats;
}

/**
 * Clear all render tracking data
 */
export function clearRenderStats(): void {
  if (renderCounts) {
    renderCounts.clear();
  }
}

/**
 * Log all render statistics to console as a table
 */
export function logRenderStats(): void {
  const stats = getRenderStats();
  if (Object.keys(stats).length === 0) {
    console.log("📊 [Render Stats] No components tracked yet");
    return;
  }
  console.table(stats);
}

// Make utilities available globally in development
if (typeof window !== "undefined" && isDev) {
  const windowExt = window as Window & { 
    __renderStats__?: typeof getRenderStats;
    __logRenderStats__?: typeof logRenderStats;
    __clearRenderStats__?: typeof clearRenderStats;
    __setRenderLogLevel__?: typeof setLogLevel;
  };
  
  windowExt.__renderStats__ = getRenderStats;
  windowExt.__logRenderStats__ = logRenderStats;
  windowExt.__clearRenderStats__ = clearRenderStats;
  windowExt.__setRenderLogLevel__ = setLogLevel;
}
