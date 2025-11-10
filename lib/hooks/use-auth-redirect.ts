/**
 * Centralized authentication redirect hook
 * Prevents multiple concurrent redirects and login modal triggers
 */

"use client";

import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";

export function useAuthRedirect(options?: {
  redirectTo?: string;
  requireAuth?: boolean;
  delay?: number;
}) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const hasRedirected = useRef(false);
  const isRedirecting = useRef(false);
  const redirectTimeout = useRef<NodeJS.Timeout | null>(null);

  const redirectTo = options?.redirectTo || "/dashboard";
  const requireAuth = options?.requireAuth ?? false;
  const delay = options?.delay ?? 0;

  useEffect(() => {
    if (!ready || hasRedirected.current || isRedirecting.current) {
      return;
    }

    const shouldRedirectToDashboard =
      authenticated && redirectTo === "/dashboard";
    const shouldRedirectToHome = !authenticated && requireAuth;

    if (shouldRedirectToDashboard || shouldRedirectToHome) {
      hasRedirected.current = true;
      isRedirecting.current = true;

      if (redirectTimeout.current) {
        clearTimeout(redirectTimeout.current);
      }

      redirectTimeout.current = setTimeout(() => {
        const destination = shouldRedirectToDashboard ? redirectTo : "/";
        console.log(`[useAuthRedirect] Redirecting to ${destination}`, {
          authenticated,
          requireAuth,
        });

        router.push(destination);

        setTimeout(() => {
          isRedirecting.current = false;
        }, 1000);
      }, delay);
    }

    return () => {
      if (redirectTimeout.current) {
        clearTimeout(redirectTimeout.current);
      }
    };
  }, [ready, authenticated, router, redirectTo, requireAuth, delay]);

  return { ready, authenticated, isRedirecting: isRedirecting.current };
}
