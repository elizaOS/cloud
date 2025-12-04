/**
 * Welcome Hero Component
 * Beautiful onboarding section for the dashboard
 */

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { 
  Terminal, 
  ArrowRight, 
  Zap, 
  Globe, 
  Shield, 
  Bot,
  Cpu,
  Network,
  Play,
  Server,
} from "lucide-react";
import Link from "next/link";
import { BrandButton } from "@/components/brand";

interface WelcomeHeroProps {
  userName: string;
  className?: string;
}

export function WelcomeHero({ userName, className }: WelcomeHeroProps) {
  return (
    <section className={cn("relative overflow-hidden", className)}>
      {/* Animated background gradient effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-[#FF5800]/15 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute -top-20 right-0 w-80 h-80 bg-[#0b35f1]/12 rounded-full blur-[80px]" />
        <div className="absolute bottom-0 left-1/3 w-96 h-48 bg-[#FF5800]/8 rounded-full blur-[60px]" />
        <div className="absolute -bottom-20 right-1/4 w-64 h-64 bg-purple-500/8 rounded-full blur-[80px]" />
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      {/* Floating elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <FloatingIcon icon={<Bot className="h-4 w-4" />} className="top-12 right-[15%] animate-float" delay="0s" />
        <FloatingIcon icon={<Cpu className="h-3 w-3" />} className="top-24 right-[35%] animate-float" delay="2s" />
        <FloatingIcon icon={<Network className="h-4 w-4" />} className="bottom-16 right-[25%] animate-float" delay="4s" />
        <FloatingIcon icon={<Zap className="h-3 w-3" />} className="top-20 left-[60%] animate-float" delay="1s" />
      </div>

      {/* Content */}
      <div className="relative z-10 py-12 px-6 md:py-16 md:px-10">
        <div className="max-w-4xl">
          {/* Welcome Badge */}
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-[#FF5800]/10 border border-[#FF5800]/30 rounded-full backdrop-blur-sm">
            <div className="w-2 h-2 rounded-full bg-[#FF5800] animate-pulse" />
            <span className="text-xs font-semibold text-[#FF5800] tracking-wider uppercase">
              ElizaOS Cloud Platform
            </span>
          </div>

          {/* Main Heading with gradient */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-[1.1]">
            <span className="text-white">Welcome back, </span>
            <span className="bg-gradient-to-r from-[#FF5800] via-orange-400 to-[#FF5800] bg-clip-text text-transparent">
              {userName}
            </span>
            <br />
            <span className="text-white/60 text-3xl md:text-4xl lg:text-5xl">
              Build the future of AI agents
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-white/50 text-lg md:text-xl max-w-2xl mb-8 leading-relaxed">
            Create autonomous AI agents that can think, learn, and act. Deploy to the cloud with one command and scale globally.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap gap-4 mb-10">
            <BrandButton asChild size="lg" className="h-12 px-6 text-sm font-semibold">
              <Link href="/dashboard/character-creator">
                <Bot className="h-4 w-4 mr-2" />
                Create New Agent
              </Link>
            </BrandButton>
            <BrandButton variant="outline" asChild size="lg" className="h-12 px-6 text-sm font-semibold">
              <Link href="/dashboard/containers">
                <Server className="h-4 w-4 mr-2" />
                Deploy to Cloud
              </Link>
            </BrandButton>
            <BrandButton variant="ghost" asChild size="lg" className="h-12 px-6 text-sm">
              <Link href="https://elizaos.ai/docs" target="_blank" rel="noopener noreferrer">
                <Play className="h-4 w-4 mr-2" />
                View Docs
              </Link>
            </BrandButton>
          </div>

          {/* Feature Pills */}
          <div className="flex flex-wrap gap-3">
            <FeaturePill 
              icon={<Zap className="h-3.5 w-3.5" />} 
              label="Deploy in <60s" 
              color="#FF5800"
            />
            <FeaturePill 
              icon={<Globe className="h-3.5 w-3.5" />} 
              label="12+ Global Regions" 
              color="#3B82F6"
            />
            <FeaturePill 
              icon={<Shield className="h-3.5 w-3.5" />} 
              label="Enterprise Security" 
              color="#10B981"
            />
            <FeaturePill 
              icon={<Cpu className="h-3.5 w-3.5" />} 
              label="Multi-Model Support" 
              color="#8B5CF6"
            />
          </div>
        </div>
      </div>

      {/* Bottom border gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FF5800]/40 to-transparent" />
      
      {/* Corner decorations */}
      <div className="absolute top-0 right-0 w-32 h-32 border-r border-t border-[#FF5800]/10" />
      <div className="absolute bottom-0 left-0 w-24 h-24 border-l border-b border-[#FF5800]/10" />
    </section>
  );
}

function FloatingIcon({ 
  icon, 
  className, 
  delay 
}: { 
  icon: React.ReactNode; 
  className?: string;
  delay?: string;
}) {
  return (
    <div 
      className={cn(
        "absolute p-2 bg-zinc-800/80 border border-zinc-600/50 backdrop-blur-sm text-zinc-400",
        className
      )}
      style={{ animationDelay: delay }}
    >
      {icon}
    </div>
  );
}

function FeaturePill({ 
  icon, 
  label, 
  color 
}: { 
  icon: React.ReactNode; 
  label: string;
  color: string;
}) {
  return (
    <div 
      className="inline-flex items-center gap-2 px-4 py-2 border backdrop-blur-sm transition-all hover:scale-105"
      style={{ 
        backgroundColor: `${color}10`,
        borderColor: `${color}25`,
      }}
    >
      <span style={{ color }}>{icon}</span>
      <span className="text-xs font-medium text-white/80">{label}</span>
    </div>
  );
}

export function WelcomeHeroSkeleton() {
  return (
    <section className="relative py-12 px-6 md:py-16 md:px-10">
      <div className="max-w-4xl space-y-6">
        <div className="h-8 w-52 bg-zinc-800 animate-pulse rounded-full" />
        <div className="space-y-3">
          <div className="h-14 w-80 bg-zinc-800 animate-pulse rounded" />
          <div className="h-12 w-96 bg-zinc-800 animate-pulse rounded" />
        </div>
        <div className="h-6 w-full max-w-2xl bg-zinc-800 animate-pulse rounded" />
        <div className="flex gap-4">
          <div className="h-12 w-40 bg-zinc-800 animate-pulse rounded" />
          <div className="h-12 w-40 bg-zinc-800 animate-pulse rounded" />
          <div className="h-12 w-32 bg-zinc-800 animate-pulse rounded" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-32 bg-zinc-800 animate-pulse rounded" />
          <div className="h-10 w-36 bg-zinc-800 animate-pulse rounded" />
          <div className="h-10 w-40 bg-zinc-800 animate-pulse rounded" />
          <div className="h-10 w-36 bg-zinc-800 animate-pulse rounded" />
        </div>
      </div>
    </section>
  );
}
