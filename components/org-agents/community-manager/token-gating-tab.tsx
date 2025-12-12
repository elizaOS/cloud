/**
 * Token Gating Tab
 *
 * Settings for token-based access control and role assignment.
 */

"use client";

import { useState, useEffect } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Coins, Plus, Trash2, Edit, Check, X, ExternalLink } from "lucide-react";
import type { CommunityModerationSettings } from "@/db/schemas/org-agents";
import type { OrgTokenGate } from "@/db/schemas/org-community-moderation";

interface TokenGatingTabProps {
  organizationId: string;
  serverId?: string;
  settings: CommunityModerationSettings;
  onSave: (settings: Partial<CommunityModerationSettings>) => Promise<void>;
  isSaving: boolean;
}

interface TokenGateForm {
  name: string;
  description: string;
  chain: OrgTokenGate["chain"];
  tokenType: OrgTokenGate["token_type"];
  tokenAddress: string;
  minBalance: string;
  discordRoleId: string;
  removeOnFail: boolean;
}

const CHAINS: Array<{ value: OrgTokenGate["chain"]; label: string }> = [
  { value: "solana", label: "Solana" },
  { value: "ethereum", label: "Ethereum" },
  { value: "base", label: "Base" },
  { value: "polygon", label: "Polygon" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "optimism", label: "Optimism" },
];

const TOKEN_TYPES: Array<{ value: OrgTokenGate["token_type"]; label: string }> = [
  { value: "token", label: "Fungible Token" },
  { value: "nft", label: "NFT" },
  { value: "nft_collection", label: "NFT Collection" },
];

const DEFAULT_FORM: TokenGateForm = {
  name: "",
  description: "",
  chain: "solana",
  tokenType: "token",
  tokenAddress: "",
  minBalance: "1",
  discordRoleId: "",
  removeOnFail: true,
};

