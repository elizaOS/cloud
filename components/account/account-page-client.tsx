"use client";

import { useSetPageHeader } from "@/components/layout/page-header-context";
import { ProfileForm } from "./profile-form";
import { OrganizationInfo } from "./organization-info";
import { AccountDetails } from "./account-details";
import { SecurityPreferences } from "./security-preferences";
import type { UserWithOrganization } from "@/lib/types";

interface AccountPageClientProps {
  user: UserWithOrganization;
}

export function AccountPageClient({ user }: AccountPageClientProps) {
  useSetPageHeader({
    title: "Account Settings",
    description: "Manage your account preferences and profile information",
  });

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
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
