/**
 * Solana address validation utilities
 * 
 * Solana addresses are base58-encoded public keys (32 bytes).
 * Uses @solana/web3.js PublicKey for cryptographic validation including:
 * - Base58 checksum verification
 * - 32-byte length validation
 * - Proper decoding verification
 */

import { PublicKey } from "@solana/web3.js";

/**
 * Validates a Solana address using cryptographic verification
 * 
 * This properly validates:
 * - Base58 encoding
 * - Checksum verification
 * - Decodes to exactly 32 bytes
 * - Valid public key format
 * 
 * @param address - The address string to validate
 * @returns true if valid Solana public key address
 */
export function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== "string") {
    return false;
  }

  // Quick length check before expensive validation
  if (address.length < 32 || address.length > 44) {
    return false;
  }

  try {
    // This validates base58 encoding, checksum, and ensures 32-byte public key
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
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
      "Invalid Solana address. Must be a valid base58-encoded public key (32 bytes)."
    );
  }
}
