/**
 * Features Showcase Component
 * Highlights platform capabilities with rich cards
 */

"use client";

import * as React from "react";
import { BrandCard, BrandButton } from "@/components/brand";
import { cn } from "@/lib/utils";
import {
  Bot,
  Key,
  Server,
  Sparkles,
  Brain,
  Mic2,
  Image as ImageIcon,
  Video,
  Puzzle,
  MessageSquare,
  Globe,
  Shield,
  Zap,
  ArrowRight,
  Code2,
  Database,
  Workflow,
  Lock,
  Terminal,
  Copy,
  Check,
  Rocket,
} from "lucide-react";
import Link from "next/link";

interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  href: string;
  stats?: { label: string; value: string }[];
  badge?: string;
  highlights?: string[];
}

const features: FeatureCardProps[] = [
  {
    title: "AI Agents",
    description: "Create autonomous AI agents with custom personalities, knowledge bases, and capabilities. Deploy them across multiple platforms.",
    icon: <Bot className="h-6 w-6" />,
    color: "#FF5800",
    href: "/dashboard/my-agents",
    badge: "Core Feature",
    highlights: [
      "Custom personality & behavior",
      "Multi-platform deployment",
      "Plugin architecture",
      "Memory & context management",
    ],
  },
  {
    title: "API Keys",
    description: "Secure API access to power your agents with multiple AI providers. Manage authentication and track usage across all your integrations.",
    icon: <Key className="h-6 w-6" />,
    color: "#10B981",
    href: "/dashboard/api-keys",
    highlights: [
      "Multiple provider support",
      "Usage tracking & limits",
      "Secure key management",
      "Rate limiting controls",
    ],
  },
  {
    title: "Cloud Containers",
    description: "Deploy your agents to always-on cloud infrastructure. Automatic scaling, health monitoring, and zero-downtime deployments.",
    icon: <Server className="h-6 w-6" />,
    color: "#3B82F6",
    href: "/dashboard/containers",
    badge: "24/7 Uptime",
    highlights: [
      "Auto-scaling infrastructure",
      "Real-time logs & metrics",
      "One-click deployments",
      "Custom domain support",
    ],
  },
  {
    title: "Knowledge Base",
    description: "Upload documents, websites, and data to create intelligent RAG-powered agents that can answer questions from your content.",
    icon: <Brain className="h-6 w-6" />,
    color: "#8B5CF6",
    href: "/dashboard/knowledge",
    highlights: [
      "Document ingestion",
      "Vector embeddings",
      "Semantic search",
      "Real-time updates",
    ],
  },
  {
    title: "Voice Synthesis",
    description: "Give your agents a voice with high-quality text-to-speech. Clone voices or choose from premium voice models.",
    icon: <Mic2 className="h-6 w-6" />,
    color: "#EC4899",
    href: "/dashboard/voices",
    highlights: [
      "Voice cloning",
      "Multiple languages",
      "Emotion control",
      "Real-time streaming",
    ],
  },
  {
    title: "Image Generation",
    description: "Generate stunning images with state-of-the-art AI models. Perfect for creative agents and content generation.",
    icon: <ImageIcon className="h-6 w-6" />,
    color: "#F59E0B",
    href: "/dashboard/image",
    highlights: [
      "Multiple AI models",
      "Style customization",
      "Batch generation",
      "High resolution output",
    ],
  },
];

const quickActions = [
  {
    title: "Create Agent",
    description: "Build a new AI agent from scratch",
    icon: <Bot className="h-5 w-5" />,
    href: "/dashboard/character-creator",
    color: "#FF5800",
  },
  {
    title: "Add API Key",
    description: "Connect AI provider credentials",
    icon: <Key className="h-5 w-5" />,
    href: "/dashboard/api-keys",
    color: "#10B981",
  },
  {
    title: "Deploy Container",
    description: "Push your agent to the cloud",
    icon: <Server className="h-5 w-5" />,
    href: "/dashboard/containers",
    color: "#8B5CF6",
  },
  {
    title: "View Documentation",
    description: "Learn how to build agents",
    icon: <Code2 className="h-5 w-5" />,
    href: "https://elizaos.ai/docs",
    color: "#3B82F6",
  },
];

interface FeaturesShowcaseProps {
  className?: string;
}

