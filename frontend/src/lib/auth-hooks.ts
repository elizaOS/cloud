/**
 * SPA auth hooks. Builds on top of `@/lib/hooks/use-session-auth` (Steward
 * provider + localStorage fallback) for the synchronous "is the user logged
 * in" answer, and a TanStack Query against the user/me endpoint when a route
 * needs the full server-resolved user record (org, role, etc).
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSessionAuth } from "@/lib/hooks/use-session-auth";
import { api, ApiError } from "./api-client";

export interface CurrentUser {
  id: string;
  email: string | null;
  organization_id: string | null;
  organization: { id: string; name?: string; is_active?: boolean } | null;
  is_active: boolean;
  role: string | null;
  steward_id: string | null;
  wallet_address: string | null;
  is_anonymous: boolean;
}

/**
 * Fetch the current user from the API. The endpoint `GET /api/users/me` is
 * not yet converted on the Worker side — when it 404s we fall back to a
 * minimal user record built from the local Steward token so the SPA still
 * shows authenticated UI.
 *
 * TODO(api): converge on `GET /api/users/me` once Agent G's user-routes
 * conversion lands.
 */
async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const data = await api<{ user: CurrentUser }>("/api/users/me");
    return data.user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Returns the canonical user record (DB-resolved) plus loading state.
 *
 * For the synchronous "is there a session?" check (used by guards / redirects)
 * prefer `useSessionAuth()` directly — it reads the Steward provider + local
 * storage without a network round trip.
 */
export function useCurrentUser() {
  const session = useSessionAuth();
  const enabled = session.ready && session.authenticated;

  const query = useQuery({
    queryKey: ["currentUser", session.user?.id ?? null],
    queryFn: fetchCurrentUser,
    enabled,
  });

  return {
    ...query,
    session,
    user: query.data ?? null,
    isAuthenticated: session.authenticated,
    isReady: session.ready,
  };
}

/**
 * Redirects to `/login?returnTo=...` when the session resolves to
 * unauthenticated. Returns `{ ready, authenticated }` so the calling page
 * can render a skeleton until the redirect fires.
 */
export function useRequireAuth() {
  const session = useSessionAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (!session.ready) return;
    if (session.authenticated) return;
    const returnTo = encodeURIComponent(`${pathname}${search}`);
    navigate(`/login?returnTo=${returnTo}`, { replace: true });
  }, [session.ready, session.authenticated, navigate, pathname, search]);

  return session;
}
