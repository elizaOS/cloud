"use client";

import { type ReactNode, useState } from "react";
import { MiladyPoliciesSection } from "./milady-policies-section";
import { MiladyTransactionsSection } from "./milady-transactions-section";
import { MiladyWalletSection } from "./milady-wallet-section";

const TABS = ["Overview", "Wallet", "Transactions", "Policies"] as const;
type Tab = (typeof TABS)[number];

interface MiladyAgentTabsProps {
  agentId: string;
  children: ReactNode; // Overview content (server-rendered)
}

export function MiladyAgentTabs({ agentId, children }: MiladyAgentTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-white/10 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`relative shrink-0 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors ${
              activeTab === tab ? "text-[#FF5800]" : "text-white/40 hover:text-white/70"
            }`}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-[#FF5800]" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "Overview" && <>{children}</>}
        {activeTab === "Wallet" && <MiladyWalletSection agentId={agentId} />}
        {activeTab === "Transactions" && <MiladyTransactionsSection agentId={agentId} />}
        {activeTab === "Policies" && <MiladyPoliciesSection agentId={agentId} />}
      </div>
    </div>
  );
}
