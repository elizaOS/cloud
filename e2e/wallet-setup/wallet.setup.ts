import { defineWalletSetup } from "@synthetixio/synpress";
import "dotenv/config";

/**
 * Wallet Setup for E2E Tests
 *
 * This setup file configures MetaMask for testing wallet-based authentication.
 * It uses environment variables for sensitive data (seed phrase, password).
 *
 * Required environment variables:
 * - TEST_WALLET_SEED_PHRASE: 12-word mnemonic seed phrase for test wallet
 * - TEST_WALLET_PASSWORD: Password for the MetaMask wallet (min 8 characters)
 *
 * SECURITY NOTE: Never use a seed phrase with real funds for testing.
 * Generate a new seed phrase specifically for testing purposes.
 */

// Test wallet credentials from environment variables
// Falls back to a deterministic test seed phrase (DO NOT use in production)
const SEED_PHRASE =
  process.env.TEST_WALLET_SEED_PHRASE ??
  "test test test test test test test test test test test junk";

const PASSWORD = process.env.TEST_WALLET_PASSWORD ?? "TestPassword123!";

export default defineWalletSetup(PASSWORD, async (context, walletPage) => {
  // The wallet setup will be handled by Synpress automatically
  // This callback receives the context and walletPage for custom setup if needed
  console.log("[Wallet Setup] MetaMask wallet setup initiated");
  
  // Note: The actual wallet import is handled by the defineWalletSetup function
  // which uses the password provided and sets up the MetaMask extension
});

// Export credentials for use in tests
export { SEED_PHRASE, PASSWORD };
