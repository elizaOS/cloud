/**
 * React Render Tracker - Development Only
 *
 * Comprehensive render tracking with automatic profiling.
 * Tracks ALL component renders via React Profiler and warns about issues.
 *
 * Features:
 * - Automatic tracking of all renders (no manual hook needed)
 * - Warns about excessive re-renders
 * - Tracks render duration for performance issues
 * - Auto-logs summaries at sensible intervals
 *
 * CONTROLLED BY ENV: NEXT_PUBLIC_ENABLE_RENDER_TRACKING (default: false)
 * Set to "true" to enable render tracking in development.
 */

import { useRef, useEffect, type ProfilerOnRenderCallback } from "react";

// Feature flag: disabled by default, enable with NEXT_PUBLIC_ENABLE_RENDER_TRACKING=true
export const RENDER_TRACKING_ENABLED =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_ENABLE_RENDER_TRACKING === "true";

interface RenderInfo {
  count: number;
  timestamps: number[];
  totalDuration: number;
  avgDuration: number;
  maxDuration: number;
  lastRenderTime: number;
  props?: Record<string, unknown>;
}

interface GlobalRenderStats {
  totalRenders: number;
  sessionStart: number;
  lastLogTime: number;
  componentStats: Map<string, RenderInfo>;
}

// Global render tracking
const globalStats: GlobalRenderStats = {
  totalRenders: 0,
  sessionStart: Date.now(),
  lastLogTime: Date.now(),
  componentStats: new Map(),
};

// Configuration
const RENDER_WARNING_THRESHOLD = 5; // Warn after 5 renders in window
const RENDER_WINDOW_MS = 1000; // 1 second window
const RAPID_RENDER_THRESHOLD_MS = 50; // Warn if renders are < 50ms apart
const SLOW_RENDER_THRESHOLD_MS = 16; // Warn if render takes > 16ms (drops frame)
const AUTO_LOG_INTERVAL_MS = 30000; // Auto-log every 30 seconds
const INITIAL_LOG_DELAY_MS = 5000; // First log after 5 seconds

/**
 * Track a render from React Profiler
 */
function trackRender(
  id: string,
  phase: "mount" | "update" | "nested-update",
  actualDuration: number,
  _baseDuration: number,
  _startTime: number,
  _commitTime: number,
): void {
  if (!RENDER_TRACKING_ENABLED) return;

  const now = Date.now();
  globalStats.totalRenders += 1;

  // Get or create component info
  if (!globalStats.componentStats.has(id)) {
    globalStats.componentStats.set(id, {
      count: 0,
      timestamps: [],
      totalDuration: 0,
      avgDuration: 0,
      maxDuration: 0,
      lastRenderTime: 0,
    });
  }

  const info = globalStats.componentStats.get(id)!;
  const timeSinceLastRender = now - info.lastRenderTime;

  info.count += 1;
  info.timestamps.push(now);
  info.totalDuration += actualDuration;
  info.avgDuration = info.totalDuration / info.count;
  info.maxDuration = Math.max(info.maxDuration, actualDuration);
  info.lastRenderTime = now;

  // Clean up old timestamps
  info.timestamps = info.timestamps.filter((ts) => now - ts < RENDER_WINDOW_MS);

  // Check for slow renders
  if (actualDuration > SLOW_RENDER_THRESHOLD_MS) {
    console.warn(
      `🐢 [RenderTracker] Slow render in <${id}>`,
      `\n  Duration: ${actualDuration.toFixed(2)}ms (threshold: ${SLOW_RENDER_THRESHOLD_MS}ms)`,
      `\n  Phase: ${phase}`,
      `\n  This may cause dropped frames. Consider:`,
      `\n    - Breaking into smaller components`,
      `\n    - Using React.memo() for expensive subtrees`,
      `\n    - Moving expensive computations to useMemo()`,
    );
  }

  // Check for rapid renders
  if (
    timeSinceLastRender > 0 &&
    timeSinceLastRender < RAPID_RENDER_THRESHOLD_MS
  ) {
    console.warn(
      `⚡ [RenderTracker] Rapid re-render in <${id}>`,
      `\n  Time since last: ${timeSinceLastRender}ms`,
      `\n  This may indicate an infinite loop or cascading state updates.`,
    );
  }

  // Check for excessive renders
  if (info.timestamps.length >= RENDER_WARNING_THRESHOLD) {
    console.warn(
      `🔄 [RenderTracker] Excessive re-renders in <${id}>`,
      `\n  ${info.timestamps.length} renders in ${RENDER_WINDOW_MS}ms`,
      `\n  Total: ${info.count} | Avg duration: ${info.avgDuration.toFixed(2)}ms`,
      `\n  Consider: React.memo(), useMemo, useCallback, or splitting state`,
    );
    // Reset timestamps to avoid spam
    info.timestamps = [];
  }
}

/**
 * React Profiler onRender callback for global tracking
 * Use this with React.Profiler to track all renders automatically
 */
export const onRenderCallback: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  trackRender(id, phase, actualDuration, baseDuration, startTime, commitTime);
};

/**
 * Manual hook for tracking specific components (still useful for detailed props tracking)
 */
