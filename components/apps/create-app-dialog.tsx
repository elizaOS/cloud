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
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface CreateAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAppDialog({ open, onOpenChange }: CreateAppDialogProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
  const [newOrigin, setNewOrigin] = useState("");
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    app_url: "",
    website_url: "",
    contact_email: "",
    generate_affiliate_code: false,
    features: {
      chat: true,
      image: false,
      video: false,
      voice: false,
      agents: false,
      embedding: false,
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/v1/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          allowed_origins: allowedOrigins.length > 0 ? allowedOrigins : [formData.app_url],
          features_enabled: formData.features,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create app");
      }

      const data = await response.json();
      
      toast.success("App created successfully!", {
        description: "Your API key has been generated. Make sure to save it securely.",
      });

      // Redirect to the new app's page
      router.push(`/dashboard/apps/${data.app.id}?showApiKey=${data.apiKey}`);
      router.refresh();
      
      onOpenChange(false);
      
      // Reset form
      setFormData({
        name: "",
        description: "",
        app_url: "",
        website_url: "",
        contact_email: "",
        generate_affiliate_code: false,
        features: {
          chat: true,
          image: false,
          video: false,
          voice: false,
          agents: false,
          embedding: false,
        },
      });
      setAllowedOrigins([]);
    } catch (error) {
      console.error("Error creating app:", error);
      toast.error("Failed to create app", {
        description: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsLoading(false);
    }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New App</DialogTitle>
          <DialogDescription>
            Create an app to integrate Eliza Cloud services into your website or application.
            You'll receive an API key for authentication.
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
                placeholder="https://myapp.com"
                required
              />
              <p className="text-xs text-white/60 mt-1">
                Primary URL where your app is hosted
              </p>
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

            <div>
              <Label htmlFor="contact_email">Contact Email</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                placeholder="contact@myapp.com"
              />
            </div>
          </div>

          {/* URL Whitelist */}
          <div className="space-y-2">
            <Label>Allowed Origins (URL Whitelist)</Label>
            <p className="text-xs text-white/60">
              Specify which domains can make requests with your API key. Leave empty to only allow the app URL.
            </p>
            
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

          {/* Features */}
          <div className="space-y-3">
            <Label>Enabled Features</Label>
            <p className="text-xs text-white/60">
              Select which Eliza Cloud features this app can access
            </p>
            
            <div className="grid grid-cols-2 gap-3">
              {Object.entries({
                chat: "Chat & Text Generation",
                image: "Image Generation",
                video: "Video Generation",
                voice: "Voice Cloning",
                agents: "Agent Runtime",
                embedding: "Embeddings",
              }).map(([key, label]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`feature-${key}`}
                    checked={formData.features[key as keyof typeof formData.features]}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        features: {
                          ...formData.features,
                          [key]: checked,
                        },
                      })
                    }
                  />
                  <Label htmlFor={`feature-${key}`} className="text-sm">
                    {label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Affiliate Code */}
          <div className="flex items-center justify-between p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
            <div className="flex-1">
              <Label htmlFor="affiliate">Generate Affiliate Code</Label>
              <p className="text-xs text-white/60 mt-1">
                Create a unique referral code to track user signups from your app
              </p>
            </div>
            <Switch
              id="affiliate"
              checked={formData.generate_affiliate_code}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, generate_affiliate_code: checked })
              }
            />
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

