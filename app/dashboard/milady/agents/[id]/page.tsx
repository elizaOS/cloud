/**
 * Milady Agent Detail Page
 *
 * Shows comprehensive information for a specific AI agent sandbox:
 * - Status, timestamps, error messages
 * - User-facing Milady actions and Web UI access
 * - Admin-only infrastructure details, SSH access, and Docker logs
 */

import { Badge } from "@elizaos/cloud-ui";
import { AlertCircle, ArrowLeft, Cloud, ExternalLink, Server, Terminal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthWithOrg } from "@/lib/auth";
import { statusBadgeColor, statusDotColor } from "@/lib/constants/sandbox-status";
import { getPreferredMiladyAgentWebUiUrl } from "@/lib/milady-web-ui";
import { adminService } from "@/lib/services/admin";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { MiladyAgentActions } from "@/packages/ui/src/components/containers/agent-actions";
import { DockerLogsViewer } from "@/packages/ui/src/components/containers/docker-logs-viewer";
import { MiladyBackupsPanel } from "@/packages/ui/src/components/containers/milady-backups-panel";
import { MiladyConnectButton } from "@/packages/ui/src/components/containers/milady-connect-button";
import { MiladyLogsViewer } from "@/packages/ui/src/components/containers/milady-logs-viewer";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Agent ${id.slice(0, 8)} — Milady`,
    robots: { index: false, follow: false },
  };
}

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(date: Date | string | null): string {
  if (!date) return "";
  return new Date(date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatRelativeShort(date: Date | string | null): string {
  if (!date) return "Never";
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return formatDate(date);
}

export default async function MiladyAgentDetailPage({ params }: PageProps) {
  const user = await requireAuthWithOrg();
  const { id } = await params;

  // Milady sandboxes table may not exist in all environments — redirect gracefully
  let agent: Awaited<ReturnType<typeof miladySandboxService.getAgent>>;
  try {
    agent = await miladySandboxService.getAgent(id, user.organization_id);
  } catch {
    redirect("/dashboard/milady");
  }
  if (!agent) {
    redirect("/dashboard/milady");
  }

  // Check admin for log access
  const isAdmin = await adminService.isUserAdmin(user.id).catch(() => false);

  const isDockerBacked = !!agent.node_id;
  const webUiUrl = getPreferredMiladyAgentWebUiUrl(agent);
  const sshCommand = agent.headscale_ip ? `ssh root@${agent.headscale_ip}` : null;

  const badgeColor = statusBadgeColor(agent.status);
  const dotColor = statusDotColor(agent.status);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Back nav ── */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/milady"
          className="group flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
        >
          <div className="flex items-center justify-center w-7 h-7 border border-white/10 bg-black/40 group-hover:border-[#FF5800]/40 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
          </div>
          <span>Milady Instances</span>
        </Link>

        {webUiUrl && agent.status === "running" && <MiladyConnectButton agentId={agent.id} />}
      </div>

      {/* ── Agent header ── */}
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-12 h-12 border border-[#FF5800]/25 bg-[#FF5800]/10 shrink-0">
            {isDockerBacked ? (
              <Server className="h-6 w-6 text-[#FF5800]" />
            ) : (
              <Cloud className="h-6 w-6 text-[#FF5800]" />
            )}
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1
                className="text-2xl font-semibold text-white truncate"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                {agent.agent_name ?? "Unnamed Agent"}
              </h1>
              <Badge variant="outline" className={`${badgeColor} text-xs font-medium px-2 py-0.5`}>
                <span className={`inline-block size-1.5 rounded-full mr-1.5 ${dotColor}`} />
                {agent.status}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-white/35">
              <span className="font-mono tabular-nums">{agent.id}</span>
              <span className="inline-flex items-center gap-1">
                {isDockerBacked ? <Server className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
                {isDockerBacked ? "Docker" : "Sandbox"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Key info strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/5 border border-white/10">
        <div className="bg-black/60 p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Status</p>
          <p
            className="text-lg font-medium text-white capitalize tabular-nums"
            style={{ fontFamily: "var(--font-roboto-mono)" }}
          >
            {agent.status}
          </p>
        </div>
        <div className="bg-black/60 p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Database</p>
          <p
            className="text-lg font-medium text-white tabular-nums"
            style={{ fontFamily: "var(--font-roboto-mono)" }}
          >
            {agent.database_status === "ready"
              ? "Connected"
              : agent.database_status === "provisioning"
                ? "Setting up"
                : agent.database_status === "none"
                  ? "None"
                  : "Error"}
          </p>
        </div>
        <div className="bg-black/60 p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Created</p>
          <p
            className="text-lg font-medium text-white tabular-nums"
            style={{ fontFamily: "var(--font-roboto-mono)" }}
          >
            {formatDate(agent.created_at)}
          </p>
          <p className="text-[10px] text-white/30 tabular-nums">{formatTime(agent.created_at)}</p>
        </div>
        <div className="bg-black/60 p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Last Heartbeat</p>
          <p
            className="text-lg font-medium text-white tabular-nums"
            style={{ fontFamily: "var(--font-roboto-mono)" }}
          >
            {formatRelativeShort(agent.last_heartbeat_at)}
          </p>
          {agent.last_heartbeat_at && (
            <p className="text-[10px] text-white/30 tabular-nums">
              {formatDate(agent.last_heartbeat_at)}
            </p>
          )}
        </div>
      </div>

      {/* ── Error message ── */}
      {agent.error_message && (
        <div className="flex items-start gap-3 p-4 bg-red-950/20 border border-red-500/20">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-red-400">
              Error ({agent.error_count} occurrence{agent.error_count !== 1 ? "s" : ""})
            </p>
            <p className="text-sm text-red-400/70">{agent.error_message}</p>
          </div>
        </div>
      )}

      {/* ── Docker infrastructure (admin) ── */}
      {isAdmin && isDockerBacked && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-block size-2 bg-[#FF5800]" />
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-white/60">
              Infrastructure
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5 border border-white/10">
            <InfoCell label="Node" value={agent.node_id ?? "—"} mono />
            <InfoCell label="Container" value={agent.container_name ?? "—"} mono />
            <InfoCell label="Docker Image" value={agent.docker_image ?? "—"} mono />
            {agent.headscale_ip && (
              <InfoCell label="VPN IP" value={agent.headscale_ip} mono accent="emerald" />
            )}
            {agent.bridge_port && (
              <InfoCell label="Bridge Port" value={String(agent.bridge_port)} mono />
            )}
            {agent.web_ui_port && (
              <InfoCell label="Web UI Port" value={String(agent.web_ui_port)} mono />
            )}
          </div>

          {webUiUrl && (
            <div className="border border-white/10 bg-black/40 px-4 py-3 flex items-center gap-3 text-sm">
              <span className="text-[11px] uppercase tracking-widest text-white/35 shrink-0">
                Web UI
              </span>
              <span className="text-white/50 font-mono text-xs break-all">{webUiUrl}</span>
            </div>
          )}
        </section>
      )}

      {/* ── SSH access (admin) ── */}
      {isAdmin && sshCommand && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-block size-2 bg-[#FF5800]" />
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-white/60">
              SSH Access
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3 px-4 py-3 border border-white/10 bg-black/60">
              <Terminal className="h-4 w-4 text-emerald-400 shrink-0" />
              <code
                className="text-sm text-emerald-400 font-mono flex-1"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                {sshCommand}
              </code>
            </div>
            {agent.bridge_port && (
              <div className="flex items-center gap-3 px-4 py-3 border border-white/10 bg-black/60">
                <Terminal className="h-4 w-4 text-blue-400 shrink-0" />
                <code
                  className="text-sm text-blue-400 font-mono flex-1"
                  style={{ fontFamily: "var(--font-roboto-mono)" }}
                >
                  {`curl http://${agent.headscale_ip}:${agent.bridge_port}/health`}
                </code>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Vercel sandbox info (admin) ── */}
      {isAdmin && !isDockerBacked && agent.bridge_url && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-block size-2 bg-[#FF5800]" />
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-white/60">
              Sandbox Connection
            </p>
          </div>

          <div className="border border-white/10 bg-black/40 px-4 py-3 flex items-start gap-3">
            <span className="text-[11px] uppercase tracking-widest text-white/35 shrink-0 pt-0.5">
              Bridge URL
            </span>
            <a
              href={agent.bridge_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#FF5800] hover:text-[#FF5800]/70 flex items-center gap-1 transition-colors font-mono break-all"
            >
              {agent.bridge_url}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        </section>
      )}

      {/* ── Actions card ── */}
      <MiladyAgentActions agentId={agent.id} status={agent.status} webUiUrl={webUiUrl} />

      {/* ── Backups / history ── */}
      <MiladyBackupsPanel
        agentId={agent.id}
        agentName={agent.agent_name ?? "Unnamed Agent"}
        status={agent.status}
      />

      {/* ── User-facing app logs ── */}
      <MiladyLogsViewer
        agentId={agent.id}
        agentName={agent.agent_name ?? "Unnamed Agent"}
        status={agent.status}
        showAdvancedHint={isAdmin && isDockerBacked}
      />

      {/* ── Admin: Docker Logs ── */}
      {isAdmin && isDockerBacked && agent.container_name && agent.node_id && (
        <DockerLogsViewer
          sandboxId={agent.id}
          containerName={agent.container_name}
          nodeId={agent.node_id}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------

function InfoCell({
  label,
  value,
  mono = false,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: "emerald" | "blue" | "orange";
}) {
  const valueColor =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "blue"
        ? "text-blue-400"
        : accent === "orange"
          ? "text-orange-400"
          : "text-white/80";

  return (
    <div className="bg-black/60 p-4 space-y-1 min-w-0">
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p
        className={`text-sm font-medium ${valueColor} break-all ${mono ? "font-mono" : ""}`}
        style={mono ? { fontFamily: "var(--font-roboto-mono)" } : undefined}
      >
        {value}
      </p>
    </div>
  );
}
