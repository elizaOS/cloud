"use client";

import { useState } from "react";
import Link from "next/link";
import { CornerBrackets } from "@/components/brand";
import {
  Bot,
  Layers,
  DollarSign,
  Terminal,
  Workflow,
  ArrowRight,
  MessageSquare,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Server,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CHAT_ACTIONS as CHAT_ACTIONS_CONFIG,
  CLI_ACTIONS as CLI_ACTIONS_CONFIG,
  type QuickActionConfig,
} from "@/lib/config/quick-actions";

interface QuickAction extends QuickActionConfig {
  icon: React.ReactNode;
  badgeIcon?: React.ReactNode;
}

const BADGE_ICONS: Record<string, React.ReactNode> = {
  Chat: <MessageSquare className="h-3 w-3" />,
  CLI: <Terminal className="h-3 w-3" />,
  AI: <Sparkles className="h-3 w-3" />,
  Web: <Layers className="h-3 w-3" />,
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  "agents-chat": <Bot className="h-6 w-6" />,
  "apps-chat": <Layers className="h-6 w-6" />,
  monetize: <DollarSign className="h-6 w-6" />,
  "agent-cli": <Terminal className="h-6 w-6" />,
  "app-deploy": <Server className="h-6 w-6" />,
  "n8n-workflows": <Workflow className="h-6 w-6" />,
};

function mapConfigToAction(config: QuickActionConfig): QuickAction {
  return {
    ...config,
    icon: ACTION_ICONS[config.id] || <Zap className="h-6 w-6" />,
    badgeIcon: config.badge ? BADGE_ICONS[config.badge] : undefined,
  };
}

const CHAT_ACTIONS: QuickAction[] = CHAT_ACTIONS_CONFIG.map(mapConfigToAction);
const CLI_ACTIONS: QuickAction[] = CLI_ACTIONS_CONFIG.map(mapConfigToAction);

export function QuickActionsGrid() {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const copyToClipboard = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedCommand(command);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-[#FF5800]/10 border border-[#FF5800]/20">
          <Zap className="h-5 w-5 text-[#FF5800]" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Quick Actions</h2>
          <p className="text-sm text-white/50">
            Create, deploy, monetize, and publicize
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {CHAT_ACTIONS.map((action) => (
          <ActionCard key={action.id} action={action} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {CLI_ACTIONS.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            copiedCommand={copiedCommand}
            onCopy={copyToClipboard}
          />
        ))}
      </div>
    </section>
  );
}

function ActionCard({
  action,
  copiedCommand,
  onCopy,
}: {
  action: QuickAction;
  copiedCommand?: string | null;
  onCopy?: (cmd: string) => void;
}) {
  const content = (
    <div
      className={cn(
        "group relative h-full overflow-hidden border border-white/10 bg-black/40 transition-all duration-300",
        action.href && "hover:border-white/20 hover:shadow-lg",
      )}
    >
      <CornerBrackets
        size="md"
        color="#E1E1E1"
        hoverColor={action.href ? "#FF5800" : undefined}
      />

      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-1 bg-gradient-to-r opacity-60",
          action.href && "group-hover:opacity-100 transition-opacity",
          action.gradient,
        )}
      />

      <div className="relative z-10 p-5">
        <div className="flex items-start justify-between mb-4">
          <div
            className={cn(
              "p-3 rounded-lg bg-gradient-to-br text-white",
              action.gradient,
            )}
          >
            {action.icon}
          </div>
          {action.badge && (
            <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wider bg-white/5 border border-white/10 rounded text-white/60">
              {action.badgeIcon}
              {action.badge}
            </span>
          )}
        </div>

        <h3
          className={cn(
            "text-lg font-semibold text-white mb-1",
            action.href && "group-hover:text-[#FF5800] transition-colors",
          )}
        >
          {action.title}
        </h3>
        <p className="text-sm text-white/50 leading-relaxed mb-4">
          {action.description}
        </p>

        {action.cliCommands && onCopy && (
          <>
            <div className="space-y-2">
              {action.cliCommands.map((cmd) => (
                <div
                  key={cmd.command}
                  className="flex items-center justify-between gap-2 bg-black/40 border border-white/10 rounded px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-white/40 uppercase tracking-wider shrink-0">
                      {cmd.label}
                    </span>
                    <code className="text-xs font-mono text-emerald-400 truncate">
                      {cmd.command}
                    </code>
                  </div>
                  <button
                    onClick={() => onCopy(cmd.command)}
                    className="p-1.5 rounded hover:bg-white/5 transition-colors shrink-0"
                  >
                    {copiedCommand === cmd.command ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-white/40 hover:text-white" />
                    )}
                  </button>
                </div>
              ))}
            </div>
            <a
              href="https://elizaos.ai/docs/cli"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 text-xs text-white/40 hover:text-[#FF5800] transition-colors"
            >
              Documentation
              <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}

        {action.href && !action.cliCommands && (
          <div className="flex items-center gap-2 text-sm text-white/40 group-hover:text-[#FF5800] transition-colors">
            <span>Get started</span>
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        )}
      </div>
    </div>
  );

  if (action.href) {
    return (
      <Link href={action.href} className="block h-full">
        {content}
      </Link>
    );
  }

  return content;
}

export function QuickActionsGridSkeleton() {
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-white/10 animate-pulse" />
        <div className="space-y-2">
          <div className="h-5 w-32 bg-white/10 animate-pulse rounded" />
          <div className="h-4 w-48 bg-white/10 animate-pulse rounded" />
        </div>
      </div>

      {[0, 1].map((row) => (
        <div key={row} className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="border border-white/10 bg-black/40 p-5">
              <div className="h-12 w-12 bg-white/10 animate-pulse rounded-lg mb-4" />
              <div className="h-5 w-32 bg-white/10 animate-pulse rounded mb-2" />
              <div className="h-4 w-full bg-white/10 animate-pulse rounded" />
              {row === 1 && (
                <div className="h-10 w-full bg-white/10 animate-pulse rounded mt-4" />
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
