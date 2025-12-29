/**
 * Anonymous session actions.
 *
 * This module re-exports client API functions for anonymous session operations.
 * Previously used "use server" directives, now uses client API routes.
 */

import { anonymousSessionApi } from "@/lib/api/client";

/**
 * Gets or creates an anonymous user session.
 *
 * Note: Session creation is handled via redirect to /api/auth/create-anonymous-session.
 * This function retrieves existing session data.
 */
export async function getOrCreateAnonymousUserAction() {
  // Get session token from cookie (browser-side only)
  const getCookieValue = (name: string): string | null => {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
    return match ? match[2] : null;
  };

  const sessionToken = getCookieValue("eliza-anon-session");

  if (!sessionToken) {
    // No session exists - redirect to create one
    return {
      user: null,
      session: null,
      isNew: true,
      sessionToken: null,
      expiresAt: null,
      createUrl: anonymousSessionApi.createUrl("/"),
    };
  }

  const response = await anonymousSessionApi.get(sessionToken);

  return {
    user: { id: response.session.id },
    session: response.session,
    isNew: response.session.message_count === 0,
    sessionToken,
    expiresAt: response.session.expires_at,
  };
}
