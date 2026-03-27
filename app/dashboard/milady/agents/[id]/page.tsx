/**
 * Milady Agent Detail Page
 *
 * Shows comprehensive information for a specific AI agent sandbox:
 * - Status, timestamps, error messages
 * - User-facing Milady actions and Web UI access
 * - Admin-only infrastructure details, SSH access, and Docker logs
 */

import { Badge } from "@elizaos/cloud-ui";
import { AlertCircle, ArrowLeft, Cloud, Copy, ExternalLink, Server, Terminal, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthWithOrg } from "@/lib/auth";
import { MILADY_PRICING } from "@/lib/constants/milady-pricing";
import { formatHourlyRate, formatMonthlyEstimate } from "@/lib/constants/milady-pricing-display";
import { statusBadgeColor, statusDotColor } from "@/lib/constants/sandbox-status";
import { getPreferredMiladyAgentWebUiUrl } from "@/lib/milady-web-ui";
import { adminService } from "@/lib/services/admin";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { getStewardWalletInfo, type StewardWalletInfo } from "@/lib/services/steward-client";
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

  // Milady sandboxes table may not exist in all environments — redirect gracefully.
  // Only catch "not found" style errors; let unexpected failures (DB down, schema
  // mismatch) propagate so they're visible in error tracking.
  let agent: Awaited<ReturnType<typeof miladySandboxService.getAgent>>;
  try {
    agent = await miladySandboxService.getAgent(id, user.organization_id);
  } catch (err) {
    // Relation/table missing or row not found → redirect; anything else → rethrow
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist") || msg.includes("not found") || msg.includes("relation")) {
      redirect("/dashboard/milady");
    }
    throw err;
  }
  if (!agent) {
    redirect("/dashboard/milady");
  }

  // Check admin for log access
  const isAdmin = await adminService.isUserAdmin(user.id).catch(() => false);

  // Fetch wallet info server-side (best-effort — never blocks the page)
  const isDockerBacked_early = !!agent.node_id;
  const walletInfo: StewardWalletInfo | null = isDockerBacked_early
    ? await getStewardWalletInfo(agent.id).catch(() => null)
    : null;

  const isDockerBacked = isDockerBacked_early;
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-white/5 border border-white/10">
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
        {/* Cost */}
        <div className="bg-black/60 p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Cost</p>
          <p
            className="text-lg font-medium text-white tabular-nums"
            style={{ fontFamily: "var(--font-roboto-mono)" }}
          >
            {agent.status === "running" || agent.status === "provisioning"
              ? formatHourlyRate(MILADY_PRICING.RUNNING_HOURLY_RATE)
              : agent.status === "stopped" || agent.status === "disconnected"
                ? formatHourlyRate(MILADY_PRICING.IDLE_HOURLY_RATE)
                : "—"}
          </p>
          {(agent.status === "running" ||
            agent.status === "provisioning" ||
            agent.status === "stopped" ||
            agent.status === "disconnected") && (
            <p className="text-[10px] text-white/30 tabular-nums">
              {agent.status === "running" || agent.status === "provisioning"
                ? formatMonthlyEstimate(MILADY_PRICING.RUNNING_HOURLY_RATE)
                : formatMonthlyEstimate(MILADY_PRICING.IDLE_HOURLY_RATE)}
            </p>
          )}
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

      {/* ── Wallet info ── */}
      <WalletSection walletInfo={walletInfo} isDockerBacked={isDockerBacked} />

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
// Wallet section
// ----------------------------------------------------------------

function walletStatusColor(status: StewardWalletInfo["walletStatus"] | "none" | undefined): {
  badge: string;
  dot: string;
} {
  switch (status) {
    case "active":
      return { badge: "border-emerald-500/30 text-emerald-400", dot: "bg-emerald-400" };
    case "pending":
      return { badge: "border-yellow-500/30 text-yellow-400", dot: "bg-yellow-400 animate-pulse" };
    case "error":
      return { badge: "border-red-500/30 text-red-400", dot: "bg-red-400" };
    default:
      return { badge: "border-white/15 text-white/40", dot: "bg-white/25" };
  }
}

