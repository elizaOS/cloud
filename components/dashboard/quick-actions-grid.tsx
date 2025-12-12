/**
 * Quick Actions Grid for the dashboard.
 * Displays 6 action cards in two rows:
 * - Row 1 (Chat-based): Create agents, Create apps/services, Monetize & promote
 * - Row 2 (CLI-based): Agent CLI, App CLI, n8n workflows
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import {
  Bot,
  Layers,
  DollarSign,
  Terminal,
  Rocket,
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

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  gradient: string;
  badge?: string;
  cliCommands?: { label: string; command: string }[];
  external?: boolean;
}

export function QuickActionsGrid() {
  const [copiedCommand, setCopiedCommand] = React.useState<string | null>(null);

  const copyToClipboard = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedCommand(command);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const chatActions: QuickAction[] = [
    {
      id: "agents-chat",
      title: "Create Agent",
      description: "Build and deploy AI agents with natural language",
      icon: <Bot className="h-6 w-6" />,
      href: "/dashboard/build",
      gradient: "from-[#FF5800] to-orange-600",
      badge: "Chat",
    },
    {
      id: "apps-chat",
      title: "Create App",
      description: "Build apps, MCP services, and A2A endpoints with AI",
      icon: <Layers className="h-6 w-6" />,
      href: "/dashboard/fragments",
      gradient: "from-purple-500 to-indigo-600",
      badge: "Chat",
    },
    {
      id: "monetize",
      title: "Monetize & Promote",
      description: "Set pricing, enable payments, and list on marketplace",
      icon: <DollarSign className="h-6 w-6" />,
      href: "/dashboard/apps",
      gradient: "from-emerald-500 to-teal-600",
    },
  ];

  const cliActions: QuickAction[] = [
    {
      id: "agent-cli",
      title: "Agent CLI",
      description: "Create and deploy agents from terminal",
      icon: <Terminal className="h-6 w-6" />,
      gradient: "from-cyan-500 to-blue-600",
      cliCommands: [
        { label: "Create", command: "npx elizaos create" },
        { label: "Deploy", command: "npx elizaos deploy" },
      ],
    },
    {
      id: "app-cli",
      title: "App CLI",
      description: "Deploy apps and services via command line",
      icon: <Server className="h-6 w-6" />,
      gradient: "from-pink-500 to-rose-600",
      cliCommands: [
        { label: "Init", command: "npx elizaos app init" },
        { label: "Deploy", command: "npx elizaos app deploy" },
      ],
    },
    {
      id: "n8n-workflows",
      title: "n8n Workflows",
      description: "Create automation workflows with AI assistance",
      icon: <Workflow className="h-6 w-6" />,
      href: "/dashboard/workflows",
      gradient: "from-amber-500 to-yellow-600",
      badge: "AI",
    },
  ];

  return (
    <section className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-[#FF5800]/10 border border-[#FF5800]/20">
          <Zap className="h-5 w-5 text-[#FF5800]" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Quick Actions</h2>
          <p className="text-sm text-white/50">Create, deploy, monetize, and publicize</p>
        </div>
      </div>

      {/* Row 1: Chat-based actions */}
      <div className="grid gap-4 md:grid-cols-3">
        {chatActions.map((action) => (
          <ChatActionCard key={action.id} action={action} />
        ))}
      </div>

      {/* Row 2: CLI-based actions */}
      <div className="grid gap-4 md:grid-cols-3">
        {cliActions.map((action) => (
          <CLIActionCard
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

function ChatActionCard({ action }: { action: QuickAction }) {
  const content = (
    <div className="group relative h-full overflow-hidden border border-white/10 bg-black/40 transition-all duration-300 hover:border-white/20 hover:shadow-lg">
      <CornerBrackets size="md" color="#E1E1E1" hoverColor="#FF5800" />
      
      {/* Gradient accent */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-1 bg-gradient-to-r opacity-60 group-hover:opacity-100 transition-opacity",
          action.gradient
        )}
      />

      <div className="relative z-10 p-5">
        <div className="flex items-start justify-between mb-4">
          <div
            className={cn(
              "p-3 rounded-lg bg-gradient-to-br",
              action.gradient
            )}
          >
            {action.icon}
          </div>
          {action.badge && (
            <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wider bg-white/5 border border-white/10 rounded text-white/60">
              <MessageSquare className="h-3 w-3" />
              {action.badge}
            </span>
          )}
        </div>

        <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-[#FF5800] transition-colors">
          {action.title}
        </h3>
        <p className="text-sm text-white/50 leading-relaxed mb-4">
          {action.description}
        </p>

        <div className="flex items-center gap-2 text-sm text-white/40 group-hover:text-[#FF5800] transition-colors">
          <span>Get started</span>
          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </div>
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

  return (
    <button onClick={action.onClick} className="block h-full w-full text-left">
      {content}
    </button>
  );
}

function CLIActionCard({
  action,
  copiedCommand,
  onCopy,
}: {
  action: QuickAction;
  copiedCommand: string | null;
  onCopy: (command: string) => void;
}) {
  if (action.href) {
    return (
      <Link href={action.href} className="block h-full">
        <div className="group relative h-full overflow-hidden border border-white/10 bg-black/40 transition-all duration-300 hover:border-white/20 hover:shadow-lg">
          <CornerBrackets size="md" color="#E1E1E1" hoverColor="#FF5800" />
          
          {/* Gradient accent */}
          <div
            className={cn(
              "absolute top-0 left-0 right-0 h-1 bg-gradient-to-r opacity-60 group-hover:opacity-100 transition-opacity",
              action.gradient
            )}
          />

          <div className="relative z-10 p-5">
            <div className="flex items-start justify-between mb-4">
              <div
                className={cn(
                  "p-3 rounded-lg bg-gradient-to-br",
                  action.gradient
                )}
              >
                {action.icon}
              </div>
              {action.badge && (
                <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wider bg-white/5 border border-white/10 rounded text-white/60">
                  <Sparkles className="h-3 w-3" />
                  {action.badge}
                </span>
              )}
            </div>

            <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-[#FF5800] transition-colors">
              {action.title}
            </h3>
            <p className="text-sm text-white/50 leading-relaxed mb-4">
              {action.description}
            </p>

            <div className="flex items-center gap-2 text-sm text-white/40 group-hover:text-[#FF5800] transition-colors">
              <span>Open</span>
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="group relative h-full overflow-hidden border border-white/10 bg-black/40 transition-all duration-300 hover:border-white/20">
      <CornerBrackets size="md" color="#E1E1E1" />
      
      {/* Gradient accent */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-1 bg-gradient-to-r opacity-60",
          action.gradient
        )}
      />

      <div className="relative z-10 p-5">
        <div className="flex items-start justify-between mb-4">
          <div
            className={cn(
              "p-3 rounded-lg bg-gradient-to-br",
              action.gradient
            )}
          >
            {action.icon}
          </div>
          <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wider bg-white/5 border border-white/10 rounded text-white/60">
            <Terminal className="h-3 w-3" />
            CLI
          </span>
        </div>

        <h3 className="text-lg font-semibold text-white mb-1">
          {action.title}
        </h3>
        <p className="text-sm text-white/50 leading-relaxed mb-4">
          {action.description}
        </p>

        {/* CLI Commands */}
        {action.cliCommands && (
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
        )}

        {/* Docs link */}
        <a
          href="https://elizaos.ai/docs/cli"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-3 text-xs text-white/40 hover:text-[#FF5800] transition-colors"
        >
          <span>Documentation</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
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

      <div className="grid gap-4 md:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="border border-white/10 bg-black/40 p-5">
            <div className="h-12 w-12 bg-white/10 animate-pulse rounded-lg mb-4" />
            <div className="h-5 w-32 bg-white/10 animate-pulse rounded mb-2" />
            <div className="h-4 w-full bg-white/10 animate-pulse rounded" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="border border-white/10 bg-black/40 p-5">
            <div className="h-12 w-12 bg-white/10 animate-pulse rounded-lg mb-4" />
            <div className="h-5 w-32 bg-white/10 animate-pulse rounded mb-2" />
            <div className="h-4 w-full bg-white/10 animate-pulse rounded mb-4" />
            <div className="h-10 w-full bg-white/10 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}

