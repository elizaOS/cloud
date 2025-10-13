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
 * Credit Costs (in credits, not dollars)
 */
export const IMAGE_GENERATION_COST = 100;
export const VIDEO_GENERATION_COST = 500;
export const VIDEO_GENERATION_FALLBACK_COST = 250;

/**
 * Credit Limits
 */
export const MONTHLY_CREDIT_CAP = 240;