function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function normalizeChain(chain: string | null | undefined): string {
  if (!chain) return "—";
  if (chain.startsWith("eip155:")) {
    const chainId = chain.replace("eip155:", "");
    if (chainId === "8453") return "Base";
    return `Chain ${chainId}`;
  }
  return chain.charAt(0).toUpperCase() + chain.slice(1);
}

function WalletSection({
  walletInfo,
  isDockerBacked,
}: {
  walletInfo: StewardWalletInfo | null;
  isDockerBacked: boolean;
}) {
  const hasWallet = !!walletInfo?.walletAddress;
  const statusColors = walletStatusColor(walletInfo?.walletStatus ?? (hasWallet ? "active" : "none"));

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-block size-2 bg-[#FF5800]" />
        <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-white/60">Wallet</p>
      </div>

      {!isDockerBacked ? (
        // Non-docker agents don't use Steward wallets yet
        <div className="border border-white/8 bg-black/40 px-4 py-3">
          <p className="text-sm text-white/35">Wallet management is not available for this agent type.</p>
        </div>
      ) : !hasWallet ? (
        // No wallet provisioned
        <div className="border border-white/8 bg-black/40 px-5 py-4 flex items-center gap-3">
          <Wallet className="h-4 w-4 text-white/20 shrink-0" />
          <p className="text-sm text-white/35 italic">No wallet provisioned</p>
        </div>
      ) : (
        // Wallet details
        <div className="border border-white/10 bg-black/60">
          {/* Address row */}
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/8">
            <Wallet className="h-4 w-4 text-[#FF5800]/70 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/35 mb-1">Address</p>
              <div className="flex items-center gap-2.5 flex-wrap">
                <code
                  className="text-sm text-white/85 font-mono"
                  style={{ fontFamily: "var(--font-roboto-mono)" }}
                  title={walletInfo.walletAddress ?? ""}
                >
                  <span className="hidden sm:inline">{walletInfo.walletAddress}</span>
                  <span className="sm:hidden">{truncateAddress(walletInfo.walletAddress!)}</span>
                </code>
                {/* Basescan link */}
                <a
                  href={`https://basescan.org/address/${walletInfo.walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-[#FF5800]/60 hover:text-[#FF5800] transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span className="hidden sm:inline">Basescan</span>
                </a>
              </div>
            </div>
          </div>

          {/* Meta row: provider · status · chain · balance */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/5">
            {/* Provider */}
            <div className="bg-black/60 px-4 py-3 space-y-1.5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Provider</p>
              <Badge
                variant="outline"
                className="text-[11px] px-2 py-0.5 border-[#FF5800]/30 text-[#FF5800]/80 font-mono"
              >
                {walletInfo.walletProvider === "steward" ? "Steward" : "Privy"}
              </Badge>
            </div>

            {/* Status */}
            <div className="bg-black/60 px-4 py-3 space-y-1.5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Status</p>
              <Badge
                variant="outline"
                className={`text-[11px] px-2 py-0.5 ${statusColors.badge}`}
              >
                <span className={`inline-block size-1.5 rounded-full mr-1.5 ${statusColors.dot}`} />
                {walletInfo.walletStatus ?? "unknown"}
              </Badge>
            </div>

            {/* Chain */}
            <div className="bg-black/60 px-4 py-3 space-y-1.5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Chain</p>
              <p
                className="text-sm font-medium text-white/80 font-mono"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                {normalizeChain(walletInfo.chain)}
              </p>
            </div>

            {/* Balance */}
            <div className="bg-black/60 px-4 py-3 space-y-1.5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Balance</p>
              <p
                className="text-sm font-medium text-white/80 font-mono tabular-nums"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                {walletInfo.balance ?? "—"}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
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
