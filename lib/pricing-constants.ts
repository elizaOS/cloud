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
 * Credit Limits
 */
// Monthly render capacity cap (for UI display purposes in video generation)
// This tracks number of renders, not USD amount
export const MONTHLY_CREDIT_CAP = 240;

/**
 * Initial Credit Balance (stored as integer in DB where 1 credit = $1.00)
 * Amount given to new users when they sign up: 5 credits = $5.00 USD
 */
export const INITIAL_CREDIT_BALANCE = 5;
/**
 * Voice Cloning Costs (in credits where 1 credit = $1.00)
 */
export const VOICE_CLONE_INSTANT_COST = 5; // $5.00 - 1-3 min audio, ~30s processing
export const VOICE_CLONE_PROFESSIONAL_COST = 50; // $50.00 - 30+ min audio, 30-60min processing
export const VOICE_SAMPLE_UPLOAD_COST = 0.1; // $0.10 - Additional samples to existing voice
export const VOICE_UPDATE_COST = 0.5; // $0.50 - Update voice metadata/settings
export const CUSTOM_VOICE_TTS_MARKUP = 1.1; // 10% markup for using custom cloned voices
