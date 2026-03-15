/**
 * Milady Agent Detail Page
 *
 * Shows comprehensive information for a specific AI agent sandbox:
 * - Status, timestamps, error messages
 * - User-facing Milady actions and Web UI access
 * - Admin-only infrastructure details, SSH access, and Docker logs
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Server,
  Cloud,
  Network,
  Terminal,
  Clock,
  AlertCircle,
  ExternalLink,
  Database,
  Cpu,
  Activity,
} from "lucide-react";
import { requireAuthWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { adminService } from "@/lib/services/admin";
import { BrandCard, BrandButton } from "@elizaos/ui";
import { Badge } from "@elizaos/ui";
import { DockerLogsViewer } from "@/components/containers/docker-logs-viewer";
import { MiladyAgentActions } from "@/components/containers/agent-actions";
import { MiladyBackupsPanel } from "@/components/containers/milady-backups-panel";
import { MiladyConnectButton } from "@/components/containers/milady-connect-button";
import { MiladyLogsViewer } from "@/components/containers/milady-logs-viewer";
import { getPreferredMiladyAgentWebUiUrl } from "@/lib/milady-web-ui";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Agent ${id.slice(0, 8)} — Containers`,
    robots: { index: false, follow: false },
  };
}

const STATUS_COLORS: Record<string, string> = {
  running: "bg-green-500",
  provisioning: "bg-blue-500",
  pending: "bg-yellow-500",
  stopped: "bg-gray-500",
  disconnected: "bg-orange-500",
  error: "bg-red-500",
};

function getStatusColor(status: string) {
  return STATUS_COLORS[status] ?? "bg-gray-500";
}

export default async function MiladyAgentDetailPage({ params }: PageProps) {
  const user = await requireAuthWithOrg();
  const { id } = await params;

  // Milady sandboxes table may not exist in all environments — redirect gracefully
  let agent;
  try {
    agent = await miladySandboxService.getAgent(id, user.organization_id);
  } catch {
    redirect("/dashboard/containers");
  }
  if (!agent) {
    redirect("/dashboard/containers");
  }

  // Check admin for log access
  const isAdmin = await adminService.isUserAdmin(user.id).catch(() => false);

  const isDockerBacked = !!agent.node_id;
  const webUiUrl = getPreferredMiladyAgentWebUiUrl(agent);

  const sshCommand = agent.headscale_ip
    ? `ssh root@${agent.headscale_ip}`
    : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── Back nav ── */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <Link
          href="/dashboard/containers"
          className="group flex items-center gap-2 text-sm text-white/70 hover:text-white transition-all duration-200"
          style={{ fontFamily: "var(--font-roboto-mono)" }}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-none border border-white/10 bg-black/40 group-hover:bg-white/5 group-hover:border-[#FF5800]/50 transition-all duration-200">
            <ArrowLeft className="h-4 w-4" />
          </div>
          <span className="font-medium">Back to Containers</span>
        </Link>

        {webUiUrl && agent.status === "running" && (
          <MiladyConnectButton agentId={agent.id} />
        )}
      </div>

      {/* ── Header card ── */}
      <BrandCard className="relative shadow-lg shadow-black/50" cornerSize="sm">
        <div className="relative z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-none border border-[#FF5800]/30 bg-[#FF5800]/10">
              {isDockerBacked ? (
                <Server className="h-7 w-7 text-[#FF5800]" />
              ) : (
                <Cloud className="h-7 w-7 text-[#FF5800]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-block w-2 h-2 rounded-full bg-[#FF5800]" />
                <h1
                  className="text-3xl font-normal tracking-tight text-white truncate"
                  style={{ fontFamily: "var(--font-roboto-mono)" }}
                >
                  {agent.agent_name ?? "Unnamed Agent"}
                </h1>
                {isDockerBacked ? (
                  <Badge
                    variant="outline"
                    className="border-blue-500/40 text-blue-400 bg-blue-500/10 text-xs flex items-center gap-1"
                  >
                    <Server className="h-3 w-3" />
                    Docker
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-purple-500/40 text-purple-400 bg-purple-500/10 text-xs flex items-center gap-1"
                  >
                    <Cloud className="h-3 w-3" />
                    Sandbox
                  </Badge>
                )}
              </div>
              <p
                className="text-sm text-white/50 font-mono"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                {agent.id}
              </p>
            </div>
          </div>
        </div>
      </BrandCard>

      {/* ── Stats grid ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Status */}
        <BrandCard
          className="relative shadow-md shadow-black/30"
          corners={false}
        >
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 rounded-none bg-blue-500/10 border border-blue-500/20">
                <Activity className="h-5 w-5 text-blue-500" />
              </div>
              <Badge
                className={`${getStatusColor(agent.status)} text-white rounded-none`}
              >
                {agent.status}
              </Badge>
            </div>
            <p
              className="text-sm font-medium text-white/60 uppercase tracking-wider"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              Status
            </p>
            <p
              className="text-2xl font-medium mt-1 capitalize text-white"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              {agent.status}
            </p>
          </div>
        </BrandCard>

        {/* Database */}
        <BrandCard
          className="relative shadow-md shadow-black/30"
          corners={false}
        >
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 rounded-none bg-purple-500/10 border border-purple-500/20">
                <Database className="h-5 w-5 text-purple-500" />
              </div>
              <Badge
                className={`${agent.database_status === "ready" ? "bg-green-500" : agent.database_status === "provisioning" ? "bg-yellow-500" : "bg-gray-500"} text-white rounded-none text-xs`}
              >
                {agent.database_status}
              </Badge>
            </div>
            <p
              className="text-sm font-medium text-white/60 uppercase tracking-wider"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              Database
            </p>
            <p
              className="text-lg font-medium mt-1 text-white"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              {agent.database_status === "ready"
                ? "Connected"
                : agent.database_status === "provisioning"
                  ? "Setting up"
                  : agent.database_status === "none"
                    ? "Not configured"
                    : "Error"}
            </p>
          </div>
        </BrandCard>

        {/* Created */}
        <BrandCard
          className="relative shadow-md shadow-black/30"
          corners={false}
        >
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 rounded-none bg-amber-500/10 border border-amber-500/20">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
            </div>
            <p
              className="text-sm font-medium text-white/60 uppercase tracking-wider"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              Created
            </p>
            <p
              className="text-lg font-medium mt-1 text-white"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              {new Date(agent.created_at).toLocaleDateString()}
            </p>
            <p className="text-xs text-white/50 mt-1">
              {new Date(agent.created_at).toLocaleTimeString()}
            </p>
          </div>
        </BrandCard>

        {/* Last Heartbeat */}
        <BrandCard
          className="relative shadow-md shadow-black/30"
          corners={false}
        >
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 rounded-none bg-emerald-500/10 border border-emerald-500/20">
                <Cpu className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
            <p
              className="text-sm font-medium text-white/60 uppercase tracking-wider"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              Last Heartbeat
            </p>
            <p
              className="text-lg font-medium mt-1 text-white"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              {agent.last_heartbeat_at
                ? new Date(agent.last_heartbeat_at).toLocaleTimeString()
                : "Never"}
            </p>
            {agent.last_heartbeat_at && (
              <p className="text-xs text-white/50 mt-1">
                {new Date(agent.last_heartbeat_at).toLocaleDateString()}
              </p>
            )}
          </div>
        </BrandCard>
      </div>

      {/* ── Error message ── */}
      {agent.error_message && (
        <div className="p-4 bg-red-950/30 border border-red-500/30 rounded-none">
          <div className="flex items-start gap-3">
            <div className="p-1 bg-red-500/10 rounded-none border border-red-500/20">
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
            <div className="flex-1">
              <p
                className="font-medium text-red-400 mb-1"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                Error ({agent.error_count} occurrence
                {agent.error_count !== 1 ? "s" : ""})
              </p>
              <p className="text-sm text-red-400/80">{agent.error_message}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Docker infrastructure ── */}
      {isAdmin && isDockerBacked && (
        <BrandCard
          className="relative shadow-lg shadow-black/50"
          cornerSize="md"
        >
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-2 pb-4 border-b border-white/10">
              <span className="inline-block w-2 h-2 rounded-full bg-[#FF5800]" />
              <h2
                className="text-xl font-normal text-white"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                Docker Infrastructure
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Node */}
              <InfoBlock
                icon={<Server className="h-5 w-5 text-blue-400" />}
                label="Node"
                value={agent.node_id ?? "—"}
                mono
              />

              {/* Container Name */}
              <InfoBlock
                icon={<Terminal className="h-5 w-5 text-white/60" />}
                label="Container Name"
                value={agent.container_name ?? "—"}
                mono
              />

              {/* Docker Image */}
              <InfoBlock
                icon={<Cpu className="h-5 w-5 text-purple-400" />}
                label="Docker Image"
                value={agent.docker_image ?? "—"}
                mono
              />

              {/* VPN IP */}
              {agent.headscale_ip && (
                <InfoBlock
                  icon={<Network className="h-5 w-5 text-green-400" />}
                  label="VPN IP (Headscale)"
                  value={agent.headscale_ip}
                  mono
                  highlight="green"
                />
              )}

              {/* Bridge Port */}
              {agent.bridge_port && (
                <InfoBlock
                  icon={<Activity className="h-5 w-5 text-yellow-400" />}
                  label="Bridge Port"
                  value={String(agent.bridge_port)}
                  mono
                />
              )}

              {/* Web UI Port */}
              {agent.web_ui_port && (
                <InfoBlock
                  icon={<ExternalLink className="h-5 w-5 text-[#FF5800]" />}
                  label="Web UI Port"
                  value={String(agent.web_ui_port)}
                  mono
                />
              )}
            </div>

            {/* Connect URL */}
            {webUiUrl && (
              <div className="flex items-start gap-3 pt-2 border-t border-white/10">
                <p
                  className="text-sm font-medium text-white/60 min-w-[140px] uppercase tracking-wider pt-1"
                  style={{ fontFamily: "var(--font-roboto-mono)" }}
                >
                  Web UI URL
                </p>
                <span
                  className="text-sm text-white/50 flex items-center gap-1 break-all"
                  style={{ fontFamily: "var(--font-roboto-mono)" }}
                >
                  {webUiUrl}
                </span>
              </div>
            )}
          </div>
        </BrandCard>
      )}

      {/* ── SSH connection info ── */}
      {isAdmin && sshCommand && (
        <BrandCard
          className="relative shadow-lg shadow-black/50"
          cornerSize="md"
        >
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2 pb-4 border-b border-white/10">
              <span className="inline-block w-2 h-2 rounded-full bg-[#FF5800]" />
              <h2
                className="text-xl font-normal text-white"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                SSH Access
              </h2>
            </div>
            <p className="text-sm text-white/60">
              Connect to this container via the Headscale VPN:
            </p>
            <div className="flex items-center gap-3 p-4 rounded-none border border-white/10 bg-black/60">
              <Terminal className="h-4 w-4 text-green-400 shrink-0" />
              <code
                className="text-sm text-green-400 font-mono flex-1"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                {sshCommand}
              </code>
            </div>
            {agent.bridge_port && (
              <div className="flex items-center gap-3 p-4 rounded-none border border-white/10 bg-black/60">
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
        </BrandCard>
      )}

      {/* ── Vercel sandbox info ── */}
      {isAdmin && !isDockerBacked && agent.bridge_url && (
        <BrandCard
          className="relative shadow-lg shadow-black/50"
          cornerSize="md"
        >
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2 pb-4 border-b border-white/10">
              <span className="inline-block w-2 h-2 rounded-full bg-[#FF5800]" />
              <h2
                className="text-xl font-normal text-white"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                Sandbox Connection
              </h2>
            </div>
            <div className="flex items-start gap-3">
              <p
                className="text-sm font-medium text-white/60 min-w-[140px] uppercase tracking-wider"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                Bridge URL
              </p>
              <a
                href={agent.bridge_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#FF5800] hover:text-[#FF5800]/80 flex items-center gap-1 transition-colors"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                {agent.bridge_url}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </BrandCard>
      )}

      {/* ── Actions card ── */}
      <MiladyAgentActions
        agentId={agent.id}
        status={agent.status}
        webUiUrl={webUiUrl}
      />

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

function InfoBlock({
  icon,
  label,
  value,
  mono = false,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  highlight?: "green" | "blue" | "orange";
}) {
  const valueColor =
    highlight === "green"
      ? "text-green-400"
      : highlight === "blue"
        ? "text-blue-400"
        : highlight === "orange"
          ? "text-orange-400"
          : "text-white";

  return (
    <div className="flex items-start gap-3 p-4 rounded-none border border-white/10 bg-black/20">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p
          className="text-sm text-white/60 uppercase tracking-wider mb-1"
          style={{ fontFamily: "var(--font-roboto-mono)" }}
        >
          {label}
        </p>
        <p
          className={`text-sm font-medium ${valueColor} break-all ${mono ? "font-mono" : ""}`}
          style={mono ? { fontFamily: "var(--font-roboto-mono)" } : undefined}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
