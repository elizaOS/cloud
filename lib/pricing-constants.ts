/**
 * Pricing and configuration constants
 * This file contains only constants with no server-side dependencies,
 * making it safe to import from client components.
 */

/**
 * API Key Configuration
 */
export const API_KEY_PREFIX_LENGTH = 12;

/**
 * Service Costs (in USD, where 1 credit = $1.00)
 */
export const IMAGE_GENERATION_COST = 1.0;
export const VIDEO_GENERATION_COST = 5.0;
export const VIDEO_GENERATION_FALLBACK_COST = 2.5;

/**
 * Credit Limits (in USD)
 */
export const MONTHLY_CREDIT_CAP = 2.4;
