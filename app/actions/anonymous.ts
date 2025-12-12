"use server";

import { getOrCreateSessionUser } from "@/lib/session";

/**
 * Gets or creates an anonymous user session.
 * The session module handles cookie management automatically.
 *
 * @returns The session user with metadata.
 */
export async function getOrCreateAnonymousUserAction() {
  const sessionUser = await getOrCreateSessionUser();

  return {
    user: sessionUser.user,
    session: sessionUser.anonymousSession,
    isNew: sessionUser.messageCount === 0,
    sessionToken: sessionUser.sessionToken,
    expiresAt: sessionUser.metadata.expiresAt,
  };
}
