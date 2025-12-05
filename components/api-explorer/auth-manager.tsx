"use client";

import { useState, useEffect, useCallback } from "react";
import {
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  CheckCircleIcon,
  XCircleIcon,
  InfoIcon,
  RefreshCwIcon,
  LoaderIcon,
  CreditCardIcon,
} from "lucide-react";
import { toast } from "@/lib/utils/toast-adapter";
import { BrandButton } from "@/components/brand";

interface ExplorerApiKey {
  id: string;
  name: string;
  description: string | null;
  key_prefix: string;
  key: string;
  created_at: string;
  is_active: boolean;
  usage_count: number;
  last_used_at: string | null;
}

interface AuthManagerProps {
  authToken: string;
  onTokenChange: (token: string) => void;
}

export function AuthManager({ authToken, onTokenChange }: AuthManagerProps) {
  const [showToken, setShowToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [explorerKey, setExplorerKey] = useState<ExplorerApiKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchExplorerKey = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/api-keys/explorer");
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to fetch API key");
        return;
      }

      setExplorerKey(data.apiKey);
      onTokenChange(data.apiKey.key);

      if (data.isNew) {
        toast({
          message: "API Explorer key created! Usage will be billed to your account.",
          mode: "success",
        });
      }
    } catch (err) {
      console.error("Failed to fetch explorer key:", err);
      setError("Failed to connect to server");
    } finally {
      setIsLoading(false);
    }
  }, [onTokenChange]);

  // Auto-fetch explorer key on mount
  useEffect(() => {
    fetchExplorerKey();
  }, [fetchExplorerKey]);

  const isValidKey = authToken && (authToken.startsWith("eliza_") || authToken.startsWith("sk-"));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyIcon className="h-4 w-4 text-[#FF5800]" />
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
          Authentication
        </h3>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 p-4 rounded-none border border-white/10 bg-black/20">
          <LoaderIcon className="h-4 w-4 animate-spin text-[#FF5800]" />
          <span className="text-sm text-white/60">Loading API key...</span>
        </div>
      ) : error ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-none border border-rose-500/30 bg-rose-500/10">
            <XCircleIcon className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-rose-400">{error}</p>
              {error.includes("sign in") && (
                <p className="text-xs text-white/50 mt-1">
                  Sign in to automatically get an API key for testing.
                </p>
              )}
            </div>
          </div>
          <BrandButton
            variant="outline"
            size="sm"
            onClick={fetchExplorerKey}
            className="w-full gap-2"
          >
            <RefreshCwIcon className="h-3 w-3" />
            Retry
          </BrandButton>
        </div>
      ) : explorerKey ? (
        <div className="space-y-3">
          {/* Key Status */}
          <div className="flex items-start gap-2 p-3 rounded-none border border-emerald-500/30 bg-emerald-500/10">
            <CheckCircleIcon className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white mb-1">
                {explorerKey.name}
              </div>
              <div className="text-xs text-white/50">
                {explorerKey.description}
              </div>
            </div>
          </div>

          {/* Key Display */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-white/60">
              Your API Key
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={authToken}
                readOnly
                className="w-full rounded-none border border-white/10 bg-black/40 px-3 py-2 pr-10 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-0 top-0 h-full px-3 hover:bg-white/10 transition-colors rounded-none"
              >
                {showToken ? (
                  <EyeOffIcon className="h-4 w-4 text-white/70" />
                ) : (
                  <EyeIcon className="h-4 w-4 text-white/70" />
                )}
              </button>
            </div>
          </div>

          {/* Usage Stats */}
          <div className="flex items-center gap-4 text-xs text-white/50">
            <span>Used: {explorerKey.usage_count} times</span>
            {explorerKey.last_used_at && (
              <span>
                Last: {new Date(explorerKey.last_used_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Billing Notice */}
          <div className="flex items-start gap-2 p-3 rounded-none bg-[#FF580015] border border-[#FF580030]">
            <CreditCardIcon className="h-3 w-3 mt-0.5 shrink-0 text-[#FF5800]" />
            <p className="text-xs text-[#FF5800]/80 leading-relaxed">
              API calls made here are billed to your account. Credits will be deducted based on usage.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 p-3 rounded-none bg-white/5 border border-white/10">
          <InfoIcon className="h-3 w-3 mt-0.5 shrink-0 text-white/50" />
          <p className="text-xs text-white/50 leading-relaxed">
            No API key available. Please sign in to test authenticated endpoints.
          </p>
        </div>
      )}

      {/* Manual Override (collapsed by default, for advanced users) */}
      {!isLoading && isValidKey && (
        <details className="text-xs">
          <summary className="text-white/40 cursor-pointer hover:text-white/60 transition-colors">
            Advanced: Use a different key
          </summary>
          <div className="mt-2 space-y-2">
            <input
              type="text"
              placeholder="Enter custom API key..."
              onChange={(e) => onTokenChange(e.target.value)}
              className="w-full rounded-none border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
            />
            <BrandButton
              variant="ghost"
              size="sm"
              onClick={fetchExplorerKey}
              className="w-full text-xs"
            >
              Reset to Explorer Key
            </BrandButton>
          </div>
        </details>
      )}
    </div>
  );
}
