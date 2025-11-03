"use server";

import { getOrCreateAnonymousUser } from "@/lib/auth-anonymous";
import { cookies } from "next/headers";

const ANON_SESSION_COOKIE = "eliza-anon-session";

/**
 * Server action to get or create anonymous user
 * This is needed because cookie setting can only happen in Server Actions
 */
export async function getOrCreateAnonymousUserAction() {
  const result = await getOrCreateAnonymousUser();
  
  // Set cookie if this is a new session
  if (result.isNew && "sessionToken" in result && "expiresAt" in result) {
    const cookieStore = await cookies();
    cookieStore.set(ANON_SESSION_COOKIE, result.sessionToken as string, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: result.expiresAt as Date,
      path: "/",
    });
  }
  
  return result;
}

