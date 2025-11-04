"use client";

import { BrandCard, CornerBrackets } from "@/components/brand";
import type { UserWithOrganization } from "@/lib/types";
import { Plus, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface ApisTabProps {
  user: UserWithOrganization;
}

interface ApiKey {
  id: string;
  name: string;
  secretKey: string;
  created: string;
  lastUsed: string;
  createdBy: string;
  permissions: string;
}

export function ApisTab({ user }: ApisTabProps) {
  // Mock data - replace with real API data
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([
    {
      id: "1",
      name: "everydayprotocols",
      secretKey: "sk-...L-IA",
      created: "sep 24, 2025",
      lastUsed: "sep 24, 2025",
      createdBy: "Diogo Ribeiro",
      permissions: "All",
    },
    {
      id: "2",
      name: "everydayprotocols",
      secretKey: "sk-...L-IA",
      created: "sep 24, 2025",
      lastUsed: "sep 24, 2025",
      createdBy: "Diogo Ribeiro",
      permissions: "All",
    },
    {
      id: "3",
      name: "everydayprotocols",
      secretKey: "sk-...L-IA",
      created: "sep 24, 2025",
      lastUsed: "sep 24, 2025",
      createdBy: "Diogo Ribeiro",
      permissions: "All",
    },
  ]);

  const handleCreateNewKey = () => {
    // Create new API key logic
    toast.info("Create new API key functionality coming soon");
  };

  const handleCopyKey = async (secretKey: string) => {
    try {
      await navigator.clipboard.writeText(secretKey);
      toast.success("API key copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy API key");
    }
  };

  const handleDeleteKey = (keyId: string) => {
    // Delete API key logic
    toast.info("Delete API key functionality coming soon");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* API Keys Card */}
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />

        <div className="relative z-10 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between w-full">
            <div className="flex flex-col gap-2 max-w-[850px]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
                <h3 className="text-base font-mono text-[#e1e1e1] uppercase">
                  API keys
                </h3>
              </div>
              <div className="text-sm font-mono text-[#858585] tracking-tight space-y-2">
                <p>
                  You have permission to view and manage all API Keys in this
                  project.
                </p>
                <p>
                  Do not share your API Key with others or expose it in the
                  browser or other client-side code. To protect your
                  account&apos;s security,Eliza may automatically disable any
                  API Key that has leaked publicly.
                </p>
                <p>
                  View usage per Key on the{" "}
                  <span className="underline cursor-pointer hover:text-white transition-colors">
                    Usage page
                  </span>
                  .
                </p>
              </div>
            </div>

            {/* Create New Key Button */}
            <button
              type="button"
              onClick={handleCreateNewKey}
              className="relative bg-[#e1e1e1] px-3 py-2 overflow-hidden hover:bg-white transition-colors flex items-center gap-2"
            >
              <div
                className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                style={{
                  backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                  backgroundSize: "2.915576934814453px 2.915576934814453px",
                }}
              />
              <Plus className="relative z-10 h-[18px] w-[18px] text-black" />
              <span className="relative z-10 text-black font-mono font-medium text-base">
                Create new secret key
              </span>
            </button>
          </div>

          {/* API Keys Table */}
          <div className="space-y-0 w-full">
            {apiKeys.map((apiKey, index) => (
              <div key={apiKey.id} className="flex w-full">
                {/* Name Column */}
                <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface flex-[1.1] p-4 space-y-1">
                  <p className="text-sm font-mono text-white uppercase">
                    Name
                  </p>
                  <p className="text-sm text-white/60">{apiKey.name}</p>
                </div>

                {/* Secret Key Column */}
                <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t border-r border-b border-brand-surface flex-1 p-4 space-y-1">
                  <p className="text-sm font-mono text-white uppercase">
                    Secret Key
                  </p>
                  <p className="text-sm text-white/60">{apiKey.secretKey}</p>
                </div>

                {/* Created Column */}
                <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t border-r border-b border-brand-surface flex-1 p-4 space-y-1">
                  <p className="text-sm font-mono text-white uppercase">
                    Created
                  </p>
                  <p className="text-sm text-white/60">{apiKey.created}</p>
                </div>

                {/* Last Used Column */}
                <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border-t border-r border-b border-brand-surface flex-1 p-4 space-y-1">
                  <p className="text-sm font-mono text-white uppercase">
                    Last used
                  </p>
                  <p className="text-sm text-white/60">{apiKey.lastUsed}</p>
                </div>

                {/* Created By Column */}
                <div className="backdrop-blur-sm border-t border-r border-b border-brand-surface flex-1 p-4 space-y-1">
                  <p className="text-sm font-mono text-white uppercase">
                    Created by
                  </p>
                  <p className="text-sm text-white/60">{apiKey.createdBy}</p>
                </div>

                {/* Permissions Column */}
                <div className="backdrop-blur-sm border-t border-r border-b border-brand-surface flex-1 p-4 space-y-1">
                  <p className="text-sm font-mono text-white uppercase">
                    Permissions
                  </p>
                  <p className="text-sm text-white/60">{apiKey.permissions}</p>
                </div>

                {/* Actions Column */}
                <div className="backdrop-blur-sm border-t border-r border-b border-brand-surface w-[92px] p-4 flex items-end justify-center">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleCopyKey(apiKey.secretKey)}
                      className="hover:opacity-80 transition-opacity"
                      title="Copy API key"
                    >
                      <Copy className="h-4 w-4 text-[#A2A2A2]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteKey(apiKey.id)}
                      className="hover:opacity-80 transition-opacity"
                      title="Delete API key"
                    >
                      <Trash2 className="h-4 w-4 text-[#EB4335]" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </BrandCard>
    </div>
  );
}
