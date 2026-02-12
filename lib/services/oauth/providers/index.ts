/**
 * OAuth Flow Handlers
 *
 * Generic handlers for different OAuth types.
 */

export {
  initiateOAuth2,
  handleOAuth2Callback,
  refreshOAuth2Token,
  type InitiateOAuth2Result,
  type OAuth2CallbackResult,
} from "./oauth2";

// Bluesky AT Protocol (custom OAuth — DPoP, PAR, PKCE, private_key_jwt)
export {
  initiateBlueskyAuth,
  handleBlueskyCallback,
  getBlueskyAgent,
  buildClientMetadata as buildBlueskyClientMetadata,
} from "./bluesky-at";
