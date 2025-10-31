"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateProfile, uploadAvatar } from "@/app/actions/users";
import { Loader2, Upload, User, Mail, Shield } from "lucide-react";
import type { UserWithOrganization } from "@/lib/types";
import { toast } from "sonner";

interface ProfileFormProps {
  user: UserWithOrganization;
}

export function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const getInitials = (
    name: string | null,
    email: string | null,
    walletAddress: string | null,
  ) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    if (walletAddress) {
      return walletAddress.slice(0, 2).toUpperCase();
    }
    return "U";
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const result = await uploadAvatar(formData);

      if (result.success) {
        toast.success(result.message || "Avatar uploaded successfully");
        router.refresh();
      } else {
        setError(result.error || "Failed to upload avatar");
        toast.error(result.error || "Failed to upload avatar");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to upload avatar";
      setError(message);
      toast.error(message);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const result = await updateProfile(formData);

        if (result.success) {
          setSuccess(result.message || "Profile updated successfully");
          toast.success(result.message || "Profile updated successfully");
          router.refresh();
        } else {
          setError(result.error || "Failed to update profile");
          toast.error(result.error || "Failed to update profile");
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred";
        setError(message);
        toast.error(message);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Profile Information
        </CardTitle>
        <CardDescription>
          Update your profile information and manage your account settings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-6 border-b">
            <Avatar className="h-20 w-20 ring-2 ring-border">
              <AvatarImage
                src={user.avatar || undefined}
                alt={
                  user.name ||
                  user.email ||
                  (user.wallet_address
                    ? `${user.wallet_address.substring(0, 6)}...${user.wallet_address.substring(user.wallet_address.length - 4)}`
                    : "User")
                }
              />
              <AvatarFallback className="text-lg">
                {getInitials(user.name, user.email, user.wallet_address)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <div>
                <Label className="text-sm font-medium">Profile Picture</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG or WEBP. Max 5MB.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="avatar-upload"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleAvatarUpload}
                  disabled={isUploadingAvatar}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploadingAvatar}
                  onClick={() =>
                    document.getElementById("avatar-upload")?.click()
                  }
                >
                  {isUploadingAvatar ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload New
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                defaultValue={user.name || ""}
                placeholder="Enter your full name"
                required
                maxLength={100}
                disabled={isPending}
              />
            </div>

            {user.email && (
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={user.email}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed. Please contact support if you need to
                  update this.
                </p>
              </div>
            )}

            {user.wallet_address && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Wallet Address
                </Label>
                <Input
                  type="text"
                  value={user.wallet_address}
                  disabled
                  className="bg-muted font-mono text-xs"
                />
                {user.wallet_chain_type && (
                  <p className="text-xs text-muted-foreground capitalize">
                    Connected via {user.wallet_chain_type} wallet
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="avatar">Avatar URL (Optional)</Label>
              <Input
                id="avatar"
                name="avatar"
                type="url"
                defaultValue={user.avatar || ""}
                placeholder="https://example.com/avatar.jpg"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Or use the upload button above to add a profile picture.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Role
              </Label>
              <Input
                type="text"
                value={user.role}
                disabled
                className="bg-muted capitalize"
              />
              <p className="text-xs text-muted-foreground">
                Your role in the organization. Contact an admin to change this.
              </p>
            </div>
          </div>

          {/* Messages */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-500/50 text-green-700 dark:text-green-400">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.refresh()}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