export function TokenGatingTab({
  organizationId,
  serverId,
  settings,
  onSave,
  isSaving,
}: TokenGatingTabProps) {
  const [tokenGatingEnabled, setTokenGatingEnabled] = useState(
    settings.tokenGatingEnabled ?? false
  );
  const [verificationChannelId, setVerificationChannelId] = useState(
    settings.verificationChannelId ?? ""
  );
  const [verificationMessage, setVerificationMessage] = useState(
    settings.verificationMessage ?? ""
  );
  const [verifiedRoleId, setVerifiedRoleId] = useState(settings.verifiedRoleId ?? "");

  const [tokenGates, setTokenGates] = useState<OrgTokenGate[]>([]);
  const [isLoadingGates, setIsLoadingGates] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<TokenGateForm>(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch token gates
  useEffect(() => {
    if (serverId) {
      fetchTokenGates();
    }
  }, [serverId]);

  const fetchTokenGates = async () => {
    if (!serverId) return;
    setIsLoadingGates(true);
    
    const res = await fetch(
      `/api/v1/org/moderation/token-gates?serverId=${serverId}`
    );
    if (res.ok) {
      const data = await res.json();
      setTokenGates(data.tokenGates ?? []);
    }
    
    setIsLoadingGates(false);
  };

  const handleSaveSettings = async () => {
    await onSave({
      tokenGatingEnabled,
      verificationChannelId,
      verificationMessage,
      verifiedRoleId,
    });
  };

  const handleCreateGate = async () => {
    if (!serverId) return;
    setIsSubmitting(true);

    const res = await fetch("/api/v1/org/moderation/token-gates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverId,
        ...formData,
      }),
    });

    if (res.ok) {
      setFormData(DEFAULT_FORM);
      setShowAddForm(false);
      fetchTokenGates();
    }

    setIsSubmitting(false);
  };

  const handleDeleteGate = async (gateId: string) => {
    const res = await fetch(`/api/v1/org/moderation/token-gates/${gateId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setTokenGates(tokenGates.filter((g) => g.id !== gateId));
    }
  };

  const handleToggleGate = async (gateId: string, enabled: boolean) => {
    const res = await fetch(`/api/v1/org/moderation/token-gates/${gateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });

    if (res.ok) {
      setTokenGates(
        tokenGates.map((g) => (g.id === gateId ? { ...g, enabled } : g))
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Enable Token Gating */}
      <BrandCard className="p-4">
        <CornerBrackets />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-orange-500" />
            <h3 className="font-semibold">Token Gating</h3>
          </div>
          <Toggle checked={tokenGatingEnabled} onChange={setTokenGatingEnabled} />
        </div>

        {tokenGatingEnabled && (
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Verification Channel ID</label>
              <input
                type="text"
                value={verificationChannelId}
                onChange={(e) => setVerificationChannelId(e.target.value)}
                placeholder="Enter Discord channel ID"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Channel where verification instructions will be posted
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Verified Role ID</label>
              <input
                type="text"
                value={verifiedRoleId}
                onChange={(e) => setVerifiedRoleId(e.target.value)}
                placeholder="Enter Discord role ID"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Role assigned to members who pass verification
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Verification Message</label>
              <textarea
                value={verificationMessage}
                onChange={(e) => setVerificationMessage(e.target.value)}
                placeholder="Welcome! Please verify your wallet to access the community..."
                className="w-full min-h-[80px] px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
              />
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        )}
      </BrandCard>

      {/* Token Gates List */}
      {tokenGatingEnabled && (
        <BrandCard className="p-4">
          <CornerBrackets />
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Token Gate Rules</h3>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              Add Rule
            </button>
          </div>

          {/* Add Form */}
          {showAddForm && (
            <div className="mb-6 p-4 bg-zinc-900 rounded-lg border border-zinc-800 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., Holder Access"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Chain</label>
                  <select
                    value={formData.chain}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        chain: e.target.value as OrgTokenGate["chain"],
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm"
                  >
                    {CHAINS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Token Type</label>
                  <select
                    value={formData.tokenType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tokenType: e.target.value as OrgTokenGate["token_type"],
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm"
                  >
                    {TOKEN_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Min Balance</label>
                  <input
                    type="text"
                    value={formData.minBalance}
                    onChange={(e) =>
                      setFormData({ ...formData, minBalance: e.target.value })
                    }
                    placeholder="1"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Token Address</label>
                <input
                  type="text"
                  value={formData.tokenAddress}
                  onChange={(e) =>
                    setFormData({ ...formData, tokenAddress: e.target.value })
                  }
                  placeholder="Enter token contract address"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm font-mono"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Discord Role ID</label>
                <input
                  type="text"
                  value={formData.discordRoleId}
                  onChange={(e) =>
                    setFormData({ ...formData, discordRoleId: e.target.value })
                  }
                  placeholder="Role to assign when requirements are met"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="removeOnFail"
                  checked={formData.removeOnFail}
                  onChange={(e) =>
                    setFormData({ ...formData, removeOnFail: e.target.checked })
                  }
                  className="rounded"
                />
                <label htmlFor="removeOnFail" className="text-sm">
                  Remove role if balance drops below minimum
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setFormData(DEFAULT_FORM);
                  }}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGate}
                  disabled={isSubmitting || !formData.name || !formData.tokenAddress}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Rule"}
                </button>
              </div>
            </div>
          )}

          {/* Gates List */}
          {isLoadingGates ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading token gates...
            </div>
          ) : tokenGates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No token gate rules configured
            </div>
          ) : (
            <div className="space-y-3">
              {tokenGates.map((gate) => (
                <div
                  key={gate.id}
                  className={`p-4 rounded-lg border ${
                    gate.enabled
                      ? "bg-zinc-900/50 border-zinc-800"
                      : "bg-zinc-900/20 border-zinc-800/50 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{gate.name}</span>
                        <span className="text-xs px-2 py-0.5 bg-zinc-800 rounded">
                          {gate.chain}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-zinc-800 rounded">
                          {gate.token_type}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground font-mono">
                        {gate.token_address.slice(0, 8)}...{gate.token_address.slice(-6)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Min: {gate.min_balance} • Role: {gate.discord_role_id || "None"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Toggle
                        checked={gate.enabled}
                        onChange={(enabled) => handleToggleGate(gate.id, enabled)}
                      />
                      <button
                        onClick={() => handleDeleteGate(gate.id)}
                        className="p-2 hover:bg-zinc-800 rounded-lg text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </BrandCard>
      )}
    </div>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-orange-500" : "bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

