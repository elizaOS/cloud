/**
 * Submit to Gallery Dialog
 *
 * Dialog for submitting projects (agents, apps, MCPs) to the community gallery.
 * Includes form validation, preview, and submission handling.
 */
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandButton } from "@/components/brand";
import { Bot, AppWindow, Wrench, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  submitToGallery,
  isProjectInGallery,
} from "@/app/actions/community-gallery";
import type { GalleryProjectType } from "@/db/schemas/gallery-submissions";

const GALLERY_CATEGORIES = [
  { value: "ai-assistant", label: "AI Assistant" },
  { value: "defi-trading", label: "DeFi / Trading" },
  { value: "social-community", label: "Social / Community" },
  { value: "productivity", label: "Productivity" },
  { value: "creative-art", label: "Creative / Art" },
  { value: "gaming", label: "Gaming" },
  { value: "data-analytics", label: "Data / Analytics" },
  { value: "developer-tools", label: "Developer Tools" },
  { value: "other", label: "Other" },
];

const PROJECT_TYPE_CONFIG: Record<
  GalleryProjectType,
  { label: string; icon: typeof Bot }
> = {
  agent: { label: "AI Agent", icon: Bot },
  app: { label: "Web App", icon: AppWindow },
  mcp: { label: "MCP Service", icon: Wrench },
};

interface SubmitToGalleryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectType: GalleryProjectType;
  projectId: string;
  projectName: string;
  projectDescription?: string;
  projectImage?: string;
  onSuccess?: () => void;
}

export function SubmitToGalleryDialog({
  open,
  onOpenChange,
  projectType,
  projectId,
  projectName,
  projectDescription = "",
  projectImage,
  onSuccess,
}: SubmitToGalleryDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  const [title, setTitle] = useState(projectName);
  const [description, setDescription] = useState(projectDescription);
  const [category, setCategory] = useState<string>("");
  const [tags, setTags] = useState<string>("");

  const config = PROJECT_TYPE_CONFIG[projectType];
  const TypeIcon = config.icon;

  // Check if already submitted when dialog opens
  const handleOpenChange = async (newOpen: boolean) => {
    if (newOpen) {
      setIsChecking(true);
      const isSubmitted = await isProjectInGallery(projectType, projectId);
      setAlreadySubmitted(isSubmitted);
      setIsChecking(false);

      // Reset form
      setTitle(projectName);
      setDescription(projectDescription);
      setCategory("");
      setTags("");
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    if (!description.trim()) {
      toast.error("Please enter a description");
      return;
    }

    setIsLoading(true);

    try {
      await submitToGallery({
        projectType,
        projectId,
        title: title.trim(),
        description: description.trim(),
        previewImageUrl: projectImage,
        category: category || undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });

      toast.success("Successfully submitted to the gallery!");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TypeIcon className="w-5 h-5 text-[#FF5800]" />
            Submit to Gallery
          </DialogTitle>
          <DialogDescription>
            Share your {config.label.toLowerCase()} with the Eliza Cloud
            community.
          </DialogDescription>
        </DialogHeader>

        {isChecking ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-white/50" />
          </div>
        ) : alreadySubmitted ? (
          <div className="py-6 text-center">
            <div className="rounded-full bg-yellow-500/20 border border-yellow-500/40 p-3 w-fit mx-auto mb-4">
              <Upload className="w-6 h-6 text-yellow-500" />
            </div>
            <p className="text-white font-medium mb-2">Already Submitted</p>
            <p className="text-white/50 text-sm">
              This {config.label.toLowerCase()} has already been submitted to
              the gallery.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give your project a catchy title"
                maxLength={100}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what your project does and why it's useful"
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-white/40">
                {description.length}/500 characters
              </p>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Category (optional)</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {GALLERY_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (optional)</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="trading, ai, automation (comma separated)"
              />
              <p className="text-xs text-white/40">
                Add tags to help others find your project
              </p>
            </div>

            {/* Preview Image Notice */}
            {projectImage && (
              <div className="p-3 bg-white/5 border border-white/10 rounded">
                <p className="text-xs text-white/60">
                  Your project's current image will be used as the gallery
                  preview.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <BrandButton
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </BrandButton>
          {!alreadySubmitted && !isChecking && (
            <BrandButton
              variant="primary"
              onClick={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Submit to Gallery
                </>
              )}
            </BrandButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
