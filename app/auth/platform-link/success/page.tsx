"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, Loader2 } from "lucide-react";

const PLATFORM_NAMES: Record<string, string> = {
  discord: "Discord",
  twitter: "X (Twitter)",
  google: "Google",
  gmail: "Gmail",
  github: "GitHub",
  slack: "Slack",
  telegram: "Telegram",
};

function SuccessContent() {
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform");
  const platformName = platform ? PLATFORM_NAMES[platform] || platform : "Platform";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
          <CheckCircle className="h-10 w-10 text-emerald-400" />
        </div>

        <h1 className="mb-3 text-2xl font-bold">Account Connected!</h1>

        <p className="mb-8 text-zinc-400">
          Your {platformName} account has been successfully linked. You can now
          close this window and return to your app.
        </p>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left text-sm text-zinc-400">
          <p>
            <strong className="text-white">What happens next?</strong>
          </p>
          <ul className="mt-2 space-y-1">
            <li>• Your credentials are securely stored</li>
            <li>• The app can now access authorized features</li>
            <li>• You can revoke access anytime from settings</li>
          </ul>
        </div>

        <button
          onClick={() => window.close()}
          className="mt-6 w-full rounded-xl bg-purple-600 px-6 py-3 font-medium text-white hover:bg-purple-500"
        >
          Close Window
        </button>
      </div>
    </div>
  );
}

export default function PlatformLinkSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <Loader2 className="h-12 w-12 animate-spin text-purple-500" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}

