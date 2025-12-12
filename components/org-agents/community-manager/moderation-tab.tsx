/**
 * Moderation Tab
 *
 * Settings for anti-spam, anti-scam, link checking, and word filtering.
 */

"use client";

import { useState } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Shield, Link2, MessageSquareX, Plus, Trash2, AlertCircle } from "lucide-react";
import type { CommunityModerationSettings } from "@/db/schemas/org-agents";

interface ModerationTabProps {
  organizationId: string;
  serverId?: string;
  settings: CommunityModerationSettings;
  onSave: (settings: Partial<CommunityModerationSettings>) => Promise<void>;
  isSaving: boolean;
}

export function ModerationTab({
  organizationId,
  serverId,
  settings,
  onSave,
  isSaving,
}: ModerationTabProps) {
  // Anti-spam state
  const [antiSpamEnabled, setAntiSpamEnabled] = useState(settings.antiSpamEnabled ?? true);
  const [maxMessagesPerMinute, setMaxMessagesPerMinute] = useState(settings.maxMessagesPerMinute ?? 10);
  const [duplicateThreshold, setDuplicateThreshold] = useState(settings.duplicateThreshold ?? 3);
  const [spamAction, setSpamAction] = useState(settings.spamAction ?? "delete");

  // Anti-scam state
  const [antiScamEnabled, setAntiScamEnabled] = useState(settings.antiScamEnabled ?? true);
  const [blockKnownScamLinks, setBlockKnownScamLinks] = useState(settings.blockKnownScamLinks ?? true);
  const [scamAction, setScamAction] = useState(settings.scamAction ?? "delete");

  // Link checking state
  const [linkCheckingEnabled, setLinkCheckingEnabled] = useState(settings.linkCheckingEnabled ?? true);
  const [allowedDomains, setAllowedDomains] = useState<string[]>(settings.allowedDomains ?? []);
  const [blockedDomains, setBlockedDomains] = useState<string[]>(settings.blockedDomains ?? []);
  const [newAllowedDomain, setNewAllowedDomain] = useState("");
  const [newBlockedDomain, setNewBlockedDomain] = useState("");

  // Word filter state
  const [badWordFilterEnabled, setBadWordFilterEnabled] = useState(settings.badWordFilterEnabled ?? false);
  const [banWords, setBanWords] = useState<string[]>(settings.banWords ?? []);
  const [filterAction, setFilterAction] = useState(settings.filterAction ?? "delete");
  const [newBanWord, setNewBanWord] = useState("");

  // Escalation state
  const [escalationEnabled, setEscalationEnabled] = useState(settings.escalationEnabled ?? true);
  const [warnAfterViolations, setWarnAfterViolations] = useState(settings.warnAfterViolations ?? 1);
  const [timeoutAfterViolations, setTimeoutAfterViolations] = useState(settings.timeoutAfterViolations ?? 3);
  const [banAfterViolations, setBanAfterViolations] = useState(settings.banAfterViolations ?? 5);
  const [defaultTimeoutMinutes, setDefaultTimeoutMinutes] = useState(settings.defaultTimeoutMinutes ?? 10);

  const handleSave = async () => {
    await onSave({
      antiSpamEnabled,
      maxMessagesPerMinute,
      duplicateThreshold,
      spamAction,
      antiScamEnabled,
      blockKnownScamLinks,
      scamAction,
      linkCheckingEnabled,
      allowedDomains,
      blockedDomains,
      badWordFilterEnabled,
      banWords,
      filterAction,
      escalationEnabled,
      warnAfterViolations,
      timeoutAfterViolations,
      banAfterViolations,
      defaultTimeoutMinutes,
    });
  };

  const addAllowedDomain = () => {
    if (newAllowedDomain && !allowedDomains.includes(newAllowedDomain)) {
      setAllowedDomains([...allowedDomains, newAllowedDomain.toLowerCase()]);
      setNewAllowedDomain("");
    }
  };

  const addBlockedDomain = () => {
    if (newBlockedDomain && !blockedDomains.includes(newBlockedDomain)) {
      setBlockedDomains([...blockedDomains, newBlockedDomain.toLowerCase()]);
      setNewBlockedDomain("");
    }
  };

  const addBanWord = () => {
    if (newBanWord && !banWords.includes(newBanWord)) {
      setBanWords([...banWords, newBanWord.toLowerCase()]);
      setNewBanWord("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Anti-Spam Section */}
      <BrandCard className="p-4">
        <CornerBrackets />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-orange-500" />
            <h3 className="font-semibold">Anti-Spam</h3>
          </div>
          <Toggle checked={antiSpamEnabled} onChange={setAntiSpamEnabled} />
        </div>

        {antiSpamEnabled && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <NumberInput
                label="Max Messages/Minute"
                value={maxMessagesPerMinute}
                onChange={setMaxMessagesPerMinute}
                min={1}
                max={60}
              />
              <NumberInput
                label="Duplicate Threshold"
                value={duplicateThreshold}
                onChange={setDuplicateThreshold}
                min={2}
                max={10}
              />
            </div>
            <SelectInput
              label="Action on Spam"
              value={spamAction}
              onChange={(v) => setSpamAction(v as CommunityModerationSettings["spamAction"])}
              options={[
                { value: "warn", label: "Warn" },
                { value: "delete", label: "Delete Message" },
                { value: "timeout", label: "Timeout" },
              ]}
            />
          </div>
        )}
      </BrandCard>

      {/* Anti-Scam Section */}
      <BrandCard className="p-4">
        <CornerBrackets />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <h3 className="font-semibold">Anti-Scam</h3>
          </div>
          <Toggle checked={antiScamEnabled} onChange={setAntiScamEnabled} />
        </div>

        {antiScamEnabled && (
          <div className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Block Known Scam Links</label>
                <p className="text-xs text-muted-foreground">
                  Automatically block links from known scam domains
                </p>
              </div>
              <Toggle checked={blockKnownScamLinks} onChange={setBlockKnownScamLinks} />
            </div>
            <SelectInput
              label="Action on Scam Detection"
              value={scamAction}
              onChange={(v) => setScamAction(v as CommunityModerationSettings["scamAction"])}
              options={[
                { value: "warn", label: "Warn" },
                { value: "delete", label: "Delete Message" },
                { value: "timeout", label: "Timeout" },
                { value: "ban", label: "Ban" },
              ]}
            />
          </div>
        )}
      </BrandCard>

      {/* Link Checking Section */}
      <BrandCard className="p-4">
        <CornerBrackets />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-500" />
            <h3 className="font-semibold">Link Checking</h3>
          </div>
          <Toggle checked={linkCheckingEnabled} onChange={setLinkCheckingEnabled} />
        </div>

        {linkCheckingEnabled && (
          <div className="space-y-4 mt-4">
            {/* Allowed Domains */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Allowed Domains (Whitelist)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAllowedDomain}
                  onChange={(e) => setNewAllowedDomain(e.target.value)}
                  placeholder="example.com"
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && addAllowedDomain()}
                />
                <button
                  onClick={addAllowedDomain}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {allowedDomains.map((domain) => (
                  <span
                    key={domain}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-500 text-xs rounded-lg"
                  >
                    {domain}
                    <button
                      onClick={() => setAllowedDomains(allowedDomains.filter((d) => d !== domain))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Blocked Domains */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Blocked Domains (Blacklist)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBlockedDomain}
                  onChange={(e) => setNewBlockedDomain(e.target.value)}
                  placeholder="spam-site.com"
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && addBlockedDomain()}
                />
                <button
                  onClick={addBlockedDomain}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {blockedDomains.map((domain) => (
                  <span
                    key={domain}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-500 text-xs rounded-lg"
                  >
                    {domain}
                    <button
                      onClick={() => setBlockedDomains(blockedDomains.filter((d) => d !== domain))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </BrandCard>

      {/* Word Filter Section */}
      <BrandCard className="p-4">
        <CornerBrackets />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquareX className="h-5 w-5 text-yellow-500" />
            <h3 className="font-semibold">Word Filter</h3>
          </div>
          <Toggle checked={badWordFilterEnabled} onChange={setBadWordFilterEnabled} />
        </div>

        {badWordFilterEnabled && (
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Banned Words</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBanWord}
                  onChange={(e) => setNewBanWord(e.target.value)}
                  placeholder="Add word..."
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && addBanWord()}
                />
                <button
                  onClick={addBanWord}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {banWords.map((word) => (
                  <span
                    key={word}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500/10 text-yellow-500 text-xs rounded-lg"
                  >
                    {word}
                    <button onClick={() => setBanWords(banWords.filter((w) => w !== word))}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <SelectInput
              label="Action on Match"
              value={filterAction}
              onChange={(v) => setFilterAction(v as CommunityModerationSettings["filterAction"])}
              options={[
                { value: "delete", label: "Delete Message" },
                { value: "warn", label: "Warn" },
                { value: "timeout", label: "Timeout" },
              ]}
            />
          </div>
        )}
      </BrandCard>

      {/* Escalation Section */}
      <BrandCard className="p-4">
        <CornerBrackets />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-500" />
            <h3 className="font-semibold">Escalation</h3>
          </div>
          <Toggle checked={escalationEnabled} onChange={setEscalationEnabled} />
        </div>

        {escalationEnabled && (
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Automatically escalate actions based on violation count
            </p>
            <div className="grid grid-cols-2 gap-4">
              <NumberInput
                label="Warn After Violations"
                value={warnAfterViolations}
                onChange={setWarnAfterViolations}
                min={1}
                max={10}
              />
              <NumberInput
                label="Timeout After Violations"
                value={timeoutAfterViolations}
                onChange={setTimeoutAfterViolations}
                min={1}
                max={10}
              />
              <NumberInput
                label="Ban After Violations"
                value={banAfterViolations}
                onChange={setBanAfterViolations}
                min={1}
                max={20}
              />
              <NumberInput
                label="Default Timeout (minutes)"
                value={defaultTimeoutMinutes}
                onChange={setDefaultTimeoutMinutes}
                min={1}
                max={1440}
              />
            </div>
          </div>
        )}
      </BrandCard>

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium disabled:opacity-50"
      >
        {isSaving ? "Saving..." : "Save Settings"}
      </button>
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

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

function NumberInput({ label, value, onChange, min, max }: NumberInputProps) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        min={min}
        max={max}
        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
      />
    </div>
  );
}

interface SelectInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

function SelectInput({ label, value, onChange, options }: SelectInputProps) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