export function useRenderTracker(
  componentName: string,
  props?: Record<string, unknown>,
): void {
  const renderCountRef = useRef(0);
  const lastRenderRef = useRef<number>(0);

  useEffect(() => {
    if (!RENDER_TRACKING_ENABLED) return;

    renderCountRef.current += 1;
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderRef.current;
    lastRenderRef.current = now;

    // Track in global stats
    if (!globalStats.componentStats.has(componentName)) {
      globalStats.componentStats.set(componentName, {
        count: 0,
        timestamps: [],
        totalDuration: 0,
        avgDuration: 0,
        maxDuration: 0,
        lastRenderTime: 0,
      });
    }

    const info = globalStats.componentStats.get(componentName)!;
    info.count += 1;
    info.timestamps.push(now);
    info.lastRenderTime = now;
    info.props = props;
    globalStats.totalRenders += 1;

    // Clean up old timestamps
    info.timestamps = info.timestamps.filter(
      (ts) => now - ts < RENDER_WINDOW_MS,
    );

    // Warnings
    if (
      timeSinceLastRender > 0 &&
      timeSinceLastRender < RAPID_RENDER_THRESHOLD_MS
    ) {
      console.warn(
        `⚡ [RenderTracker] Rapid re-render in <${componentName}>`,
        `\n  Time since last: ${timeSinceLastRender}ms`,
        props ? `\n  Props: ${JSON.stringify(props, null, 2)}` : "",
      );
    }

    if (info.timestamps.length >= RENDER_WARNING_THRESHOLD) {
      console.warn(
        `🔄 [RenderTracker] Excessive re-renders in <${componentName}>`,
        `\n  ${info.timestamps.length} renders in ${RENDER_WINDOW_MS}ms`,
        `\n  Total: ${info.count}`,
      );
      info.timestamps = [];
    }
  });
}

/**
 * Track which props changed between renders
 */
export function useWhyDidYouUpdate<T extends Record<string, unknown>>(
  componentName: string,
  props: T,
): void {
  const previousProps = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (!RENDER_TRACKING_ENABLED) return;

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

      if (Object.keys(changes).length > 0) {
        console.log(
          `📝 [WhyDidYouUpdate] <${componentName}> changed:`,
          changes,
        );
      }
    }
    previousProps.current = props;
  });
}

/**
 * Get render statistics
 */
export function getRenderStats(): GlobalRenderStats {
  return {
    ...globalStats,
    componentStats: new Map(globalStats.componentStats),
  };
}

/**
 * Reset render tracking
 */
export function resetRenderStats(): void {
  globalStats.totalRenders = 0;
  globalStats.sessionStart = Date.now();
  globalStats.lastLogTime = Date.now();
  globalStats.componentStats.clear();
}

/**
 * Log render summary to console
 */
export function logRenderSummary(): void {
  if (!RENDER_TRACKING_ENABLED) return;

  const sessionDuration = (
    (Date.now() - globalStats.sessionStart) /
    1000
  ).toFixed(1);
  const sortedByCount = Array.from(globalStats.componentStats.entries()).sort(
    ([, a], [, b]) => b.count - a.count,
  );

  if (sortedByCount.length === 0) {
    console.log("📊 [RenderTracker] No renders tracked yet.");
    return;
  }

  const top10 = sortedByCount.slice(0, 10);
  const slowest = [...sortedByCount]
    .filter(([, info]) => info.avgDuration > 0)
    .sort(([, a], [, b]) => b.avgDuration - a.avgDuration)
    .slice(0, 5);

  console.group(
    `📊 Render Summary (${sessionDuration}s session, ${globalStats.totalRenders} total renders)`,
  );

  console.group("🔝 Most Rendered Components");
  top10.forEach(([name, info], i) => {
    const status = info.count > 50 ? "🔴" : info.count > 20 ? "🟡" : "🟢";
    console.log(`  ${i + 1}. ${status} ${name}: ${info.count} renders`);
  });
  console.groupEnd();

  if (slowest.length > 0 && slowest[0][1].avgDuration > 1) {
    console.group("🐢 Slowest Components (avg render time)");
    slowest.forEach(([name, info]) => {
      if (info.avgDuration > 1) {
        const status =
          info.avgDuration > 16 ? "🔴" : info.avgDuration > 8 ? "🟡" : "🟢";
        console.log(
          `  ${status} ${name}: ${info.avgDuration.toFixed(2)}ms avg, ${info.maxDuration.toFixed(2)}ms max`,
        );
      }
    });
    console.groupEnd();
  }

  console.groupEnd();
  globalStats.lastLogTime = Date.now();
}

/**
 * Check if we should auto-log (called by debug provider)
 */
export function shouldAutoLog(): boolean {
  if (!RENDER_TRACKING_ENABLED) return false;
  return Date.now() - globalStats.lastLogTime >= AUTO_LOG_INTERVAL_MS;
}

/**
 * Get initial log delay
 */
export function getInitialLogDelay(): number {
  return INITIAL_LOG_DELAY_MS;
}

// Expose to window (only when render tracking is enabled)
if (typeof window !== "undefined" && RENDER_TRACKING_ENABLED) {
  const win = window as Window & {
    __renderStats__?: () => GlobalRenderStats;
    __logRenderSummary__?: () => void;
    __resetRenderStats__?: () => void;
  };
  win.__renderStats__ = getRenderStats;
  win.__logRenderSummary__ = logRenderSummary;
  win.__resetRenderStats__ = resetRenderStats;
}
