/**
 * Solana address validation utilities
 * 
 * Solana addresses are base58-encoded public keys (32 bytes).
 * Base58 excludes confusing characters: 0, O, I, l
 * Typical length: 32-44 characters (most commonly 43-44)
 */

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Validates a Solana address format
 * 
 * @param address - The address string to validate
 * @returns true if valid Solana address format
 */
export function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== "string") {
    return false;
  }

  // Check length first (performance optimization)
  if (address.length < 32 || address.length > 44) {
    return false;
  }

  // Validate base58 format
  return SOLANA_ADDRESS_REGEX.test(address);
}

/**
 * Validates Solana address and throws descriptive error if invalid
 * 
 * @param address - The address to validate
 * @throws Error with user-friendly message if invalid
 */
export function validateSolanaAddress(address: string): void {
  if (!isValidSolanaAddress(address)) {
    throw new Error(
      "Invalid Solana address format. Must be 32-44 base58-encoded characters."
    );
  }
}
