"use client";

import { useState, useEffect } from "react";
import { App } from "@/db/schemas";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AppOverviewProps {
  app: App;
  showApiKey?: string;
}

export function AppOverview({ app, showApiKey }: AppOverviewProps) {
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [displayApiKey, setDisplayApiKey] = useState(showApiKey || "");

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  useEffect(() => {
    // Clear API key from display after 30 seconds for security
    if (displayApiKey) {
      const timer = setTimeout(() => {
        setDisplayApiKey("");
      }, 30000);
      return () => clearTimeout(timer);
    }
  }, [displayApiKey]);

  const allowedOrigins = app.allowed_origins as string[];
  const features = app.features_enabled as Record<string, boolean>;

  return (
    <div className="space-y-6">
      {/* API Key Alert (shown only after creation) */}
      {displayApiKey && (
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
              Make sure to save this key securely. You won't be able to see it again!
              This message will disappear in 30 seconds.
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
              <div>
                <p className="text-sm text-white/60">App URL</p>
                <div className="flex items-center gap-2 mt-1">
                  <a
                    href={app.app_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-[#FF5800] transition-colors flex items-center gap-1"
                  >
                    {app.app_url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
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

              {app.description && (
                <div>
                  <p className="text-sm text-white/60">Description</p>
                  <p className="text-white mt-1">{app.description}</p>
                </div>
              )}
            </div>
          </div>
        </BrandCard>

        {/* Affiliate & Features */}
        <BrandCard>
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10 space-y-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-500" />
              Features & Affiliate
            </h2>

            {app.affiliate_code && (
              <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                <p className="text-sm text-white/60 mb-2">Affiliate Code</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-black/30 p-2 rounded text-white">
                    {app.affiliate_code}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      copyToClipboard(app.affiliate_code!, "Affiliate Code")
                    }
                  >
                    {copiedItem === "Affiliate Code" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-white/60 mt-2">
                  Share this code to track referrals: {app.app_url}?ref=
                  {app.affiliate_code}
                </p>
              </div>
            )}

            <div>
              <p className="text-sm text-white/60 mb-2">Enabled Features</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(features).map(([key, enabled]) => {
                  if (!enabled) return null;
                  return (
                    <Badge
                      key={key}
                      variant="outline"
                      className="bg-blue-500/10 text-blue-400 border-blue-500/20"
                    >
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                    </Badge>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm text-white/60 mb-2">Rate Limits</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg">
                  <p className="text-xs text-white/60">Per Minute</p>
                  <p className="text-lg font-semibold text-white">
                    {app.rate_limit_per_minute}
                  </p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg">
                  <p className="text-xs text-white/60">Per Hour</p>
                  <p className="text-lg font-semibold text-white">
                    {app.rate_limit_per_hour}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </BrandCard>
      </div>

      {/* Allowed Origins */}
      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10 space-y-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            Allowed Origins (URL Whitelist)
          </h2>
          <p className="text-sm text-white/60">
            Only requests from these origins will be accepted
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

