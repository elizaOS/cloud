/**
 * App overview component displaying app details, API key management, and statistics.
 * Supports API key visibility toggle, regeneration, and copying app information.
 *
 * @param props - App overview configuration
 * @param props.app - App data to display
 * @param props.showApiKey - Optional API key to display initially
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { App } from "@/db/schemas";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Copy,
  Check,
  ExternalLink,
  Key,
  Globe,
  Mail,
  Activity,
  Shield,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
  Coins,
  TrendingUp,
  FileEdit,
  Hammer,
  Rocket,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AppOverviewProps {
  app: App;
  showApiKey?: string;
}

type DeploymentStatus =
  | "deployed"
  | "deploying"
  | "building"
  | "failed"
  | "draft";

function DeploymentStatusBadge({
  status,
}: {
  status: DeploymentStatus;
}): JSX.Element {
  switch (status) {
    case "deployed":
      return (
        <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Deployed
        </Badge>
      );
    case "deploying":
      return (
        <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">
          <Rocket className="h-3 w-3 mr-1 animate-pulse" />
          Deploying
        </Badge>
      );
    case "building":
      return (
        <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
          <Hammer className="h-3 w-3 mr-1 animate-pulse" />
          Building
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    case "draft":
    default:
      return (
        <Badge className="bg-white/10 text-white/60 border-white/20">
          <FileEdit className="h-3 w-3 mr-1" />
          Draft
        </Badge>
      );
  }
}

export function AppOverview({ app, showApiKey }: AppOverviewProps) {
  const router = useRouter();
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [displayApiKey, setDisplayApiKey] = useState(showApiKey || "");
  const [showKey, setShowKey] = useState(!!showApiKey);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [monetizationEnabled, setMonetizationEnabled] = useState<
    boolean | null
  >(null);
  const [totalEarnings, setTotalEarnings] = useState<number | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  useEffect(() => {
    if (!showApiKey) return;

    setDisplayApiKey(showApiKey);
    setShowKey(true);

    const timer = setTimeout(() => {
      setDisplayApiKey("");
      setShowKey(false);
    }, 60000);

    return () => clearTimeout(timer);
  }, [showApiKey]);

  // Fetch monetization status
  useEffect(() => {
    async function fetchMonetization(): Promise<void> {
      try {
        const response = await fetch(`/api/v1/apps/${app.id}/monetization`);
        if (!response.ok) return;

        const data = await response.json();
        if (data.success && data.monetization) {
          setMonetizationEnabled(data.monetization.monetizationEnabled);
          setTotalEarnings(data.monetization.totalCreatorEarnings);
        }
      } catch {
        // Silently fail - monetization status is not critical
      }
    }
    fetchMonetization();
  }, [app.id]);

  async function handleRegenerateApiKey(): Promise<void> {
    setIsRegenerating(true);
    try {
      const response = await fetch(
        `/api/v1/apps/${app.id}/regenerate-api-key`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || "Failed to regenerate API key");
        return;
      }

      const data = await response.json();
      setDisplayApiKey(data.apiKey);
      setShowKey(true);
      toast.success("API key regenerated");
      router.refresh();
    } catch {
      toast.error("Failed to regenerate API key");
    } finally {
      setIsRegenerating(false);
    }
  }

  const allowedOrigins: string[] = Array.isArray(app.allowed_origins)
    ? app.allowed_origins.filter(
        (origin): origin is string => typeof origin === "string",
      )
    : [];
  const maskedApiKey = "eliza_" + "•".repeat(32);

  return (
    <div className="space-y-6">
      {showApiKey && displayApiKey && (
        <Alert className="bg-[#FF5800]/10 border-[#FF5800]/20">
          <Key className="h-4 w-4 text-[#FF5800]" />
          <AlertDescription className="text-white">
            <div className="font-semibold mb-2">Your API Key (shown once)</div>
            <div className="flex items-center gap-2 mb-2">
              <code className="flex-1 bg-black/30 p-2 rounded text-xs overflow-x-auto">
                {displayApiKey}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(displayApiKey, "API Key")}
              >
                {copiedItem === "API Key" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-white/60">
              Make sure to save this key securely. You won&apos;t be able to see
              it again! This message will disappear in 30 seconds.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Basic Information */}
        <BrandCard>
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10 space-y-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Globe className="h-5 w-5 text-[#FF5800]" />
              Basic Information
            </h2>

            <div className="space-y-3">
              {/* Deployment Status */}
              <div>
                <p className="text-sm text-white/60">Deployment Status</p>
                <div className="mt-1">
                  <DeploymentStatusBadge
                    status={
                      (app.deployment_status || "draft") as DeploymentStatus
                    }
                  />
                </div>
              </div>

              {/* Production URL - Only shown when deployed */}
              {app.deployment_status === "deployed" && app.production_url && (
                <div>
                  <p className="text-sm text-white/60">Production URL</p>
                  <div className="flex items-center gap-2 mt-1">
                    <a
                      href={app.production_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white hover:text-[#FF5800] transition-colors flex items-center gap-1"
                    >
                      {app.production_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* App Status (Active/Inactive) */}
              <div>
                <p className="text-sm text-white/60">Status</p>
                <div className="mt-1">
                  {app.is_active ? (
                    <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
                      <Activity className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  ) : (
                    <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Inactive
                    </Badge>
                  )}
                </div>
              </div>

              {app.website_url && (
                <div>
                  <p className="text-sm text-white/60">Website</p>
                  <a
                    href={app.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-[#FF5800] transition-colors flex items-center gap-1 mt-1"
                  >
                    {app.website_url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {app.contact_email && (
                <div>
                  <p className="text-sm text-white/60">Contact Email</p>
                  <a
                    href={`mailto:${app.contact_email}`}
                    className="text-white hover:text-[#FF5800] transition-colors flex items-center gap-1 mt-1"
                  >
                    <Mail className="h-3 w-3" />
                    {app.contact_email}
                  </a>
                </div>
              )}

              {app.description && (
                <div>
                  <p className="text-sm text-white/60">Description</p>
                  <p className="text-white mt-1">{app.description}</p>
                </div>
              )}

              {app.last_deployed_at && (
                <div>
                  <p className="text-sm text-white/60">Last Deployed</p>
                  <p className="text-white mt-1">
                    {new Date(app.last_deployed_at).toLocaleDateString(
                      "en-US",
                      {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        </BrandCard>

        {/* API Key */}
        <BrandCard>
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10 space-y-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Key className="h-5 w-5 text-[#FF5800]" />
              API Key
            </h2>

            <div className="p-3 bg-black/30 rounded-lg border border-white/10">
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-white/80 font-mono overflow-x-auto">
                  {showKey && displayApiKey ? displayApiKey : maskedApiKey}
                </code>
                {displayApiKey && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowKey(!showKey)}
                      className="text-white/60 hover:text-white"
                    >
                      {showKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(displayApiKey, "API Key")}
                      className="text-white/60 hover:text-white"
                    >
                      {copiedItem === "API Key" ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </>
                )}
              </div>
              <p className="text-xs text-white/50 mt-2">
                Use this key to authenticate API requests from your app.
              </p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={isRegenerating}
                >
                  {isRegenerating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Regenerate API Key
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will immediately invalidate your current API key. Your
                    app will stop working until you update it with the new key.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleRegenerateApiKey}
                    className="bg-[#FF5800] hover:bg-[#FF5800]/80"
                  >
                    Regenerate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </BrandCard>
      </div>

      {/* Monetization Status */}
      {monetizationEnabled !== null && (
        <BrandCard>
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Coins className="h-5 w-5 text-yellow-500" />
                Monetization
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  router.push(`/dashboard/apps/${app.id}?tab=monetization`);
                }}
                className="text-white/60 hover:text-white"
              >
                Configure →
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <Badge
                className={
                  monetizationEnabled
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : "bg-white/10 text-white/60 border-white/20"
                }
              >
                {monetizationEnabled ? "Enabled" : "Disabled"}
              </Badge>

              {monetizationEnabled &&
                totalEarnings !== null &&
                totalEarnings > 0 && (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-400" />
                    <span className="text-sm text-white">
                      ${totalEarnings.toFixed(2)} earned
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        router.push(`/dashboard/apps/${app.id}?tab=earnings`);
                      }}
                      className="text-white/60 hover:text-white h-auto p-0"
                    >
                      View Details →
                    </Button>
                  </div>
                )}
            </div>

            {!monetizationEnabled && (
              <p className="text-sm text-white/60">
                Enable monetization to earn from app usage and credit purchases
              </p>
            )}
          </div>
        </BrandCard>
      )}

      {/* Allowed Origins */}
      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10 space-y-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            Allowed Origins
          </h2>
          <p className="text-sm text-white/60">
            API requests are only accepted from these domains
          </p>

          <div className="flex flex-wrap gap-2">
            {allowedOrigins.length > 0 ? (
              allowedOrigins.map((origin) => (
                <Badge
                  key={origin}
                  variant="secondary"
                  className="bg-white/5 text-white"
                >
                  {origin}
                </Badge>
              ))
            ) : (
              <p className="text-white/60 text-sm">No origins configured</p>
            )}
          </div>
        </div>
      </BrandCard>
    </div>
  );
}
