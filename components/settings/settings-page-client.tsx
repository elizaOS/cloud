"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import type { UserWithOrganization } from "@/lib/types";
import { SettingsTabs } from "./settings-tabs";
import {
  GeneralTab,
  AccountTab,
  UsageTab,
  BillingTab,
  ApisTab,
  AnalyticsTab,
} from "./tabs";

interface SettingsPageClientProps {
  user: UserWithOrganization;
}

export type SettingsTab =
  | "general"
  | "account"
  | "usage"
  | "billing"
  | "apis"
  | "analytics";

export function SettingsPageClient({ user }: SettingsPageClientProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  useSetPageHeader({
    title: "Settings",
    description: `Welcome back, ${user.name || user.email || "User"}!`,
  });

  const renderTabContent = () => {
    switch (activeTab) {
      case "general":
        return <GeneralTab user={user} />;
      case "account":
        return <AccountTab user={user} onTabChange={setActiveTab} />;
      case "usage":
        return <UsageTab user={user} />;
      case "billing":
        return <BillingTab user={user} />;
      case "apis":
        return <ApisTab user={user} />;
      case "analytics":
        return <AnalyticsTab user={user} />;
      default:
        return <GeneralTab user={user} />;
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl">
      {/* Tab Navigation */}
      <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
      <div className="w-full">{renderTabContent()}</div>
    </div>
  );
}
