/**
 * Application Startup Configuration
 * Run validation and initialization tasks when the app starts
 */

import {
  requireValidEnvironment,
  logConfigurationStatus,
} from "./env-validator";

let initialized = false;

/**
 * Initialize application on startup
 * Called automatically on first request in production
 */
export function initializeApplication(): void {
  // Only run once
  if (initialized) {
    return;
  }

  console.log("🚀 Initializing ElizaOS Cloud V2...");
  console.log("");

  try {
    // Validate environment variables
    requireValidEnvironment();

    // Log feature configuration status
    logConfigurationStatus();

    initialized = true;
    console.log("✅ Application initialized successfully");
    console.log("");
  } catch (error) {
    console.error("❌ Application initialization failed:");
    console.error(error);
    console.error("");

    // In production, we want to fail fast
    if (process.env.NODE_ENV === "production") {
      console.error("Cannot start application with invalid configuration");
      process.exit(1);
    } else {
      console.warn(
        "⚠️  Running in development mode with invalid configuration",
      );
      console.warn("Some features may not work correctly");
      console.warn("");
    }
  }
}

/**
 * Check if application is initialized
 */
export function isInitialized(): boolean {
  return initialized;
}
