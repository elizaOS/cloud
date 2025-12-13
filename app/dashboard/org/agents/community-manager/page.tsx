/**
 * Community Manager Agent Settings Page
 *
 * Dashboard page for configuring the community manager agent.
 * Provides moderation, token gating, raid protection, and logs.
 */

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { agentLifecycleService } from "@/lib/services/agent-lifecycle";
import { botsService } from "@/lib/services/bots";
import { CommunityManagerSettingsClient } from "./community-manager-client";
import type { CommunityModerationSettings } from "@/db/schemas/org-agents";

export default async function CommunityManagerSettingsPage() {
  const user = await requireAuth();

  if (!user.organization_id) {
    redirect("/dashboard");
  }

  // Get the community manager instance and config
  const instance = await agentLifecycleService.getInstance(
    user.organization_id,
    "community-manager"
  );

  let config = null;
  if (instance) {
    config = await agentLifecycleService.getConfig(instance.id);
  }

  // Get connected platforms for server selection
  const connections = await botsService.getConnections(user.organization_id);

  // Get servers for each connection
  const serversData = await Promise.all(
    connections.map(async (conn) => {
      const servers = await botsService.getServers(conn.id);
      return {
        connectionId: conn.id,
        platform: conn.platform,
        botName: conn.platform_bot_name ?? conn.platform_bot_username,
        servers: servers.map((s) => ({
          id: s.id,
          serverId: s.server_id,
          name: s.server_name ?? s.server_id,
          memberCount: s.member_count,
          enabled: s.enabled,
        })),
      };
    })
  );

  const settings: CommunityModerationSettings = (config?.community_settings as CommunityModerationSettings) ?? {};

  return (
    <div className="container max-w-4xl py-8">
      <Suspense fallback={<LoadingSkeleton />}>
        <CommunityManagerSettingsClient
          organizationId={user.organization_id}
          instanceId={instance?.id}
          settings={settings}
          platforms={serversData}
        />
      </Suspense>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-64 bg-zinc-800 rounded animate-pulse" />
      <div className="h-64 bg-zinc-800 rounded animate-pulse" />
      <div className="h-64 bg-zinc-800 rounded animate-pulse" />
    </div>
  );
}


