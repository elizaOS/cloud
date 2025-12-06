/**
 * Profile form component for updating user profile information.
 * Supports name, avatar upload, email updates, and displays organization role.
 *
 * @param props - Profile form configuration
 * @param props.user - User data with organization information
 */

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateProfile, uploadAvatar, updateEmail } from "@/app/actions/users";
import { Loader2, Upload, User, Mail, Shield } from "lucide-react";
import type { UserWithOrganization } from "@/lib/types";
import { toast } from "sonner";
import { BrandCard, BrandButton, CornerBrackets } from "@/components/brand";

interface ProfileFormProps {
  user: UserWithOrganization;
}

export function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [emailAdded, setEmailAdded] = useState(false);

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
    setIsUploadingAvatar(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateProfile(formData);

      if (result.success) {
        setSuccess(result.message || "Profile updated successfully");
        toast.success(result.message || "Profile updated successfully");
        router.refresh();
      } else {
        setError(result.error || "Failed to update profile");
        toast.error(result.error || "Failed to update profile");
      }
    });
  };

  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsUpdatingEmail(true);

    const formData = new FormData(e.currentTarget);

    const result = await updateEmail(formData);

    if (result.success) {
      setSuccess(result.message || "Email added successfully");
      toast.success(result.message || "Email added successfully");
      setEmailAdded(true); // Optimistically hide the form
      router.refresh();
    } else {
      setError(result.error || "Failed to add email");
      toast.error(result.error || "Failed to add email");
    }
    setIsUpdatingEmail(false);
  };

  return (
    <BrandCard className="relative">
      <CornerBrackets size="sm" className="opacity-50" />

      <div className="relative z-10 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <User className="h-5 w-5 text-[#FF5800]" />
            <h3 className="text-lg font-bold text-white">
              Profile Information
            </h3>
          </div>
          <p className="text-sm text-white/60">
            Update your profile information and manage your account settings
          </p>
        </div>

        {/* Email Section - Separate from main form to avoid nesting */}
        {!user.email && !emailAdded && (
          <div className="space-y-2 p-4 border border-amber-500/40 bg-amber-500/5 rounded-none">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="h-4 w-4 text-amber-400" />
              <label
                htmlFor="new-email"
                className="text-xs font-medium text-amber-400 uppercase tracking-wide"
              >
                Add Email Address
              </label>
            </div>
            <p className="text-xs text-white/60 mb-3">
              Adding an email allows you to receive important notifications and
              updates.
            </p>
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <Input
                id="new-email"
                name="email"
                type="email"
                placeholder="your@email.com"
                disabled={isUpdatingEmail}
                required
                className="rounded-none border-white/20 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
              />
              <BrandButton
                type="submit"
                variant="primary"
                size="sm"
                disabled={isUpdatingEmail}
                className="w-full"
              >
                {isUpdatingEmail ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding Email...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Add Email Address
                  </>
                )}
              </BrandButton>
            </form>
          </div>
        )}

        {user.email && (
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-xs font-medium text-white/70 uppercase tracking-wide flex items-center gap-2"
            >
              <Mail className="h-4 w-4" />
              Email Address
            </label>
            <Input
              id="email"
              type="email"
              value={user.email}
              disabled
              className="rounded-none border-white/10 bg-black/60 text-white/50"
            />
            <p className="text-xs text-white/50">
              Email cannot be changed. Please contact support if you need to
              update this.
            </p>
          </div>
        )}

        {emailAdded && !user.email && (
          <div className="space-y-2 p-4 border border-green-500/40 bg-green-500/5 rounded-none">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-green-400" />
              <p className="text-sm font-medium text-green-400">
                Email Added Successfully!
              </p>
            </div>
            <p className="text-xs text-white/60">
              Your email has been added and will appear here after the page
              refreshes.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-6 border-b border-white/10">
            <Avatar className="h-20 w-20 ring-2 ring-[#FF5800]">
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
                <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                  Profile Picture
                </label>
                <p className="text-xs text-white/50 mt-1">
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
                <BrandButton
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
                </BrandButton>
              </div>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="text-xs font-medium text-white/70 uppercase tracking-wide"
              >
                Full Name <span className="text-rose-400">*</span>
              </label>
              <Input
                id="name"
                name="name"
                type="text"
                defaultValue={user.name || ""}
                placeholder="Enter your full name"
                required
                maxLength={100}
                disabled={isPending}
                className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              />
            </div>

            {user.wallet_address && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-white/70 uppercase tracking-wide flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Wallet Address
                </label>
                <Input
                  type="text"
                  value={user.wallet_address}
                  disabled
                  className="rounded-none border-white/10 bg-black/60 text-white/50 font-mono text-xs"
                />
                {user.wallet_chain_type && (
                  <p className="text-xs text-white/50 capitalize">
                    Connected via {user.wallet_chain_type} wallet
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="avatar"
                className="text-xs font-medium text-white/70 uppercase tracking-wide"
              >
                Avatar URL (Optional)
              </label>
              <Input
                id="avatar"
                name="avatar"
                type="url"
                defaultValue={user.avatar || ""}
                placeholder="https://example.com/avatar.jpg"
                disabled={isPending}
                className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              />
              <p className="text-xs text-white/50">
                Or use the upload button above to add a profile picture.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-white/70 uppercase tracking-wide flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Role
              </label>
              <Input
                type="text"
                value={user.role}
                disabled
                className="rounded-none border-white/10 bg-black/60 text-white/50 capitalize"
              />
              <p className="text-xs text-white/50">
                Your role in the organization. Contact an admin to change this.
              </p>
            </div>
          </div>

          {/* Messages */}
          {error && (
            <Alert
              variant="destructive"
              className="rounded-none border-rose-500/40 bg-rose-500/10"
            >
              <AlertDescription className="text-rose-400">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="rounded-none border-green-500/40 bg-green-500/10">
              <AlertDescription className="text-green-400">
                {success}
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4">
            <BrandButton type="submit" variant="primary" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </BrandButton>
            <BrandButton
              type="button"
              variant="outline"
              onClick={() => router.refresh()}
              disabled={isPending}
            >
              Cancel
            </BrandButton>
          </div>
        </form>
      </div>
    </BrandCard>
  );
}
