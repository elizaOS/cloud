"use client";

import { useState } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import type { UserWithOrganization } from "@/lib/types";
import { Users, Settings } from "lucide-react";
import { MembersTab } from "@/components/organization/members-tab";
import { OrganizationGeneralTab } from "@/components/organization/organization-general-tab";
import {
  BrandTabs,
  BrandTabsList,
  BrandTabsTrigger,
  BrandTabsContent,
} from "@/components/brand";

interface OrganizationTabProps {
  user: UserWithOrganization;
}

export function OrganizationTab({ user }: OrganizationTabProps) {
  const [activeTab, setActiveTab] = useState("members");

  if (!user.organization) {
    return (
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />
        <div className="relative z-10 text-center py-12">
          <p className="text-white/60">No organization found</p>
        </div>
      </BrandCard>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Organization Overview Card */}
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              {user.organization.name}
            </h2>
            <p className="text-sm text-white/60 mt-1">
              {user.organization.slug}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-2xl font-bold text-white">
                {user.organization.credit_balance.toLocaleString()}
              </p>
              <p className="text-xs text-white/50 uppercase tracking-wide">
                Credits Available
              </p>
            </div>
          </div>
        </div>
      </BrandCard>

      {/* Tabs */}
      <BrandTabs
        id="organization-tabs"
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <BrandTabsList className="w-full max-w-md">
          <BrandTabsTrigger
            value="members"
            className="flex items-center gap-2 flex-1"
          >
            <Users className="h-4 w-4" />
            <span>Members</span>
          </BrandTabsTrigger>
          <BrandTabsTrigger
            value="general"
            className="flex items-center gap-2 flex-1"
          >
            <Settings className="h-4 w-4" />
            <span>General</span>
          </BrandTabsTrigger>
        </BrandTabsList>

        <BrandTabsContent value="members" className="mt-6">
          <MembersTab user={user} />
        </BrandTabsContent>

        <BrandTabsContent value="general" className="mt-6">
          <OrganizationGeneralTab organization={user.organization} />
        </BrandTabsContent>
      </BrandTabs>
    </div>
  );
}
