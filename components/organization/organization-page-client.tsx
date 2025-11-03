"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Settings } from "lucide-react";
import type { UserWithOrganization } from "@/lib/types";
import { MembersTab } from "./members-tab";
import { OrganizationGeneralTab } from "./organization-general-tab";

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
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold">{user.organization.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {user.organization.slug}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-2xl font-bold">
                {user.organization.credit_balance.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Credits Available</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Members</span>
          </TabsTrigger>
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>General</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-6">
          <MembersTab user={user} />
        </TabsContent>

        <TabsContent value="general" className="mt-6">
          <OrganizationGeneralTab organization={user.organization} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