export function FeaturesShowcase({ className }: FeaturesShowcaseProps) {
  return (
    <div className={cn("space-y-10", className)}>
      {/* Quick Actions */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-block w-2 h-2 rounded-full bg-[#FF5800]" />
          <h2 className="text-lg font-semibold text-white uppercase tracking-wider">
            Quick Actions
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <QuickActionCard key={action.title} {...action} />
          ))}
        </div>
      </section>

      {/* Platform Capabilities */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block w-2 h-2 rounded-full bg-[#FF5800]" />
              <h2 className="text-lg font-semibold text-white uppercase tracking-wider">
                Platform Capabilities
              </h2>
            </div>
            <p className="text-white/40 text-sm">
              Everything you need to build, deploy, and scale AI agents
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      {/* Architecture Overview */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-block w-2 h-2 rounded-full bg-[#FF5800]" />
          <h2 className="text-lg font-semibold text-white uppercase tracking-wider">
            How It Works
          </h2>
        </div>
        <ArchitectureFlow />
      </section>

      {/* Stats Banner */}
      <CLIShowcase />
    </div>
  );
}

function QuickActionCard({ title, description, icon, href, color }: {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  color: string;
}) {
  const isExternal = href.startsWith("http");
  
  return (
    <Link 
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className="group"
    >
      <div className="relative overflow-hidden border border-zinc-700/50 bg-zinc-900/80 p-4 transition-all duration-300 hover:border-zinc-500/50 hover:bg-zinc-800/80">
        {/* Hover gradient */}
        <div 
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: `linear-gradient(135deg, ${color}10 0%, transparent 60%)`,
          }}
        />
        
        <div className="relative z-10">
          <div 
            className="inline-flex p-2 mb-3 border"
            style={{ 
              backgroundColor: `${color}20`,
              borderColor: `${color}30`,
              color: color,
            }}
          >
            {icon}
          </div>
          <h3 className="text-sm font-semibold text-white mb-0.5 group-hover:text-[#FF5800] transition-colors">
            {title}
          </h3>
          <p className="text-xs text-white/40 line-clamp-1">{description}</p>
        </div>
        
        {/* Corner accent */}
        <div className="absolute top-0 right-0 w-8 h-8 overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity">
          <div 
            className="absolute -top-4 -right-4 w-8 h-8 rotate-45"
            style={{ backgroundColor: `${color}30` }}
          />
        </div>
      </div>
    </Link>
  );
}

function FeatureCard({ title, description, icon, color, href, badge, highlights }: FeatureCardProps) {
  return (
    <Link href={href} className="block group">
      <BrandCard
        corners={true}
        cornerSize="sm"
        className="h-full transition-all duration-300 hover:border-white/20 group-hover:shadow-lg"
        style={{
          boxShadow: `0 0 0 0 ${color}00`,
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div 
            className="inline-flex p-3 border"
            style={{ 
              backgroundColor: `${color}15`,
              borderColor: `${color}30`,
              color: color,
            }}
          >
            {icon}
          </div>
          {badge && (
            <span 
              className="text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide"
              style={{ 
                backgroundColor: `${color}20`,
                color: color,
              }}
            >
              {badge}
            </span>
          )}
        </div>

        {/* Content */}
        <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-[#FF5800] transition-colors">
          {title}
        </h3>
        <p className="text-sm text-white/50 mb-4 leading-relaxed">
          {description}
        </p>

        {/* Highlights */}
        {highlights && (
          <ul className="space-y-1.5 mb-4">
            {highlights.map((highlight, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-white/40">
                <div 
                  className="w-1 h-1 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {highlight}
              </li>
            ))}
          </ul>
        )}

        {/* Action */}
        <div className="flex items-center gap-1 text-xs font-medium text-[#FF5800] group-hover:gap-2 transition-all">
          <span>Explore</span>
          <ArrowRight className="h-3 w-3" />
        </div>
      </BrandCard>
    </Link>
  );
}

function ArchitectureFlow() {
  const steps = [
    { icon: <Code2 className="h-5 w-5" />, label: "Create", sublabel: "Build your agent" },
    { icon: <Database className="h-5 w-5" />, label: "Configure", sublabel: "Add knowledge & plugins" },
    { icon: <Workflow className="h-5 w-5" />, label: "Test", sublabel: "Chat & iterate" },
    { icon: <Server className="h-5 w-5" />, label: "Deploy", sublabel: "Push to cloud" },
    { icon: <Globe className="h-5 w-5" />, label: "Scale", sublabel: "Go global" },
  ];

  return (
    <div className="relative overflow-hidden border border-zinc-700/50 bg-zinc-900/90 p-6">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-30">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
            `,
            backgroundSize: '30px 30px',
          }}
        />
      </div>

      {/* Flow steps */}
      <div className="relative z-10 flex flex-wrap justify-center gap-4 md:gap-0 md:justify-between items-center">
        {steps.map((step, index) => (
          <React.Fragment key={step.label}>
            <div className="flex flex-col items-center text-center group">
              <div 
                className="w-14 h-14 flex items-center justify-center border border-[#FF5800]/30 bg-[#FF5800]/10 text-[#FF5800] mb-2 transition-all group-hover:scale-110 group-hover:bg-[#FF5800]/20"
              >
                {step.icon}
              </div>
              <span className="text-sm font-semibold text-white">{step.label}</span>
              <span className="text-[10px] text-white/40">{step.sublabel}</span>
            </div>
            
            {index < steps.length - 1 && (
              <div className="hidden md:flex items-center px-2">
                <div className="w-12 h-px bg-gradient-to-r from-[#FF5800]/50 to-[#FF5800]/20" />
                <ArrowRight className="h-4 w-4 text-[#FF5800]/50 -ml-1" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function CLIShowcase() {
  const [copiedCreate, setCopiedCreate] = React.useState(false);
  const [copiedDeploy, setCopiedDeploy] = React.useState(false);

  const copyCommand = async (command: string, setCopied: (v: boolean) => void) => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative overflow-hidden border border-zinc-700/50 bg-zinc-900/90 p-6 md:p-8">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-20">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 88, 0, 0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 88, 0, 0.03) 1px, transparent 1px)
            `,
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 bg-[#FF5800]/10 border border-[#FF5800]/30">
            <Terminal className="h-4 w-4 text-[#FF5800]" />
            <span className="text-xs font-semibold text-[#FF5800] uppercase tracking-wider">
              ElizaOS CLI
            </span>
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">
            From Zero to Deployed in Two Commands
          </h3>
          <p className="text-sm text-zinc-400 max-w-lg mx-auto">
            The fastest way to build and deploy AI agents. No configuration needed.
          </p>
        </div>

        {/* Commands Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Create Command */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-[#FF5800]/20 border border-[#FF5800]/30 text-[#FF5800] text-sm font-bold">
                1
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">Create Your Agent</h4>
                <p className="text-xs text-zinc-500">Scaffold a complete project in seconds</p>
              </div>
            </div>
            
            <div className="bg-zinc-950 border border-zinc-800 p-4 font-mono">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[#FF5800]">$</span>
                  <code className="text-zinc-200">npx @elizaos/cli create</code>
                </div>
                <button
                  onClick={() => copyCommand("npx @elizaos/cli create", setCopiedCreate)}
                  className={cn(
                    "p-1.5 transition-all",
                    copiedCreate 
                      ? "bg-green-500/20 text-green-400" 
                      : "bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700"
                  )}
                >
                  {copiedCreate ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="text-xs text-zinc-600 space-y-1 border-t border-zinc-800 pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  <span>Interactive project wizard</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  <span>Pre-configured character templates</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  <span>Plugin & model selection</span>
                </div>
              </div>
            </div>
          </div>

          {/* Deploy Command */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-[#FF5800]/20 border border-[#FF5800]/30 text-[#FF5800] text-sm font-bold">
                2
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">Deploy to Cloud</h4>
                <p className="text-xs text-zinc-500">Push to production with one command</p>
              </div>
            </div>
            
            <div className="bg-zinc-950 border border-zinc-800 p-4 font-mono">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[#FF5800]">$</span>
                  <code className="text-zinc-200">npx @elizaos/cli deploy</code>
                </div>
                <button
                  onClick={() => copyCommand("npx @elizaos/cli deploy", setCopiedDeploy)}
                  className={cn(
                    "p-1.5 transition-all",
                    copiedDeploy 
                      ? "bg-green-500/20 text-green-400" 
                      : "bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700"
                  )}
                >
                  {copiedDeploy ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="text-xs text-zinc-600 space-y-1 border-t border-zinc-800 pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  <span>Automatic container provisioning</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  <span>Zero-downtime deployments</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  <span>Live in under 60 seconds</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-8 pt-6 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-zinc-500">
            <Rocket className="h-4 w-4 text-[#FF5800]" />
            <span>Your agent will be running 24/7 on managed infrastructure</span>
          </div>
          <Link 
            href="https://elizaos.ai/docs/cli" 
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#FF5800] hover:text-[#FF5800]/80 transition-colors"
          >
            Read CLI Documentation
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function FeaturesShowcaseSkeleton() {
  return (
    <div className="space-y-10">
      {/* Quick Actions skeleton */}
      <section>
        <div className="h-6 w-32 bg-zinc-800 animate-pulse rounded mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-zinc-900/80 border border-zinc-700/50 animate-pulse rounded" />
          ))}
        </div>
      </section>

      {/* Features skeleton */}
      <section>
        <div className="h-6 w-48 bg-zinc-800 animate-pulse rounded mb-6" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 bg-zinc-900/80 border border-zinc-700/50 animate-pulse rounded" />
          ))}
        </div>
      </section>

      {/* Architecture skeleton */}
      <div className="h-32 bg-zinc-900/80 border border-zinc-700/50 animate-pulse rounded" />

      {/* Stats skeleton */}
      <div className="h-40 bg-zinc-900/80 border border-zinc-700/50 animate-pulse rounded" />
    </div>
  );
}

