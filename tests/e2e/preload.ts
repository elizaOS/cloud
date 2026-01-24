/**
 * E2E Test Preload - Combined setup
 *
 * Loads both the base test setup and the server auto-start.
 * Single file to work around Bun --config array preload issues.
 */

// Load base test setup (env vars, DB check)
import "../setup";

// Load server auto-start
import "./setup-server";
