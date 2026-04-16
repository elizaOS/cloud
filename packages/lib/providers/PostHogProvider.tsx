"use client";

import { usePrivy } from "@privy-io/react-auth";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef } from "react";
import {
  getPostHog,
  getSignupMethod,
  identifyUser,
  initPostHog,
  type PrivyUserAuthInfo,
  resetUser,
  trackEvent,
} from "@/lib/analytics/posthog";
import { useSessionAuth } from "@/lib/hooks/use-session-auth";

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
  const { user: privyUser } = usePrivy();
  const { ready, authenticated, authSource, user } = useSessionAuth();
  const pathname = usePathname();
  const identifiedRef = useRef(false);
  const previousAuthState = useRef<boolean | null>(null);

  const authInfo: PrivyUserAuthInfo = useMemo(
    () => ({
      email: privyUser?.email ? { address: privyUser.email.address ?? undefined } : null,
      google: privyUser?.google
        ? {
            email: privyUser.google.email ?? undefined,
            name: privyUser.google.name ?? undefined,
          }
        : null,
      discord: privyUser?.discord
        ? {
            email: privyUser.discord.email ?? undefined,
            username: privyUser.discord.username ?? undefined,
          }
        : null,
      github: privyUser?.github ? { username: privyUser.github.username ?? undefined } : null,
      wallet: privyUser?.wallet ? { address: privyUser.wallet.address ?? undefined } : null,
    }),
    [privyUser],
  );

  const email =
    authSource === "steward"
      ? user && "email" in user && typeof user.email === "string"
        ? user.email
        : undefined
      : (authInfo.email?.address ?? authInfo.google?.email ?? authInfo.discord?.email);
  const name =
    authSource === "steward"
      ? email?.split("@")[0]
      : (authInfo.google?.name ?? authInfo.discord?.username ?? authInfo.github?.username);
  const method = authSource === "steward" ? "email" : getSignupMethod(authInfo);
  const walletAddress = authSource === "steward" ? undefined : privyUser?.wallet?.address;
  const createdAt = authSource === "steward" ? undefined : privyUser?.createdAt?.toISOString();

  useEffect(() => {
    // AbortController cancels in-flight requests on cleanup (logout/unmount)
    const abortController = new AbortController();

    if (!ready) return;

    // Handle logout
    if (previousAuthState.current === true && !authenticated) {
      resetUser();
      identifiedRef.current = false;
      trackEvent("logout_completed");
    }

    if (pathname === "/login") {
      previousAuthState.current = authenticated;
      return () => {
        abortController.abort();
      };
    }

    // Handle login - fetch internal user ID for consistent identification
    if (authenticated && user && !identifiedRef.current) {
      const isFirstLogin = previousAuthState.current === false;

      // Fetch internal user ID from API
      fetch("/api/v1/user", {
        signal: abortController.signal,
        credentials: "include",
        cache: "no-store",
      })
        .then((res) => res.json())
        .then((data) => {
          // identifiedRef prevents duplicate identification
          // AbortController prevents this callback from running after logout
          if (!identifiedRef.current && data.success && data.data?.id) {
            identifyUser(data.data.id, {
              email,
              name,
              wallet_address: walletAddress,
              signup_method: method,
              created_at: createdAt,
            });

            identifiedRef.current = true;

            if (isFirstLogin) {
              trackEvent("login_completed", { method });
            }
          }
        })
        .catch((error) => {
          // Ignore abort errors - expected when component unmounts or user logs out
          if (error instanceof Error && error.name === "AbortError") return;
          console.error("[PostHog] Failed to fetch user ID:", error);
        });
    }

    previousAuthState.current = authenticated;

    // Cleanup: abort any in-flight fetch when effect re-runs or component unmounts
    return () => {
      abortController.abort();
    };
  }, [ready, authenticated, pathname, user, email, name, method, walletAddress, createdAt]);

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

export default PostHogProvider;
