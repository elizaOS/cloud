/**
 * Conditional logging utility
 * Only logs in development environment to reduce noise in production
 */

const isDev = process.env.NODE_ENV === "development";

export const logger = {
  /**
   * Debug-level logs - only shown in development
   */
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.log(...args);
    }
  },

  /**
   * Info-level logs - only shown in development
   */
  info: (...args: unknown[]) => {
    if (isDev) {
      console.info(...args);
    }
  },

  /**
   * Error-level logs - always shown (critical for production monitoring)
   */
  error: (...args: unknown[]) => {
    console.error(...args);
  },

  /**
   * Warning-level logs - always shown
   */
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
};
