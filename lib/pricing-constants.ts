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

/**
 * Voice Cloning Costs (in credits)
 */
export const VOICE_CLONE_INSTANT_COST = 500; // 1-3 min audio, ~30s processing
export const VOICE_CLONE_PROFESSIONAL_COST = 5000; // 30+ min audio, async processing
export const VOICE_SAMPLE_UPLOAD_COST = 10; // Additional samples to existing voice
export const VOICE_UPDATE_COST = 50; // Update voice metadata/settings
export const CUSTOM_VOICE_TTS_MARKUP = 1.1; // 10% markup for using custom cloned voices
