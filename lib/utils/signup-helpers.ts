
/**
 * Shared signup utilities used by both SIWE and Privy authentication flows.
 * 
 * IMPORTANT: Keep these functions in sync across all auth paths. Changes here
 * affect both SIWE-created and Privy-created accounts.
 */

export const DEFAULT_INITIAL_CREDITS = 5.0;

export function getInitialCredits(): number {
  const envValue = process.env.INITIAL_FREE_CREDITS;
  if (envValue) {
    const parsed = parseFloat(envValue);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return DEFAULT_INITIAL_CREDITS;
}

export function generateSlugFromWallet(walletAddress: string): string {
  const shortAddress = walletAddress.substring(0, 8);
  const sanitized = shortAddress.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const random = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now().toString(36).slice(-4);
  return `wallet-${sanitized}-${timestamp}${random}`;
}
