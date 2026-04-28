"use client";

import { BrandButton, Input } from "@elizaos/cloud-ui";
import { useLogin, useLoginWithEmail, useLoginWithOAuth, usePrivy } from "@privy-io/react-auth";
import { ArrowLeft, Chrome, Github, Loader2, Mail, Wallet } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  OAUTH_LOGIN_PENDING_STORAGE_KEY,
  OAUTH_LOGIN_RETURN_TO_STORAGE_KEY,
  resolveLoginReturnTo,
} from "./login-return-to";

// Discord SVG Icon Component
const DiscordIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

const SIGNUP_ATTRIBUTION_STORAGE_KEYS = {
  affiliate: "pending_affiliate_code",
  referral: "pending_referral_code",
} as const;
const POST_LOGIN_SESSION_SYNC_DELAYS_MS = [250, 500, 1000, 1500, 2000] as const;

function isLegacyAffiliateCode(code: string | null): boolean {
  return !!code && /^AFF-[A-Z0-9]+$/i.test(code.trim());
}

function getPendingSignupAttribution(searchParams: {
  get(name: string): string | null;
  has(name: string): boolean;
}) {
  const hasOAuthState = searchParams.has("state") || searchParams.has("privy_oauth_state");
  const affiliateCode = searchParams.get("affiliate");
  const referralCode = searchParams.get("ref") || searchParams.get("referral_code");
  const legacyCode = searchParams.get("code");

  return {
    affiliateCode:
      affiliateCode ||
      (!hasOAuthState && isLegacyAffiliateCode(legacyCode)
        ? (legacyCode?.trim().toUpperCase() ?? null)
        : null),
    referralCode: referralCode ? referralCode.trim().toUpperCase() : null,
  };
}

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export default function PrivyLoginSection() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { login } = useLogin();
  const { sendCode, loginWithCode, state: emailState } = useLoginWithEmail();
  const { initOAuth } = useLoginWithOAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [loadingButton, setLoadingButton] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isProcessingOAuth, setIsProcessingOAuth] = useState(() => {
    if (typeof window === "undefined") return false;
    const urlParams = new URLSearchParams(window.location.search);
    const hasOAuthParams =
      urlParams.has("privy_oauth_code") ||
      urlParams.has("privy_oauth_state") ||
      (urlParams.has("code") && (urlParams.has("state") || urlParams.has("privy_oauth_state")));
    const sessionFlag = sessionStorage.getItem(OAUTH_LOGIN_PENDING_STORAGE_KEY);
    return hasOAuthParams || sessionFlag === "true";
  });

  const isSignupIntent = searchParams.get("intent") === "signup";
  const isAuthenticated = authenticated;
  const isAuthReady = ready;

  const loginInProgressRef = useRef(false);
  const lastLoginAttemptRef = useRef<number>(0);
  const postLoginProcessingRef = useRef(false);

  useEffect(() => {
    const { affiliateCode, referralCode } = getPendingSignupAttribution(searchParams);

    if (affiliateCode) {
      sessionStorage.setItem(SIGNUP_ATTRIBUTION_STORAGE_KEYS.affiliate, affiliateCode);
    }

    if (referralCode) {
      sessionStorage.setItem(SIGNUP_ATTRIBUTION_STORAGE_KEYS.referral, referralCode);
    }
  }, [searchParams]);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!isAuthReady || !isAuthenticated || postLoginProcessingRef.current) {
      return;
    }

    postLoginProcessingRef.current = true;
    let cancelled = false;
    const pendingOAuthReturnTo =
      typeof window !== "undefined" &&
      sessionStorage.getItem(OAUTH_LOGIN_PENDING_STORAGE_KEY) === "true"
        ? sessionStorage.getItem(OAUTH_LOGIN_RETURN_TO_STORAGE_KEY)
        : null;
    const redirectUrl = resolveLoginReturnTo(searchParams, pendingOAuthReturnTo);

    const waitForServerSession = async () => {
      for (const waitMs of POST_LOGIN_SESSION_SYNC_DELAYS_MS) {
        if (cancelled) {
          return false;
        }

        if (waitMs > 0) {
          await delay(waitMs);
        }

        await getAccessToken().catch(() => null);

        if (cancelled) {
          return false;
        }

        try {
          const response = await fetch("/api/v1/user", {
            cache: "no-store",
            credentials: "include",
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
            },
          });

          if (response.ok || response.status === 403) {
            return true;
          }
        } catch (error) {
          if (cancelled) {
            return false;
          }
          console.warn("Waiting for authenticated session to sync", error);
        }
      }

      return false;
    };

    const applyStoredSignupAttribution = async () => {
      const affiliateCode = sessionStorage.getItem(SIGNUP_ATTRIBUTION_STORAGE_KEYS.affiliate);
      const referralCode = sessionStorage.getItem(SIGNUP_ATTRIBUTION_STORAGE_KEYS.referral);

      const postAttribution = async (url: string, codeToApply: string, storageKey: string) => {
        try {
          for (let attempt = 0; attempt < 3; attempt++) {
            const response = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: codeToApply }),
            });

            if (
              response.ok ||
              response.status === 400 ||
              response.status === 404 ||
              response.status === 409
            ) {
              sessionStorage.removeItem(storageKey);
              return;
            }

            if (response.status !== 401) {
              sessionStorage.removeItem(storageKey);
              return;
            }

            await delay(300 * (attempt + 1));
          }
        } catch (error) {
          console.error("Failed to apply signup attribution", error);
        }
      };

      if (affiliateCode) {
        await postAttribution(
          "/api/v1/affiliates/link",
          affiliateCode,
          SIGNUP_ATTRIBUTION_STORAGE_KEYS.affiliate,
        );
      }

      if (referralCode) {
        await postAttribution(
          "/api/v1/referrals/apply",
          referralCode,
          SIGNUP_ATTRIBUTION_STORAGE_KEYS.referral,
        );
      }
    };

    void (async () => {
      sessionStorage.removeItem(OAUTH_LOGIN_PENDING_STORAGE_KEY);
      sessionStorage.removeItem(OAUTH_LOGIN_RETURN_TO_STORAGE_KEY);
      loginInProgressRef.current = false;
      setLoadingButton(null);
      setIsProcessingOAuth(false);
      setIsSyncing(true);

      await waitForServerSession();
      await applyStoredSignupAttribution();
      await delay(100);

      if (!cancelled) {
        router.replace(redirectUrl);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getAccessToken, isAuthenticated, isAuthReady, router, searchParams]);

  useEffect(() => {
    if (!isAuthReady || isAuthenticated) {
      return;
    }

    if (loginInProgressRef.current && !loadingButton) {
      loginInProgressRef.current = false;
    }

    if (isProcessingOAuth) {
      const timeout = setTimeout(() => {
        setIsProcessingOAuth(false);
        sessionStorage.removeItem(OAUTH_LOGIN_PENDING_STORAGE_KEY);
        sessionStorage.removeItem(OAUTH_LOGIN_RETURN_TO_STORAGE_KEY);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [isAuthReady, isAuthenticated, isProcessingOAuth, loadingButton]);

  useEffect(() => {
    if (emailState.status === "awaiting-code-input") {
      setTimeout(() => {
        setShowCodeInput(true);
      }, 0);
    }
  }, [emailState.status]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setLoadingButton("email");
    await sendCode({ email });
    toast.success("Verification code sent to your email");
    setShowCodeInput(true);
    setLoadingButton(null);
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code || code.length !== 6) {
      toast.error("Please enter a valid 6-digit code");
      return;
    }

    setLoadingButton("verify");
    await loginWithCode({ code });
    toast.success("Email verified! Setting up your account...");
    setLoadingButton(null);
  };

  const handleOAuthLogin = async (provider: "google" | "discord" | "github") => {
    setLoadingButton(provider);
    sessionStorage.setItem(OAUTH_LOGIN_PENDING_STORAGE_KEY, "true");
    sessionStorage.setItem(OAUTH_LOGIN_RETURN_TO_STORAGE_KEY, resolveLoginReturnTo(searchParams));
    toast.loading(`Redirecting to ${provider}...`);
    await initOAuth({ provider });
  };

  const handleWalletConnect = async () => {
    if (loginInProgressRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastLoginAttemptRef.current < 500) {
      return;
    }

    if (authenticated) {
      return;
    }

    loginInProgressRef.current = true;
    lastLoginAttemptRef.current = now;
    setLoadingButton("wallet");

    login({ loginMethods: ["wallet"] });

    setTimeout(() => {
      if (loginInProgressRef.current) {
        loginInProgressRef.current = false;
        setLoadingButton(null);
      }
    }, 2000);
  };

  const handleBackToEmail = () => {
    setShowCodeInput(false);
    setCode("");
  };

  // Show loading state while checking authentication or processing OAuth callback
  if (!isAuthReady || isProcessingOAuth) {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <Loader2 className="h-12 w-12 animate-spin text-[#FF5800]" />
          <div className="absolute inset-0 h-12 w-12 animate-pulse rounded-full bg-[#FF5800]/20 blur-xl" />
        </div>
        <div className="space-y-2 text-center">
          <h3 className="text-lg font-semibold text-white">
            {isProcessingOAuth ? "Completing sign in..." : "Loading..."}
          </h3>
          <p className="text-sm text-neutral-500">
            {isProcessingOAuth ? "Processing your authentication" : "Initializing..."}
          </p>
        </div>
        <div className="flex gap-1.5">
          <div className="h-2 w-2 animate-bounce rounded-full bg-[#FF5800] [animation-delay:-0.3s]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-[#FF5800] [animation-delay:-0.15s]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-[#FF5800]" />
        </div>
      </div>
    );
  }

  // Redirecting state
  if (isAuthenticated || isSyncing) {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <Loader2 className="h-12 w-12 animate-spin text-[#FF5800]" />
          <div className="absolute inset-0 h-12 w-12 animate-pulse rounded-full bg-[#FF5800]/20 blur-xl" />
        </div>
        <div className="space-y-2 text-center">
          <h3 className="text-lg font-semibold text-white">Signing you in</h3>
          <p className="text-sm text-neutral-500">Taking you to your dashboard...</p>
        </div>
        <div className="flex gap-1.5">
          <div className="h-2 w-2 animate-bounce rounded-full bg-[#FF5800] [animation-delay:-0.3s]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-[#FF5800] [animation-delay:-0.15s]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-[#FF5800]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-white">
          {isSignupIntent ? "Create Account" : "Welcome back"}
        </h1>
        <p className="text-sm text-neutral-500">
          {isSignupIntent
            ? "Sign up to get started with Eliza Cloud"
            : "Sign in to your Eliza Cloud account"}
        </p>
      </div>

      {/* Email/Code Login Section */}
      {!showCodeInput ? (
        <form onSubmit={handleSendCode} className="space-y-4">
          <div>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loadingButton !== null}
              className="h-11 rounded-xl border-white/10 bg-black/40 text-white placeholder:text-neutral-600 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              autoFocus
            />
          </div>
          <BrandButton
            type="submit"
            disabled={loadingButton !== null || !email}
            variant="primary"
            className="w-full h-11 rounded-xl disabled:bg-neutral-700 disabled:text-neutral-500"
          >
            {loadingButton === "email" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending code...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Continue with Email
              </>
            )}
          </BrandButton>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleBackToEmail}
              className="text-xs text-neutral-500 hover:text-white transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Change email
            </button>
            <Input
              id="code"
              type="text"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={loadingButton !== null}
              className="h-12 rounded-xl border-white/10 bg-black/40 text-white placeholder:text-neutral-600 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800] text-center text-xl tracking-[0.3em] font-mono"
              maxLength={6}
              autoFocus
            />
            <p className="text-xs text-neutral-500 text-center">
              Enter the 6-digit code sent to <span className="font-medium text-white">{email}</span>
            </p>
          </div>
          <BrandButton
            type="submit"
            disabled={loadingButton !== null || code.length !== 6}
            variant="primary"
            className="w-full h-11 rounded-xl mt-8"
          >
            {loadingButton === "verify" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify & Sign In"
            )}
          </BrandButton>
          <button
            type="button"
            onClick={handleSendCode}
            disabled={loadingButton !== null}
            className="w-full h-11 text-sm text-white rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            {loadingButton === "email" ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </span>
            ) : (
              "Resend Code"
            )}
          </button>
        </form>
      )}

      {/* Only show other login options on the initial screen */}
      {!showCodeInput && (
        <>
          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-neutral-900 px-3 text-neutral-500">or</span>
            </div>
          </div>

          {/* OAuth Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => handleOAuthLogin("google")}
              disabled={loadingButton !== null}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {loadingButton === "google" ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <>
                  <Chrome className="h-4 w-4 text-white" />
                  <span className="text-sm text-white">Continue with Google</span>
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleOAuthLogin("discord")}
                disabled={loadingButton !== null}
                className="flex items-center justify-center gap-2 h-11 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {loadingButton === "discord" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <>
                    <DiscordIcon className="h-4 w-4 text-white" />
                    <span className="text-sm text-white">Discord</span>
                  </>
                )}
              </button>

              <button
                onClick={() => handleOAuthLogin("github")}
                disabled={loadingButton !== null}
                className="flex items-center justify-center gap-2 h-11 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {loadingButton === "github" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <>
                    <Github className="h-4 w-4 text-white" />
                    <span className="text-sm text-white">GitHub</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Wallet Connect */}
          <button
            onClick={handleWalletConnect}
            disabled={loadingButton !== null}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white disabled:opacity-50"
          >
            {loadingButton === "wallet" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wallet className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">Connect Wallet</span>
          </button>
        </>
      )}

      {/* Footer */}
      <p className="text-center text-xs text-neutral-500 pt-4 border-t border-white/10">
        By signing in, you agree to our{" "}
        <a href="/terms-of-service" className="text-neutral-400 hover:text-white transition-colors">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy-policy" className="text-neutral-400 hover:text-white transition-colors">
          Privacy Policy
        </a>
      </p>
    </div>
  );
}
