"use client";

import {
  User,
  Building2,
  BarChart3,
  CreditCard,
  Key,
  PieChart,
} from "lucide-react";
import type { SettingsTab } from "./settings-page-client";

interface SettingsTabsProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

const tabs = [
  { id: "general" as const, label: "General", icon: User },
  { id: "account" as const, label: "Account", icon: Building2 },
  { id: "usage" as const, label: "Usage", icon: BarChart3 },
  { id: "billing" as const, label: "Billing", icon: CreditCard },
  { id: "apis" as const, label: "APIs", icon: Key },
  { id: "analytics" as const, label: "Analytics", icon: PieChart },
  { id: "organization" as const, label: "Organization", icon: Building2 },
];

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  return (
    <div className="border-l border-t border-brand-surface flex items-start w-full overflow-x-auto">
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const isLast = index === tabs.length - 1;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`
              flex items-center justify-center gap-2 px-6 py-3 
              border-b border-r border-brand-surface 
              transition-all duration-200
              ${
                isActive
                  ? "bg-[rgba(255,255,255,0.07)] border-b-2 border-b-white"
                  : "hover:bg-[rgba(255,255,255,0.03)]"
              }
              ${isLast ? "" : ""}
            `}
          >
            <Icon
              className={`h-4 w-4 ${isActive ? "text-white" : "text-[#A2A2A2]"}`}
            />
            <span
              className={`
                text-sm font-medium font-mono tracking-tight
                ${isActive ? "text-white" : "text-[#A2A2A2]"}
              `}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
