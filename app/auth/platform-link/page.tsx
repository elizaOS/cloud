"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, Shield, ExternalLink } from "lucide-react";

interface SessionInfo {
  platform: string;
  organizationName?: string;
  appName?: string;
  requestedScopes?: string[];
  linkUrl?: string;
}

const PLATFORM_INFO: Record<
  string,
  { name: string; icon: string; color: string; description: string }
> = {
  discord: {
    name: "Discord",
    icon: "🎮",
    color: "#5865F2",
    description: "Connect your Discord account",
  },
  twitter: {
    name: "X (Twitter)",
    icon: "𝕏",
    color: "#000000",
    description: "Connect your X account",
  },
  google: {
    name: "Google",
    icon: "🔵",
    color: "#4285F4",
    description: "Connect your Google account",
  },
  gmail: {
    name: "Gmail",
    icon: "✉️",
    color: "#EA4335",
    description: "Connect your Gmail account",
  },
  github: {
    name: "GitHub",
    icon: "🐙",
    color: "#24292e",
    description: "Connect your GitHub account",
  },
  slack: {
    name: "Slack",
    icon: "💼",
    color: "#4A154B",
    description: "Connect your Slack account",
  },
  telegram: {
    name: "Telegram",
    icon: "✈️",
    color: "#0088cc",
    description: "Connect your Telegram account",
  },
};

function PlatformLinkContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session");

  const [loading, setLoading] = useState(true);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("Invalid link - no session ID");
      setLoading(false);
      return;
    }

    async function fetchSession() {
      try {
        const response = await fetch(
          `/api/v1/credentials/session/${sessionId}`,
        );
        const data = await response.json();

        if (data.status === "not_found") {
          setError("Link expired or invalid");
          return;
        }

        if (data.status === "completed") {
          router.push(`/auth/platform-link/success?session=${sessionId}`);
          return;
        }

        if (data.status === "expired") {
          setError("This link has expired. Please request a new one.");
          return;
        }

        // Fetch full session details
        const detailsRes = await fetch(
          `/api/v1/credentials/session/${sessionId}/details`,
        );
        if (detailsRes.ok) {
          const details = await detailsRes.json();
          setSessionInfo(details);
        } else {
          // Basic info from status
          setSessionInfo({
            platform: data.platform || "unknown",
          });
        }
      } catch (err) {
        setError("Failed to load link information");
      } finally {
        setLoading(false);
      }
    }

    fetchSession();
  }, [sessionId, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-purple-500" />
          <p className="mt-4 text-zinc-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="mx-auto max-w-md px-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="mb-2 text-xl font-bold">Link Error</h1>
          <p className="text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!sessionInfo) {
    return null;
  }

  const platformMeta = PLATFORM_INFO[sessionInfo.platform] || {
    name: sessionInfo.platform,
    icon: "🔗",
    color: "#6366f1",
    description: `Connect your ${sessionInfo.platform} account`,
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl text-3xl"
            style={{ backgroundColor: `${platformMeta.color}20` }}
          >
            {platformMeta.icon}
          </div>
          <h1 className="mb-2 text-2xl font-bold">
            {platformMeta.description}
          </h1>
          <p className="text-zinc-400">
            {sessionInfo.appName || "An app"} is requesting access to your{" "}
            {platformMeta.name} account
          </p>
        </div>

        {/* Scopes */}
        {sessionInfo.requestedScopes &&
          sessionInfo.requestedScopes.length > 0 && (
            <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-400">
                <Shield className="h-4 w-4" />
                Requested permissions
              </h3>
              <ul className="space-y-2 text-sm">
                {sessionInfo.requestedScopes.map((scope) => (
                  <li key={scope} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                    {scope}
                  </li>
                ))}
              </ul>
            </div>
          )}

        {/* Continue Button */}
        {sessionInfo.linkUrl && (
          <a
            href={sessionInfo.linkUrl}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 font-medium text-white transition-all hover:opacity-90"
            style={{ backgroundColor: platformMeta.color }}
          >
            Continue to {platformMeta.name}
            <ExternalLink className="h-4 w-4" />
          </a>
        )}

        {/* Security Note */}
        <p className="mt-6 text-center text-xs text-zinc-500">
          You&apos;ll be redirected to {platformMeta.name} to authorize. Your
          credentials are encrypted and stored securely.
        </p>
      </div>
    </div>
  );
}

export default function PlatformLinkPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <Loader2 className="h-12 w-12 animate-spin text-purple-500" />
        </div>
      }
    >
      <PlatformLinkContent />
    </Suspense>
  );
}
