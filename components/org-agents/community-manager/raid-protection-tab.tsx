/**
 * Raid Protection Tab
 *
 * Settings for protecting against mass join raids.
 */

"use client";

import { useState } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { AlertTriangle, Shield, Lock, Users } from "lucide-react";
import type { CommunityModerationSettings } from "@/db/schemas/org-agents";

interface RaidProtectionTabProps {
  settings: CommunityModerationSettings;
  onSave: (settings: Partial<CommunityModerationSettings>) => Promise<void>;
  isSaving: boolean;
}

export function RaidProtectionTab({
  settings,
  onSave,
  isSaving,
}: RaidProtectionTabProps) {
  const [raidProtectionEnabled, setRaidProtectionEnabled] = useState(
    settings.raidProtectionEnabled ?? false
  );
  const [joinRateLimitPerMinute, setJoinRateLimitPerMinute] = useState(
    settings.joinRateLimitPerMinute ?? 10
  );
  const [autoLockdownThreshold, setAutoLockdownThreshold] = useState(
    settings.autoLockdownThreshold ?? 20
  );
  const [lockdownDurationMinutes, setLockdownDurationMinutes] = useState(
    settings.lockdownDurationMinutes ?? 30
  );

  const handleSave = async () => {
    await onSave({
      raidProtectionEnabled,
      joinRateLimitPerMinute,
      autoLockdownThreshold,
      lockdownDurationMinutes,
    });
  };

  return (
    <div className="space-y-6">
      {/* Enable Raid Protection */}
      <BrandCard className="p-4">
        <CornerBrackets />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <h3 className="font-semibold">Raid Protection</h3>
          </div>
          <Toggle checked={raidProtectionEnabled} onChange={setRaidProtectionEnabled} />
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Automatically detect and respond to mass join attacks that could overwhelm your community.
        </p>

        {raidProtectionEnabled && (
          <div className="space-y-6 mt-4">
            {/* Join Rate Limiting */}
            <div className="space-y-4 p-4 bg-zinc-900/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                <h4 className="font-medium">Join Rate Limiting</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Limit how many new members can join per minute before triggering alerts.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Joins per Minute</label>
                <input
                  type="number"
                  value={joinRateLimitPerMinute}
                  onChange={(e) => setJoinRateLimitPerMinute(parseInt(e.target.value) || 10)}
                  min={1}
                  max={100}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  When this rate is exceeded, the bot will start alerting admins
                </p>
              </div>
            </div>

            {/* Auto Lockdown */}
            <div className="space-y-4 p-4 bg-zinc-900/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-red-500" />
                <h4 className="font-medium">Auto Lockdown</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Automatically lock the server when an extreme raid is detected.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Lockdown Threshold</label>
                  <input
                    type="number"
                    value={autoLockdownThreshold}
                    onChange={(e) => setAutoLockdownThreshold(parseInt(e.target.value) || 20)}
                    min={5}
                    max={200}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Joins per minute to trigger lockdown
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Lockdown Duration</label>
                  <input
                    type="number"
                    value={lockdownDurationMinutes}
                    onChange={(e) => setLockdownDurationMinutes(parseInt(e.target.value) || 30)}
                    min={1}
                    max={1440}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Minutes until auto-unlock
                  </p>
                </div>
              </div>
            </div>

            {/* What Happens During Lockdown */}
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-red-500" />
                <h4 className="font-medium text-red-500">During Lockdown</h4>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• New member joins are temporarily blocked</li>
                <li>• Admins are notified immediately</li>
                <li>• Recent joiners are logged for review</li>
                <li>• Server automatically unlocks after the set duration</li>
              </ul>
            </div>
          </div>
        )}
      </BrandCard>

      {raidProtectionEnabled && (
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
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

