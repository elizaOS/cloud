"use client";

import { useState, useEffect } from "react";
import {
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  CheckCircleIcon,
  XCircleIcon,
  InfoIcon,
} from "lucide-react";
import { toast } from "@/lib/utils/toast-adapter";
import { BrandCard, BrandButton, CornerBrackets } from "@/components/brand";

interface AuthManagerProps {
  authToken: string;
  onTokenChange: (token: string) => void;
}

interface ApiKeyInfo {
  valid: boolean;
  type: "api-key";
  format?: "eliza" | "openai" | "unknown";
}

export function AuthManager({ authToken, onTokenChange }: AuthManagerProps) {
  const [showToken, setShowToken] = useState(false);
  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyInfo | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem("api-explorer-auth-token");
      if (savedToken && !authToken) {
        onTokenChange(savedToken);
      }
    } catch (error) {
      console.warn("Failed to load auth token from localStorage:", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authToken) {
      validateApiKey(authToken);
    } else {
      setApiKeyInfo(null);
    }
  }, [authToken]);

  const saveToken = (token: string) => {
    try {
      if (token.trim()) {
        localStorage.setItem("api-explorer-auth-token", token);
      } else {
        localStorage.removeItem("api-explorer-auth-token");
      }
    } catch (error) {
      console.warn("Failed to save auth token to localStorage:", error);
    }
  };

  const handleTokenChange = (token: string) => {
    onTokenChange(token);
    saveToken(token);
  };

  const clearToken = () => {
    handleTokenChange("");
    setApiKeyInfo(null);
    toast({ message: "API key cleared", mode: "success" });
  };

  const validateApiKey = async (key: string) => {
    if (!key.trim()) {
      setApiKeyInfo(null);
      return;
    }

    setIsValidating(true);

    try {
      let format: "eliza" | "openai" | "unknown" = "unknown";
      let isValid = false;

      if (key.startsWith("eliza_")) {
        const keyPart = key.substring("eliza_".length);
        isValid = keyPart.length >= 32 && /^[a-zA-Z0-9]+$/.test(keyPart);
        format = "eliza";
      } else if (key.startsWith("sk-")) {
        const keyPart = key.substring("sk-".length);
        isValid = keyPart.length >= 32 && /^[a-zA-Z0-9]+$/.test(keyPart);
        format = "openai";
      } else {
        isValid = false;
      }

      setApiKeyInfo({
        valid: isValid,
        type: "api-key",
        format,
      });
    } catch {
      setApiKeyInfo({ valid: false, type: "api-key" });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyIcon className="h-4 w-4 text-[#FF5800]" />
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
          Authentication
        </h3>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="auth-token"
          className="text-xs font-medium text-white/60"
        >
          API Key
        </label>
        <div className="space-y-2">
          <div className="relative">
            <input
              id="auth-token"
              type={showToken ? "text" : "password"}
              value={authToken}
              onChange={(e) => handleTokenChange(e.target.value)}
              placeholder="eliza_... or sk-..."
              className="w-full rounded-none border border-white/10 bg-black/40 px-3 py-2 pr-10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
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

          {authToken && (
            <BrandButton 
              variant="outline" 
              size="sm" 
              onClick={clearToken}
              className="w-full"
            >
              Clear Token
            </BrandButton>
          )}
        </div>
      </div>

      {apiKeyInfo && (
        <div className="space-y-2 p-3 rounded-none border border-white/10 bg-black/20">
          <div className="flex items-start gap-2">
            {apiKeyInfo.valid ? (
              <CheckCircleIcon className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
            ) : (
              <XCircleIcon className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white mb-1">
                {apiKeyInfo.valid ? "Valid API Key" : "Invalid API Key"}
              </div>
              {apiKeyInfo.format && (
                <span className="inline-block rounded-none bg-[#FF580020] px-2 py-0.5 text-[10px] font-semibold text-[#FF5800] border border-[#FF580040]">
                  {apiKeyInfo.format === "eliza"
                    ? "ElizaOS"
                    : apiKeyInfo.format === "openai"
                      ? "OpenAI"
                      : "Unknown"}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 p-3 rounded-none bg-white/5 border border-white/10">
        <InfoIcon className="h-3 w-3 mt-0.5 shrink-0 text-white/50" />
        <p className="text-xs text-white/50 leading-relaxed">
          Enter an API key to test authenticated endpoints. Keys are saved locally.
        </p>
      </div>

      {isValidating && (
        <div className="text-sm text-white/60">Validating...</div>
      )}
    </div>
  );
}
