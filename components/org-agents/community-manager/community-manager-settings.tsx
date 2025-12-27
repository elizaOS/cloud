/**
 * Community Manager Agent Settings
 *
 * Main settings component for configuring the community manager agent.
 * Provides tabs for moderation, token gating, raid protection, and logs.
 */

"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandCard, CornerBrackets } from "@/components/brand";
import {
  Shield,
  Coins,
  AlertTriangle,
  ScrollText,
  Settings,
  MessageSquare,
} from "lucide-react";
import { ModerationTab } from "./moderation-tab";
import { TokenGatingTab } from "./token-gating-tab";
import { RaidProtectionTab } from "./raid-protection-tab";
import { LogsTab } from "./logs-tab";
import type { CommunityModerationSettings } from "@/db/schemas/org-agents";

interface CommunityManagerSettingsProps {
  organizationId: string;
  serverId?: string;
  settings: CommunityModerationSettings;
  onSettingsChange: (settings: CommunityModerationSettings) => Promise<void>;
}

type SettingsTab =
  | "moderation"
  | "token-gating"
  | "raid-protection"
  | "logs"
  | "general";

export function CommunityManagerSettings({
  organizationId,
  serverId,
  settings,
  onSettingsChange,
}: CommunityManagerSettingsProps) {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("section") as SettingsTab | null;
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    tabFromUrl ?? "general",
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (
    newSettings: Partial<CommunityModerationSettings>,
  ) => {
    setIsSaving(true);
    await onSettingsChange({ ...settings, ...newSettings });
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      <BrandCard className="p-6">
        <CornerBrackets />
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-orange-500/10">
            <Shield className="h-6 w-6 text-orange-500" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">
              Community Manager Settings
            </h2>
            <p className="text-sm text-muted-foreground">
              Configure moderation, token gating, and community protection
            </p>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as SettingsTab)}
        >
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger value="moderation" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Moderation</span>
            </TabsTrigger>
            <TabsTrigger
              value="token-gating"
              className="flex items-center gap-2"
            >
              <Coins className="h-4 w-4" />
              <span className="hidden sm:inline">Token Gate</span>
            </TabsTrigger>
            <TabsTrigger
              value="raid-protection"
              className="flex items-center gap-2"
            >
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Raid</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" />
              <span className="hidden sm:inline">Logs</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <GeneralSettings
              settings={settings}
              onSave={handleSave}
              isSaving={isSaving}
            />
          </TabsContent>

          <TabsContent value="moderation">
            <ModerationTab
              organizationId={organizationId}
              serverId={serverId}
              settings={settings}
              onSave={handleSave}
              isSaving={isSaving}
            />
          </TabsContent>

          <TabsContent value="token-gating">
            <TokenGatingTab
              organizationId={organizationId}
              serverId={serverId}
              settings={settings}
              onSave={handleSave}
              isSaving={isSaving}
            />
          </TabsContent>

          <TabsContent value="raid-protection">
            <RaidProtectionTab
              settings={settings}
              onSave={handleSave}
              isSaving={isSaving}
            />
          </TabsContent>

          <TabsContent value="logs">
            <LogsTab organizationId={organizationId} serverId={serverId} />
          </TabsContent>
        </Tabs>
      </BrandCard>
    </div>
  );
}

// =============================================================================
// General Settings Sub-component
// =============================================================================

interface GeneralSettingsProps {
  settings: CommunityModerationSettings;
  onSave: (settings: Partial<CommunityModerationSettings>) => Promise<void>;
  isSaving: boolean;
}

function GeneralSettings({ settings, onSave, isSaving }: GeneralSettingsProps) {
  const [greetNewMembers, setGreetNewMembers] = useState(
    settings.greetNewMembers ?? false,
  );
  const [greetingMessage, setGreetingMessage] = useState(
    settings.greetingMessage ?? "",
  );
  const [logModerationActions, setLogModerationActions] = useState(
    settings.logModerationActions ?? true,
  );
  const [logMemberJoins, setLogMemberJoins] = useState(
    settings.logMemberJoins ?? false,
  );
  const [logMemberLeaves, setLogMemberLeaves] = useState(
    settings.logMemberLeaves ?? false,
  );

  const handleSave = async () => {
    await onSave({
      greetNewMembers,
      greetingMessage,
      logModerationActions,
      logMemberJoins,
      logMemberLeaves,
    });
  };

  return (
    <div className="space-y-6">
      {/* Welcome Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Welcome Settings
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium">Greet New Members</label>
              <p className="text-sm text-muted-foreground">
                Send a welcome message when new members join
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={greetNewMembers}
              onClick={() => setGreetNewMembers(!greetNewMembers)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                greetNewMembers ? "bg-orange-500" : "bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  greetNewMembers ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {greetNewMembers && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Greeting Message</label>
              <textarea
                value={greetingMessage}
                onChange={(e) => setGreetingMessage(e.target.value)}
                placeholder="Welcome to the community, {user}! 🎉"
                className="w-full min-h-[100px] p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use {"{user}"} to mention the new member
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Logging Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          Logging
        </h3>

        <div className="space-y-3">
          <ToggleSetting
            label="Log Moderation Actions"
            description="Log all moderation actions to the log channel"
            checked={logModerationActions}
            onChange={setLogModerationActions}
          />
          <ToggleSetting
            label="Log Member Joins"
            description="Log when new members join the server"
            checked={logMemberJoins}
            onChange={setLogMemberJoins}
          />
          <ToggleSetting
            label="Log Member Leaves"
            description="Log when members leave the server"
            checked={logMemberLeaves}
            onChange={setLogMemberLeaves}
          />
        </div>
      </div>

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

interface ToggleSettingProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
}: ToggleSettingProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <label className="font-medium">{label}</label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
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
    </div>
  );
}
