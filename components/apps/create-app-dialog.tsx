/**
 * Create app dialog component for creating new applications.
 * Supports app name, description, URLs, and allowed origins configuration.
 * Displays created app details with API key after successful creation.
 *
 * @param props - Create app dialog configuration
 * @param props.open - Whether dialog is open
 * @param props.onOpenChange - Callback when dialog open state changes
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface CreatedAppData {
  appId: string;
  apiKey: string;
  appName: string;
}

interface CreateAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAppDialog({ open, onOpenChange }: CreateAppDialogProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
  const [newOrigin, setNewOrigin] = useState("");
  const [createdApp, setCreatedApp] = useState<CreatedAppData | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    app_url: "",
    website_url: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const response = await fetch("/api/v1/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...formData,
        allowed_origins: allowedOrigins.length > 0 ? allowedOrigins : [formData.app_url],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create app");
    }

    const data = await response.json();
    
    // Show the API key in the success state
    setCreatedApp({
      appId: data.app.id,
      apiKey: data.apiKey,
      appName: formData.name,
    });
    
    router.refresh();
    setIsLoading(false);
  };

  const addOrigin = () => {
    if (newOrigin && !allowedOrigins.includes(newOrigin)) {
      setAllowedOrigins([...allowedOrigins, newOrigin]);
      setNewOrigin("");
    }
  };

  const removeOrigin = (origin: string) => {
    setAllowedOrigins(allowedOrigins.filter((o) => o !== origin));
  };

  const copyApiKey = async () => {
    if (!createdApp) return;
    await navigator.clipboard.writeText(createdApp.apiKey);
    setCopied(true);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    if (createdApp) {
      // Navigate to the app page after closing
      router.push(`/dashboard/apps/${createdApp.appId}`);
    }
    // Reset all state
    setCreatedApp(null);
    setCopied(false);
    setFormData({
      name: "",
      description: "",
      app_url: "",
      website_url: "",
    });
    setAllowedOrigins([]);
    onOpenChange(false);
  };

  // Success state - show API key
  if (createdApp) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              App Created
            </DialogTitle>
            <DialogDescription>
              Copy your API key now — you won&apos;t see it again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label className="text-xs text-white/60">API Key</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={createdApp.apiKey}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={copyApiKey}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              onClick={handleClose}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Go to Overview
            </Button>
            <Button
              onClick={() => {
                router.push(`/dashboard/apps/${createdApp.appId}?tab=monetization`);
                onOpenChange(false);
              }}
              className="bg-gradient-to-r from-[#FF5800] to-purple-600 w-full sm:w-auto"
            >
              Enable Monetization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New App</DialogTitle>
          <DialogDescription>
            Register your app to get an API key.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">App Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Awesome App"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="A brief description of your app..."
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="app_url">App URL *</Label>
              <Input
                id="app_url"
                type="url"
                value={formData.app_url}
                onChange={(e) => setFormData({ ...formData, app_url: e.target.value })}
                placeholder="http://localhost:3000"
                required
              />
            </div>

            <div>
              <Label htmlFor="website_url">Website URL</Label>
              <Input
                id="website_url"
                type="url"
                value={formData.website_url}
                onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                placeholder="https://website.com"
              />
            </div>

          </div>

          {/* URL Whitelist */}
          <div className="space-y-2">
            <Label>Additional Allowed Origins</Label>
            <div className="flex gap-2">
              <Input
                value={newOrigin}
                onChange={(e) => setNewOrigin(e.target.value)}
                placeholder="https://example.com"
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOrigin();
                  }
                }}
              />
              <Button type="button" onClick={addOrigin} variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {allowedOrigins.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {allowedOrigins.map((origin) => (
                  <Badge
                    key={origin}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    {origin}
                    <button
                      type="button"
                      onClick={() => removeOrigin(origin)}
                      className="ml-1 hover:text-red-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-[#FF5800] to-purple-600"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create App"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

