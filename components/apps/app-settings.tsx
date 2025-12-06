/**
 * App settings component for editing app configuration.
 * Supports updating app details, allowed origins, and app deletion.
 *
 * @param props - App settings configuration
 * @param props.app - App data to edit
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { App } from "@/db/schemas";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Loader2, Trash2, Plus, X, Save } from "lucide-react";
import { toast } from "sonner";

interface AppSettingsProps {
  app: App;
}

export function AppSettings({ app }: AppSettingsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [allowedOrigins, setAllowedOrigins] = useState<string[]>(
    (app.allowed_origins as string[]) || []
  );
  const [newOrigin, setNewOrigin] = useState("");

  const [formData, setFormData] = useState({
    name: app.name,
    description: app.description || "",
    app_url: app.app_url,
    website_url: app.website_url || "",
    contact_email: app.contact_email || "",
    is_active: app.is_active,
  });

  const handleSave = async () => {
    setIsLoading(true);
    const response = await fetch(`/api/v1/apps/${app.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...formData,
        allowed_origins: allowedOrigins,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update app");
    }

    toast.success("App updated successfully");
    router.refresh();
    setIsLoading(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const response = await fetch(`/api/v1/apps/${app.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to delete app");
    }

    toast.success("App deleted successfully");
    router.push("/dashboard/apps");
    router.refresh();
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
    <div className="space-y-6">
      {/* Basic Settings */}
      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10 space-y-4">
          <h2 className="text-xl font-semibold text-white">Basic Settings</h2>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">App Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Awesome App"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="A brief description of your app..."
                rows={3}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="app_url">App URL</Label>
                <Input
                  id="app_url"
                  type="url"
                  value={formData.app_url}
                  onChange={(e) =>
                    setFormData({ ...formData, app_url: e.target.value })
                  }
                  placeholder="https://myapp.com"
                />
              </div>

              <div>
                <Label htmlFor="website_url">Website URL</Label>
                <Input
                  id="website_url"
                  type="url"
                  value={formData.website_url}
                  onChange={(e) =>
                    setFormData({ ...formData, website_url: e.target.value })
                  }
                  placeholder="https://website.com"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="contact_email">Contact Email</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) =>
                  setFormData({ ...formData, contact_email: e.target.value })
                }
                placeholder="contact@myapp.com"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
              <div>
                <Label htmlFor="is_active">Active Status</Label>
                <p className="text-xs text-white/60 mt-1">
                  Inactive apps cannot make API requests
                </p>
              </div>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
            </div>
          </div>
        </div>
      </BrandCard>

      {/* Allowed Origins */}
      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10 space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Allowed Origins</h2>
            <p className="text-sm text-white/60 mt-1">
              API requests are only accepted from these domains
            </p>
          </div>

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
            <div className="flex flex-wrap gap-2">
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
      </BrandCard>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isLoading}
          className="bg-gradient-to-r from-[#FF5800] to-purple-600"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Danger Zone */}
      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10 space-y-4">
          <h2 className="text-xl font-semibold text-red-400">Danger Zone</h2>

            <div className="flex items-center justify-between p-4 bg-red-500/10 rounded-lg border border-red-500/20">
              <div>
                <p className="font-semibold text-white">Delete App</p>
                <p className="text-xs text-white/60 mt-1">
                Permanently delete this app and all associated data
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-red-500/20 text-red-400 hover:bg-red-500/10"
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete App?</AlertDialogTitle>
                    <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete
                    <strong className="text-white"> {app.name}</strong> and all
                    associated data.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Delete App
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
          </div>
        </div>
      </BrandCard>
    </div>
  );
}
