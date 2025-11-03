"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { Users, Settings } from "lucide-react";
import type { UserWithOrganization } from "@/lib/types";
import { MembersTab } from "./members-tab";
import { OrganizationGeneralTab } from "./organization-general-tab";
import {
  BrandTabs,
  BrandTabsList,
  BrandTabsTrigger,
  BrandTabsContent,
  BrandCard,
  CornerBrackets,
} from "@/components/brand";

interface OrganizationPageClientProps {
  user: UserWithOrganization;
}

export function OrganizationPageClient({ user }: OrganizationPageClientProps) {
  const [activeTab, setActiveTab] = useState("members");

  useSetPageHeader({
    title: "Organization Settings",
    description: `Manage ${user.organization.name}`,
  });

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
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
