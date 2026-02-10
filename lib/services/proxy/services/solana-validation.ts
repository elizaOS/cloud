/**
 * Solana address validation utilities
 * 
 * Solana addresses are base58-encoded public keys (32 bytes).
 * Base58 excludes confusing characters: 0, O, I, l
 * Typical length: 32-44 characters (most commonly 43-44)
 */

export { isValidSolanaAddress } from "./address-validation";

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
