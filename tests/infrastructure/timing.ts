/**
 * Timing Utilities for Test Infrastructure
 *
 * Simple timing utilities for measuring performance in tests.
 */

const timers = new Map<string, number>();

/**
 * Start a named timer
 */
export function startTimer(name: string): void {
  timers.set(name, Date.now());
}

/**
 * End a named timer and return the duration in milliseconds
 */
export function endTimer(name: string): number {
  const startTime = timers.get(name);
  if (!startTime) {
    console.warn(`[Timing] Timer "${name}" was not started`);
    return 0;
  }
  timers.delete(name);
  return Date.now() - startTime;
}

/**
 * Log a set of timings with a label
 */
export function logTimings(label: string, timings: Record<string, number>): void {
  console.log(`\n[Timings] ${label}:`);
  
  const entries = Object.entries(timings).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, ms]) => sum + ms, 0);
  
  for (const [name, ms] of entries) {
    const pct = total > 0 ? ((ms / total) * 100).toFixed(1) : "0.0";
    console.log(`  ${name}: ${ms}ms (${pct}%)`);
  }
  
  console.log(`  TOTAL: ${total}ms\n`);
}

/**
 * Create a scoped timer that auto-logs on completion
 */
export function createScopedTimer(label: string): {
  mark: (name: string) => void;
  end: () => Record<string, number>;
} {
  const timings: Record<string, number> = {};
  let lastMark = Date.now();
  
  return {
    mark(name: string) {
      const now = Date.now();
      timings[name] = now - lastMark;
      lastMark = now;
    },
    end() {
      logTimings(label, timings);
      return timings;
    },
  };
}

export default {
  startTimer,
  endTimer,
  logTimings,
  createScopedTimer,
};
