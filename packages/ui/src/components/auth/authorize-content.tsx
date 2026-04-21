"use client";

import { BrandButton, BrandCard, CornerBrackets } from "@elizaos/cloud-ui";
import { StewardLogin, useAuth } from "@stwd/react";
import { AlertTriangle, Loader2, Shield } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import LandingHeader from "@/packages/ui/src/components/layout/landing-header";

interface AppInfo {
  id: string;
  name: string;
  description?: string;
  logo_url?: string;
  website_url?: string;
}

export function AuthorizeContent() {
  const { isLoading: authLoading, isAuthenticated, user, getToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  const appId = searchParams.get("app_id");
  const redirectUri = searchParams.get("redirect_uri");
  const state = searchParams.get("state");

  useEffect(() => {
    async function validateApp() {
      if (!appId) {
        setError("Missing app_id parameter. Apps must be registered with Eliza Cloud.");
        setIsLoading(false);
        return;
      }

      if (!redirectUri) {
        setError("Missing redirect_uri parameter.");
        setIsLoading(false);
        return;
      }

      try {
        const uri = new URL(redirectUri);
        if (!uri.protocol.startsWith("http")) {
          throw new Error("Invalid protocol");
        }
      } catch {
        setError("Invalid redirect_uri format.");
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/v1/apps/${appId}/public?redirect_uri=${encodeURIComponent(redirectUri)}`,
        );
        if (!res.ok) {
          if (res.status === 404) {
            setError("App not found. Please ensure the app is registered with Eliza Cloud.");
          } else if (res.status === 400) {
            setError("This redirect URI is not registered for the selected app.");
          } else {
            setError("Failed to verify app.");
          }
          setIsLoading(false);
          return;
        }

        const data = await res.json();
        setAppInfo(data.app);
        setIsLoading(false);
      } catch {
        setError("Failed to verify app. Please try again.");
        setIsLoading(false);
      }
    }

    validateApp();
  }, [appId, redirectUri]);

  useEffect(() => {
    async function completeAuthorization() {
      if (authLoading || !isAuthenticated || !user || !appInfo || !redirectUri) return;
      if (isAuthorizing) return;

      setIsAuthorizing(true);

      try {
        const token = getToken();

        if (!token) {
          setError("Failed to get authentication token.");
          setIsAuthorizing(false);
          return;
        }

        await fetch("/api/v1/app-auth/connect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ appId }),
        });

        const redirectUrl = new URL(redirectUri);
        redirectUrl.searchParams.set("token", token);
        if (state) {
          redirectUrl.searchParams.set("state", state);
        }

        window.location.href = redirectUrl.toString();
      } catch (err) {
        console.error("Authorization error:", err);
        setError("Failed to complete authorization. Please try again.");
        setIsAuthorizing(false);
      }
    }

    completeAuthorization();
  }, [
    authLoading,
    isAuthenticated,
    user,
    appId,
    appInfo,
    redirectUri,
    state,
    getToken,
    isAuthorizing,
  ]);

  const handleCancel = () => {
    if (redirectUri) {
      const redirectUrl = new URL(redirectUri);
      redirectUrl.searchParams.set("error", "access_denied");
      redirectUrl.searchParams.set("error_description", "User denied authorization");
      if (state) {
        redirectUrl.searchParams.set("state", state);
      }
      window.location.href = redirectUrl.toString();
    } else {
      router.push("/");
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="relative flex min-h-screen w-full flex-col overflow-hidden">
        <LandingHeader />
        <BackgroundVideo />
        <div className="relative z-10 flex flex-1 items-center justify-center p-4">
          <BrandCard className="w-full max-w-md backdrop-blur-sm bg-black/60">
            <CornerBrackets size="md" className="opacity-50" />
            <div className="relative z-10 flex flex-col items-center gap-6 py-8">
              <Loader2 className="h-12 w-12 animate-spin text-[#FF5800]" />
              <div className="space-y-2 text-center">
                <h3 className="text-lg font-semibold text-white">Verifying application...</h3>
              </div>
            </div>
          </BrandCard>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative flex min-h-screen w-full flex-col overflow-hidden">
        <LandingHeader />
        <BackgroundVideo />
        <div className="relative z-10 flex flex-1 items-center justify-center p-4">
          <BrandCard className="w-full max-w-md backdrop-blur-sm bg-black/60">
            <CornerBrackets size="md" className="opacity-50" />
            <div className="relative z-10 flex flex-col items-center gap-6 py-8">
              <div className="p-4 rounded-full bg-red-500/20">
                <AlertTriangle className="h-8 w-8 text-red-400" />
              </div>
              <div className="space-y-2 text-center">
                <h3 className="text-lg font-semibold text-white">Authorization Error</h3>
                <p className="text-sm text-white/60 max-w-xs">{error}</p>
              </div>
              <BrandButton variant="outline" onClick={() => router.push("/")} className="mt-4">
                Go to Eliza Cloud
              </BrandButton>
            </div>
          </BrandCard>
        </div>
      </div>
    );
  }

  if (isAuthenticated && isAuthorizing) {
    return (
      <div className="relative flex min-h-screen w-full flex-col overflow-hidden">
        <LandingHeader />
        <BackgroundVideo />
        <div className="relative z-10 flex flex-1 items-center justify-center p-4">
          <BrandCard className="w-full max-w-md backdrop-blur-sm bg-black/60">
            <CornerBrackets size="md" className="opacity-50" />
            <div className="relative z-10 flex flex-col items-center gap-6 py-8">
              <Loader2 className="h-12 w-12 animate-spin text-[#FF5800]" />
              <div className="space-y-2 text-center">
                <h3 className="text-lg font-semibold text-white">Authorizing...</h3>
                <p className="text-sm text-white/60">
                  Redirecting you back to {appInfo?.name || "the app"}
                </p>
              </div>
            </div>
          </BrandCard>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden">
      <LandingHeader />
      <BackgroundVideo />
      <div className="relative z-10 flex flex-1 items-center justify-center p-4">
        <BrandCard className="w-full max-w-md backdrop-blur-sm bg-black/60">
          <CornerBrackets size="md" className="opacity-50" />
          <div className="relative z-10 space-y-6">
            <div className="flex flex-col items-center gap-4 text-center">
              {appInfo?.logo_url ? (
                <Image
                  src={appInfo.logo_url}
                  alt={appInfo.name || "App logo"}
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-xl object-cover"
                  unoptimized
                />
              ) : (
                <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-[#FF5800] to-[#FF8800] flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">
                    {appInfo?.name?.charAt(0) || "A"}
                  </span>
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold text-white">{appInfo?.name || "Application"}</h1>
                {appInfo?.website_url && (
                  <p className="text-sm text-white/50 mt-1">
                    {new URL(appInfo.website_url).hostname}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3 p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 text-white/80">
                <Shield className="h-4 w-4 text-[#FF5800]" />
                <span className="text-sm font-medium">This app wants to:</span>
              </div>
              <ul className="space-y-2 text-sm text-white/60 ml-6">
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#FF5800]" />
                  Access your Eliza Cloud account
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#FF5800]" />
                  Use AI features with your credits
                </li>
              </ul>
            </div>

            <StewardLogin
              variant="inline"
              showPasskey
              showEmail
              title="Sign in with Steward"
            />
            <BrandButton variant="ghost" onClick={handleCancel} className="w-full">
              Cancel
            </BrandButton>

            <p className="text-center text-xs text-white/40">
              By continuing, you agree to share your account information with this app.
            </p>
          </div>
        </BrandCard>
      </div>
    </div>
  );
}

function BackgroundVideo() {
  return (
    <>
      <video
        src="/videos/Hero Cloud_x3 Slower_1_Scale 5.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: "brightness(0.4) blur(2px)" }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-black/60" />
    </>
  );
}
