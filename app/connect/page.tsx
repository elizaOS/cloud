"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ConnectPageClient } from "@/components/connect/connect-page-client";
import { Loader2 } from "lucide-react";

// Valid services that can be connected
const VALID_SERVICES = [
  "google",
  "twilio",
  "blooio",
  "telegram",
  "twitter",
  "discord",
  "slack",
  "whatsapp",
  "notion",
  "airtable",
  "webhooks",
] as const;
type ValidService = (typeof VALID_SERVICES)[number];

function ConnectPageContent() {
  const searchParams = useSearchParams();

  const servicesParam = searchParams.get("services");
  const returnUrl = searchParams.get("returnUrl");
  const state = searchParams.get("state");

  // Parse and validate services
  const requestedServices: ValidService[] = servicesParam
    ? servicesParam
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is ValidService =>
          VALID_SERVICES.includes(s as ValidService),
        )
    : [];

  // Check for errors in URL params (from OAuth callbacks)
  const googleConnected = searchParams.get("google_connected") === "true";
  const googleError = searchParams.get("google_error");
  const twitterConnected = searchParams.get("twitter_connected") === "true";
  const twitterError = searchParams.get("twitter_error");
  const discordConnected =
    searchParams.get("discord") === "connected" ||
    searchParams.get("discord_connected") === "true";
  const discordError =
    searchParams.get("discord") === "error"
      ? searchParams.get("message")
      : searchParams.get("discord_error");
  const slackConnected = searchParams.get("slack") === "connected";
  const slackError =
    searchParams.get("slack") === "error"
      ? searchParams.get("message")
      : searchParams.get("slack_error");
  const notionConnected = searchParams.get("notion") === "connected";
  const notionError =
    searchParams.get("notion") === "error"
      ? searchParams.get("message")
      : searchParams.get("notion_error");

  if (requestedServices.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full mx-auto p-6 text-center">
          <div className="rounded-full bg-red-100 dark:bg-red-900/20 w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-xl font-semibold mb-2">Missing Services</h1>
          <p className="text-muted-foreground mb-4">
            Please provide a{" "}
            <code className="bg-muted px-1 rounded">services</code> parameter
            specifying which services to connect.
          </p>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="text-sm text-primary hover:underline"
          >
            ← Go back to previous page
          </button>
        </div>
      </div>
    );
  }

  if (!returnUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full mx-auto p-6 text-center">
          <div className="rounded-full bg-red-100 dark:bg-red-900/20 w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-xl font-semibold mb-2">Missing Return URL</h1>
          <p className="text-muted-foreground mb-4">
            Please provide a{" "}
            <code className="bg-muted px-1 rounded">returnUrl</code> parameter
            to redirect back after connecting.
          </p>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="text-sm text-primary hover:underline"
          >
            ← Go back to previous page
          </button>
        </div>
      </div>
    );
  }

  // Validate returnUrl format (should be a valid URL or protocol scheme like tg://)
  const isValidReturnUrl = (() => {
    // Block dangerous protocols
    const dangerousProtocols = ["javascript:", "data:", "vbscript:", "file:"];
    const lowerUrl = returnUrl.toLowerCase();
    if (dangerousProtocols.some((proto) => lowerUrl.startsWith(proto))) {
      return false;
    }

    try {
      // Check for standard URLs
      const url = new URL(returnUrl);
      // Require a hostname for http/https URLs
      if ((url.protocol === "http:" || url.protocol === "https:") && !url.hostname) {
        return false;
      }
      return true;
    } catch {
      // Allow custom protocol schemes like tg://, app://, etc.
      // But ensure it has content after the protocol
      const match = returnUrl.match(/^([a-z][a-z0-9+.-]*):\/\/(.+)/i);
      return match !== null && match[2].length > 0;
    }
  })();

  if (!isValidReturnUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full mx-auto p-6 text-center">
          <div className="rounded-full bg-red-100 dark:bg-red-900/20 w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-xl font-semibold mb-2">Invalid Return URL</h1>
          <p className="text-muted-foreground mb-4">
            The provided return URL is not valid. Please check the URL format.
          </p>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="text-sm text-primary hover:underline"
          >
            ← Go back to previous page
          </button>
        </div>
      </div>
    );
  }

  return (
    <ConnectPageClient
      services={requestedServices}
      returnUrl={returnUrl}
      state={state || undefined}
      initialGoogleConnected={googleConnected}
      googleError={googleError || undefined}
      initialTwitterConnected={twitterConnected}
      twitterError={twitterError || undefined}
      initialDiscordConnected={discordConnected}
      discordError={discordError || undefined}
      initialSlackConnected={slackConnected}
      slackError={slackError || undefined}
      initialNotionConnected={notionConnected}
      notionError={notionError || undefined}
    />
  );
}

export default function ConnectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ConnectPageContent />
    </Suspense>
  );
}
