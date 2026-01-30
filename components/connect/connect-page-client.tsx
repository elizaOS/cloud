"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CheckCircle2,
  ArrowLeft,
  Loader2,
  AlertCircle,
  ExternalLink,
  X,
  RefreshCw,
} from "lucide-react";
import {
  useConnectionStatus,
  type ServiceType,
} from "@/lib/hooks/use-connection-status";
import {
  GoogleCard,
  TwilioCard,
  BlooioCard,
  TelegramCard,
  TwitterCard,
  DiscordCard,
} from "./connection-cards";

// Error type for better tracking
interface OAuthError {
  service: string;
  message: string;
  timestamp: number;
}

interface ConnectPageClientProps {
  services: ServiceType[];
  returnUrl: string;
  state?: string;
  initialGoogleConnected?: boolean;
  googleError?: string;
  initialTwitterConnected?: boolean;
  twitterError?: string;
  initialDiscordConnected?: boolean;
  discordError?: string;
}

export function ConnectPageClient({
  services,
  returnUrl,
  state,
  initialGoogleConnected,
  googleError,
  initialTwitterConnected,
  twitterError,
  initialDiscordConnected,
  discordError,
}: ConnectPageClientProps) {
  const searchParams = useSearchParams();
  const [isRedirecting, setIsRedirecting] = useState(false);
  // Store all errors - initialized from props
  const [oauthErrors, setOauthErrors] = useState<OAuthError[]>(() => {
    const errors: OAuthError[] = [];
    const now = Date.now();
    if (googleError) {
      errors.push({ service: "Google", message: googleError, timestamp: now });
    }
    if (twitterError) {
      errors.push({ service: "Twitter", message: twitterError, timestamp: now + 1 });
    }
    if (discordError) {
      errors.push({ service: "Discord", message: discordError, timestamp: now + 2 });
    }
    return errors;
  });
  // Track which services had successful recent connections - initialized from props
  const [recentlyConnected, setRecentlyConnected] = useState<Set<string>>(() => {
    const connected = new Set<string>();
    if (initialGoogleConnected) connected.add("google");
    if (initialTwitterConnected) connected.add("twitter");
    if (initialDiscordConnected) connected.add("discord");
    return connected;
  });
  // Track timeout refs for cleanup
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Track if initial OAuth connections have been processed
  const initialConnectionsProcessed = useRef(false);

  const {
    statuses,
    allConnected,
    connectedCount,
    configuredCount,
    totalCount,
    refresh,
    refreshService,
  } = useConnectionStatus(services);

  // Build the current page URL for OAuth callbacks
  const currentUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/connect?${searchParams.toString()}`
      : `/connect?${searchParams.toString()}`;

  // Dismiss a specific error
  const dismissError = useCallback((timestamp: number) => {
    setOauthErrors((prev) => prev.filter((e) => e.timestamp !== timestamp));
  }, []);

  // Dismiss all errors
  const dismissAllErrors = useCallback(() => {
    setOauthErrors([]);
  }, []);

  // Handle OAuth callbacks - refresh services that just connected
  useEffect(() => {
    if (initialConnectionsProcessed.current) return;
    initialConnectionsProcessed.current = true;

    // Refresh status for services that just connected
    if (initialGoogleConnected) {
      refreshService("google");
    }
    if (initialTwitterConnected) {
      refreshService("twitter");
    }
    if (initialDiscordConnected) {
      refreshService("discord");
    }

    // Clear the "recently connected" highlight after 3 seconds
    const hasRecentlyConnected = initialGoogleConnected || initialTwitterConnected || initialDiscordConnected;
    if (hasRecentlyConnected) {
      const timer = setTimeout(() => setRecentlyConnected(new Set()), 3000);
      return () => clearTimeout(timer);
    }
  }, [
    initialGoogleConnected,
    initialTwitterConnected,
    initialDiscordConnected,
    refreshService,
  ]);

  // Derive success message visibility (no need for separate state)
  const showSuccessMessage = allConnected && !isRedirecting;

  // Handle visibility change - refresh status when user returns to page
  // This helps when user returns from OAuth without completing
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    const refs = timeoutRefs.current;
    return () => {
      for (const timeout of refs.values()) {
        clearTimeout(timeout);
      }
      refs.clear();
    };
  }, []);

  const handleReturnToBot = () => {
    setIsRedirecting(true);

    // Build final redirect URL with success params
    try {
      const finalUrl = new URL(returnUrl);
      finalUrl.searchParams.set("connected", "true");
      finalUrl.searchParams.set("services", services.join(","));
      if (state) {
        finalUrl.searchParams.set("state", state);
      }
      window.location.href = finalUrl.toString();
    } catch {
      // If returnUrl is not a valid URL (like tg://), just append params
      const separator = returnUrl.includes("?") ? "&" : "?";
      const params = new URLSearchParams({
        connected: "true",
        services: services.join(","),
        ...(state ? { state } : {}),
      });
      window.location.href = `${returnUrl}${separator}${params.toString()}`;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Eliza Logo */}
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">
                E
              </span>
            </div>
            <span className="font-semibold">Eliza Cloud</span>
          </div>
          <a
            href={returnUrl}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 min-h-[44px] min-w-[44px] justify-center px-3 -mr-3 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Cancel</span>
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Title Section with Onboarding */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">Connect Your Services</h1>
          <p className="text-muted-foreground">
            Complete the connections below to enable your automation
          </p>
        </div>

        {/* Onboarding Info */}
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Why connect?</strong> Your AI assistant needs access to
            these services to perform actions on your behalf — like sending
            messages, scheduling events, or managing data.
          </p>
        </div>

        {/* Error Alerts - Show ALL errors with dismiss and retry */}
        {oauthErrors.length > 0 && (
          <div className="space-y-3 mb-6" role="alert" aria-live="polite">
            {oauthErrors.length > 1 && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={dismissAllErrors}
                  className="text-xs text-muted-foreground"
                >
                  Dismiss all
                </Button>
              </div>
            )}
            {oauthErrors.map((error) => (
              <Alert key={error.timestamp} variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <div className="flex-1">
                  <AlertTitle className="text-sm">
                    {error.service} Connection Failed
                  </AlertTitle>
                  <AlertDescription className="text-xs mt-1">
                    {error.message === "access_denied"
                      ? "You denied access. Click retry to try again."
                      : error.message}
                  </AlertDescription>
                </div>
                <div className="flex gap-2 ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      dismissError(error.timestamp);
                      // Scroll to the service card so user can retry
                      const serviceCard = document.querySelector(
                        `[data-service="${error.service.toLowerCase()}"]`,
                      );
                      serviceCard?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }}
                    className="h-7 text-xs"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissError(error.timestamp)}
                    className="h-7 w-7 p-0"
                    aria-label="Dismiss error"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </Alert>
            ))}
          </div>
        )}

        {/* Success Message */}
        {showSuccessMessage && allConnected && (
          <Alert className="mb-6 border-green-500 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-700 dark:text-green-400">
              All services connected! You can now return to continue.
            </AlertDescription>
          </Alert>
        )}

        {/* Progress Section */}
        <section
          className="mb-6 p-4 bg-card rounded-lg border"
          aria-label="Connection progress"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" id="progress-label">
              Connection Progress
            </span>
            <span
              className="text-sm text-muted-foreground"
              aria-live="polite"
              aria-atomic="true"
            >
              {connectedCount} of {configuredCount} connected
              {configuredCount < totalCount && (
                <span className="text-xs ml-1">
                  ({totalCount - configuredCount} unavailable)
                </span>
              )}
            </span>
          </div>
          <Progress
            value={configuredCount > 0 ? (connectedCount / configuredCount) * 100 : 0}
            className="h-2"
            aria-labelledby="progress-label"
            aria-valuenow={configuredCount > 0 ? (connectedCount / configuredCount) * 100 : 0}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </section>

        {/* Service Cards */}
        <ul
          className="space-y-4 mb-8 list-none"
          aria-label="Service connections"
        >
          {services.map((service) => {
            const status = statuses[service];
            const handleConnected = () => {
              refreshService(service);
              setRecentlyConnected((prev) => new Set([...prev, service]));
              // Clear existing timeout for this service
              const existingTimeout = timeoutRefs.current.get(service);
              if (existingTimeout) {
                clearTimeout(existingTimeout);
              }
              // Set new timeout and track it
              const timeout = setTimeout(() => {
                setRecentlyConnected((prev) => {
                  const next = new Set(prev);
                  next.delete(service);
                  return next;
                });
                timeoutRefs.current.delete(service);
              }, 3000);
              timeoutRefs.current.set(service, timeout);
            };
            const isRecentlyConnected = recentlyConnected.has(service);

            // Wrapper with data-service for retry button targeting
            const CardWrapper = ({
              children,
            }: {
              children: React.ReactNode;
            }) => (
              <li
                data-service={service}
                className={isRecentlyConnected ? "animate-pulse-once" : ""}
              >
                {children}
              </li>
            );

            switch (service) {
              case "google":
                return (
                  <CardWrapper key={service}>
                    <GoogleCard
                      status={status}
                      onConnected={handleConnected}
                      connectPageUrl={currentUrl}
                    />
                  </CardWrapper>
                );
              case "twilio":
                return (
                  <CardWrapper key={service}>
                    <TwilioCard status={status} onConnected={handleConnected} />
                  </CardWrapper>
                );
              case "blooio":
                return (
                  <CardWrapper key={service}>
                    <BlooioCard status={status} onConnected={handleConnected} />
                  </CardWrapper>
                );
              case "telegram":
                return (
                  <CardWrapper key={service}>
                    <TelegramCard
                      status={status}
                      onConnected={handleConnected}
                    />
                  </CardWrapper>
                );
              case "twitter":
                return (
                  <CardWrapper key={service}>
                    <TwitterCard
                      status={status}
                      onConnected={handleConnected}
                      connectPageUrl={currentUrl}
                    />
                  </CardWrapper>
                );
              case "discord":
                return (
                  <CardWrapper key={service}>
                    <DiscordCard
                      status={status}
                      onConnected={handleConnected}
                      connectPageUrl={currentUrl}
                    />
                  </CardWrapper>
                );
              default:
                return null;
            }
          })}
        </ul>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={handleReturnToBot}
            disabled={!allConnected || isRedirecting}
            className="w-full"
            size="lg"
          >
            {isRedirecting ? (
              <>
                <Loader2
                  className="h-4 w-4 animate-spin mr-2"
                  aria-hidden="true"
                />
                <span>Returning...</span>
              </>
            ) : allConnected ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Return to Bot
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4 mr-2" />
                Connect all services to continue
              </>
            )}
          </Button>

          {!allConnected && (
            <p className="text-center text-xs text-muted-foreground">
              Connect all {configuredCount} available service{configuredCount > 1 ? "s" : ""} to enable the automation
            </p>
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-12 text-center text-xs text-muted-foreground">
          <p>Your credentials are securely stored and encrypted.</p>
          <p className="mt-2">
            You can manage connections anytime in{" "}
            <a
              href="/dashboard/settings?tab=connections"
              className="underline inline-flex items-center min-h-[44px] px-1"
            >
              Settings
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
