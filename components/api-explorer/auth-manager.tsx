"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  CheckCircleIcon,
  XCircleIcon,
  InfoIcon,
} from "lucide-react";
import { toast } from "@/lib/utils/toast-adapter";

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
    <Card className="w-full border-gray-200 dark:border-transparent">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyIcon className="h-5 w-5" />
          API Key Authentication
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="auth-token">API Key</Label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                id="auth-token"
                type={showToken ? "text" : "password"}
                value={authToken}
                onChange={(e) => handleTokenChange(e.target.value)}
                placeholder="Enter API key (eliza_... or sk-...)"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-0 top-0 h-full px-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-r-lg transition-colors"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? (
                  <EyeOffIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </button>
            </div>

            {authToken && (
              <button
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={clearToken}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {apiKeyInfo && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {apiKeyInfo.valid ? (
                <CheckCircleIcon className="h-4 w-4 text-green-500" />
              ) : (
                <XCircleIcon className="h-4 w-4 text-red-500" />
              )}
              <span className="text-sm font-medium">
                {apiKeyInfo.valid ? "Valid API Key" : "Invalid API Key"}
              </span>
              {apiKeyInfo.format && (
                <Badge variant="outline" className="text-xs">
                  {apiKeyInfo.format === "eliza"
                    ? "ElizaOS"
                    : apiKeyInfo.format === "openai"
                      ? "OpenAI Format"
                      : "Unknown Format"}
                </Badge>
              )}
            </div>

            {apiKeyInfo.valid && apiKeyInfo.format && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Format:{" "}
                {apiKeyInfo.format === "eliza"
                  ? "ElizaOS API Key"
                  : apiKeyInfo.format === "openai"
                    ? "OpenAI-style API Key"
                    : "Unknown Format"}
              </div>
            )}
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
          <InfoIcon className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <p>
            Enter an API key (starts with eliza_ or sk-) to test authenticated
            endpoints. Your API key will be saved locally for future sessions.
          </p>
        </div>

        {isValidating && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Validating token...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
