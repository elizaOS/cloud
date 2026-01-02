/**
 * Pricing and configuration constants
 * This file contains only constants with no server-side dependencies,
 * making it safe to import from client components.
 */

/**
 * API key prefix length for display purposes.
 */
export const API_KEY_PREFIX_LENGTH = 12;

/**
 * Service costs in USD (stored as decimal values).
 * These are actual dollar amounts that will be deducted from credit_balance.
 */
export const IMAGE_GENERATION_COST = 0.01; // $0.01 per image
export const VIDEO_GENERATION_COST = 0.05; // $0.05 per video
export const VIDEO_GENERATION_FALLBACK_COST = 0.025; // $0.025 per fallback video

/**
 * Monthly credit cap in USD.
 */
export const MONTHLY_CREDIT_CAP = 2.4;

/**
 * Voice cloning costs in USD.
 */
export const VOICE_CLONE_INSTANT_COST = 0.5; // $0.50 (50 credits) - 1-3 min audio, ~30s processing
export const VOICE_CLONE_PROFESSIONAL_COST = 2.0; // $2.00 - 30+ min audio, 30-60min processing
export const VOICE_SAMPLE_UPLOAD_COST = 0.05; // $0.05 - Additional samples to existing voice
export const VOICE_UPDATE_COST = 0.1; // $0.10 - Update voice metadata/settings
export const CUSTOM_VOICE_TTS_MARKUP = 1.1; // 10% markup for using custom cloned voices

/**
 * Text-to-Speech generation costs in USD.
 */
export const TTS_GENERATION_COST = 0.5; // $0.50 per TTS generation (same as instant voice clone)
