"use client";

import { useEffect, useRef, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  initPostHog,
  identifyUser,
  resetUser,
  trackEvent,
  getPostHog,
  type AuthMethod,
} from "@/lib/analytics/posthog";

function PageViewTracker(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const posthog = getPostHog();
    if (!posthog) return;

    const queryString = searchParams?.toString();
    const url = queryString ? `${pathname}?${queryString}` : pathname;

    posthog.capture("$pageview", {
      $current_url: url,
      page_path: pathname,
    });
  }, [pathname, searchParams]);

  return null;
}

function UserIdentifier(): null {
  const { ready, authenticated, user } = usePrivy();
  const identifiedRef = useRef(false);
  const previousAuthState = useRef<boolean | null>(null);
  const fetchingUserRef = useRef(false);
  // Track current authenticated state for async callback checks
  const authenticatedRef = useRef(authenticated);

  useEffect(() => {
    // Update ref at start of each effect run so async callbacks can check current state
    authenticatedRef.current = authenticated;

    if (!ready) return;

    // Handle logout
    if (previousAuthState.current === true && !authenticated) {
      resetUser();
      identifiedRef.current = false;
      fetchingUserRef.current = false;
      trackEvent("logout_completed");
    }

    // Handle login - fetch internal user ID for consistent identification
    if (authenticated && user && !identifiedRef.current && !fetchingUserRef.current) {
      fetchingUserRef.current = true;

      const email = user.email?.address || user.google?.email || user.discord?.email;
      const name = user.google?.name || user.discord?.username || user.github?.username;
      const method = getSignupMethod(user);
      // Capture auth state at fetch start to prevent race condition with logout
      const wasLoggedOutBefore = previousAuthState.current === false;

      // Fetch internal user ID from API
      fetch("/api/v1/user")
        .then((res) => res.json())
        .then((data) => {
          // Verify user is still authenticated before identifying
          // (prevents corrupted state if user logged out during fetch)
          if (!identifiedRef.current && authenticatedRef.current && data.success && data.data?.id) {
            // Use internal UUID for consistent tracking
            identifyUser(data.data.id, {
              email,
              name,
              wallet_address: user.wallet?.address,
              signup_method: method,
              created_at: user.createdAt?.toISOString(),
            });

            identifiedRef.current = true;

            // Use captured state instead of current ref to avoid race condition
            if (wasLoggedOutBefore) {
              trackEvent("login_completed", { method });
            }
          }
        })
        .catch((error) => {
          console.error("[PostHog] Failed to fetch user ID:", error);
        })
        .finally(() => {
          fetchingUserRef.current = false;
        });
    }

    previousAuthState.current = authenticated;
  }, [ready, authenticated, user]);

  return null;
}

interface PostHogProviderProps {
  children: React.ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps): React.ReactElement {
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      <UserIdentifier />
      {children}
    </>
  );
}

interface PrivyUserAuth {
  email?: { address: string } | null;
  google?: { email: string } | null;
  discord?: { email: string } | null;
  github?: { username: string } | null;
  wallet?: { address: string } | null;
}

function getSignupMethod(user: PrivyUserAuth): AuthMethod {
  if (user.google) return "google";
  if (user.discord) return "discord";
  if (user.github) return "github";
  if (user.wallet && !user.email) return "wallet";
  return "email";
}

export default PostHogProvider;
