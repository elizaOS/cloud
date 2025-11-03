"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
} from "@/components/ui/alert-dialog";
import { Play, Trash2, Edit, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface Voice {
  id: string;
  elevenlabsVoiceId: string;
  name: string;
  description: string | null;
  cloneType: "instant" | "professional";
  sampleCount: number;
  usageCount: number;
  isActive: boolean;
  createdAt: Date | string;
  lastUsedAt: Date | string | null;
  audioQualityScore: string | null;
  totalAudioDurationSeconds: number | null;
}

interface VoiceCardProps {
  voice: Voice;
  onDelete: (voiceId: string) => void;
  onPreview: (voice: Voice) => void;
}

export function VoiceCard({ voice, onDelete, onPreview }: VoiceCardProps) {
  const router = useRouter();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/elevenlabs/voices/${voice.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete voice");
      }

      toast.success("Voice deleted successfully");
      onDelete(voice.id);
      setIsDeleteDialogOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete voice",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUseInTTS = () => {
    // Navigate to text page with voice selected
    router.push(`/dashboard/eliza?voiceId=${voice.elevenlabsVoiceId}`);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <CardTitle className="truncate">{voice.name}</CardTitle>
              <CardDescription className="line-clamp-2 mt-1">
                {voice.description || "No description"}
              </CardDescription>
            </div>
            <Badge
              variant={voice.cloneType === "instant" ? "default" : "secondary"}
              className="ml-2 shrink-0"
            >
              {voice.cloneType === "instant" ? "Instant" : "Professional"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Usage</p>
              <p className="font-medium">{voice.usageCount} times</p>
            </div>
            <div>
              <p className="text-muted-foreground">Samples</p>
              <p className="font-medium">{voice.sampleCount} files</p>
            </div>
            {voice.audioQualityScore && (
              <div>
                <p className="text-muted-foreground">Quality</p>
                <p className="font-medium">{voice.audioQualityScore}/10</p>
              </div>
            )}
            {voice.totalAudioDurationSeconds && (
              <div>
                <p className="text-muted-foreground">Duration</p>
                <p className="font-medium">
                  {formatDuration(voice.totalAudioDurationSeconds)}
                </p>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
            <p>
              Created{" "}
              {formatDistanceToNow(new Date(voice.createdAt), {
                addSuffix: true,
              })}
            </p>
            {voice.lastUsedAt && (
              <p>
                Last used{" "}
                {formatDistanceToNow(new Date(voice.lastUsedAt), {
                  addSuffix: true,
                })}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPreview(voice)}
              className="flex-1"
            >
              <Play className="mr-2 h-4 w-4" />
              Preview
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleUseInTTS}
              className="flex-1"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Use in TTS
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsDeleteDialogOpen(true)}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Voice Clone?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{voice.name}&quot;? This
              action cannot be undone and the voice will be permanently removed
              from both Eliza Cloud and ElevenLabs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Voice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
