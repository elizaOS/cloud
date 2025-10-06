import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { ProfileForm } from "@/components/account/profile-form";
import { OrganizationInfo } from "@/components/account/organization-info";
import { AccountDetails } from "@/components/account/account-details";
import { SecurityPreferences } from "@/components/account/security-preferences";
import { Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Account Settings",
  description:
    "Manage your account preferences, profile, and security settings",
};

export default async function AccountPage() {
  const user = await requireAuth();

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Account Settings</h1>
            <p className="text-muted-foreground mt-1">
              Manage your account preferences and profile information
            </p>
          </div>
        </div>
      </div>

      {/* Welcome Message */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm">
              Welcome back,{" "}
              <span className="font-semibold">{user.name || user.email}</span>!
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              You&apos;re part of{" "}
              <span className="font-medium">{user.organization.name}</span>{" "}
              organization
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Profile Form */}
        <div className="space-y-6">
          <ProfileForm user={user} />
        </div>

        {/* Right Column - Additional Info */}
        <div className="space-y-6">
          <OrganizationInfo organization={user.organization} />
          <AccountDetails user={user} />
        </div>
      </div>

      {/* Full Width - Security Preferences */}
      <div className="w-full">
        <SecurityPreferences />
      </div>
    </div>
  );
}
