/**
 * Miniapp Auth Sessions Service
 * 
 * Business logic for managing miniapp authentication sessions.
 * Handles the pass-through auth flow where:
 * 1. Miniapp creates a session and redirects to Cloud
 * 2. User logs in via Privy on Cloud
 * 3. Cloud generates an auth token and redirects back
 * 4. Miniapp retrieves the token and uses it for API calls
 */

import { randomBytes, createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { miniappAuthSessionsRepository } from "@/db/repositories/miniapp-auth-sessions";
import { logger } from "@/lib/utils/logger";

// Session expiry time (10 minutes for auth flow, token valid for 30 days)
const SESSION_EXPIRY_MINUTES = 10;
const TOKEN_EXPIRY_DAYS = 30;

class MiniappAuthSessionsService {
  /**
   * Create a new auth session
   * Called by miniapp when user clicks login
   */
  async createSession(callbackUrl: string, appId?: string) {
    const sessionId = nanoid(32);
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000);

    logger.info("[Miniapp Auth] Creating session", { sessionId: sessionId.slice(0, 8), callbackUrl });

    const session = await miniappAuthSessionsRepository.create({
      session_id: sessionId,
      callback_url: callbackUrl,
      app_id: appId,
      expires_at: expiresAt,
      status: "pending",
    });

    return {
      sessionId: session.session_id,
      expiresAt: session.expires_at,
    };
  }

  /**
   * Get an active session (for validation)
   */
  async getActiveSession(sessionId: string) {
    return miniappAuthSessionsRepository.getActiveSession(sessionId);
  }

  /**
   * Complete authentication after user logs in via Privy
   * Generates an auth token for the miniapp to use
   */
  async completeAuthentication(
    sessionId: string,
    userId: string,
    organizationId: string
  ) {
    // Generate a secure auth token
    const authToken = `miniapp_${randomBytes(32).toString("hex")}`;
    const authTokenHash = createHash("sha256").update(authToken).digest("hex");

    logger.info("[Miniapp Auth] Completing authentication", {
      sessionId: sessionId.slice(0, 8),
      userId,
      organizationId,
    });

    const session = await miniappAuthSessionsRepository.markAuthenticated(
      sessionId,
      userId,
      organizationId,
      authToken,
      authTokenHash
    );

    if (!session) {
      throw new Error("Invalid or expired session");
    }

    // Update expiry for the token (30 days from now)
    const tokenExpiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    return {
      callbackUrl: session.callback_url,
      authToken,
      expiresAt: tokenExpiresAt,
    };
  }

  /**
   * Get the auth token for a completed session (one-time retrieval)
   * Called by miniapp after redirect back
   */
  async getAuthToken(sessionId: string) {
    const result = await miniappAuthSessionsRepository.getAndClearAuthToken(sessionId);

    if (!result) {
      logger.warn("[Miniapp Auth] Auth token not found or already retrieved", {
        sessionId: sessionId.slice(0, 8),
      });
      return null;
    }

    logger.info("[Miniapp Auth] Auth token retrieved", {
      sessionId: sessionId.slice(0, 8),
      userId: result.userId,
    });

    return result;
  }

  /**
   * Verify an auth token (for API authentication)
   * Returns user info if token is valid
   */
  async verifyToken(authToken: string) {
    const authTokenHash = createHash("sha256").update(authToken).digest("hex");
    return miniappAuthSessionsRepository.verifyAuthToken(authTokenHash);
  }

  /**
   * Get session status (for polling)
   */
  async getSessionStatus(sessionId: string) {
    const session = await miniappAuthSessionsRepository.getBySessionId(sessionId);

    if (!session) {
      return { status: "not_found" as const };
    }

    if (session.expires_at < new Date()) {
      return { status: "expired" as const };
    }

    return {
      status: session.status as "pending" | "authenticated" | "used",
      callbackUrl: session.callback_url,
    };
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpired() {
    const deleted = await miniappAuthSessionsRepository.deleteExpired();
    if (deleted > 0) {
      logger.info("[Miniapp Auth] Cleaned up expired sessions", { count: deleted });
    }
    return deleted;
  }
}

export const miniappAuthSessionsService = new MiniappAuthSessionsService();

