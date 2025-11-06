/**
 * Documentation Index Page
 * Landing page for documentation with overview and quick links
 */

import type { Metadata } from "next";
import Link from "next/link";
import { DOC_SECTIONS, getDocsBySection } from "@/lib/docs";
import { BrandCard, CornerBrackets } from "@/components/brand";
import {
  BookOpen,
  Settings,
  Sparkles,
  Code,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Complete documentation for elizaOS Platform - AI agent development, deployment, and management",
};

const sectionIcons = {
  "getting-started": BookOpen,
  features: Sparkles,
  api: Code,
  help: Settings,
};

export default function DocsPage() {
  const docsBySection = getDocsBySection();

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-white mb-4">
          Welcome to elizaOS Platform
        </h1>
        <p className="text-lg text-white/70 leading-relaxed">
          Learn how to build, deploy, and manage your AI agents. 
          Whether you&apos;re just getting started or looking for advanced features, 
          you&apos;ll find everything you need here.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {DOC_SECTIONS.map((section) => {
          const docs = docsBySection.get(section.slug) || [];
          if (docs.length === 0) return null;

          const Icon =
            sectionIcons[section.slug as keyof typeof sectionIcons] ||
            BookOpen;

          return (
            <BrandCard
              key={section.slug}
              className="group hover:border-white/30 transition-all"
            >
              <CornerBrackets size="sm" className="opacity-30" />

              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#FF5800]/10 border border-[#FF5800]/20 rounded">
                    <Icon className="h-5 w-5 text-[#FF5800] shrink-0" />
                  </div>
                  <h2 className="text-xl font-bold text-white">
                    {section.title}
                  </h2>
                </div>

                <ul className="space-y-2">
                  {docs.slice(0, 5).map((doc) => (
                    <li key={doc.slug}>
                      <Link
                        href={`/docs/${doc.slug}`}
                        className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors group/link"
                      >
                        <ArrowRight className="h-3.5 w-3.5 text-[#FF5800] opacity-0 group-hover/link:opacity-100 transition-opacity" />
                        <span className="group-hover/link:translate-x-1 transition-transform">
                          {doc.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>

                {docs.length > 5 && (
                  <p className="text-xs text-white/50 pt-2 border-t border-white/10">
                    +{docs.length - 5} more guides
                  </p>
                )}
              </div>
            </BrandCard>
          );
        })}
      </div>

      <BrandCard className="mt-12">
        <CornerBrackets size="sm" className="opacity-30" />
        <div className="relative z-10 space-y-4">
          <h2 className="text-xl font-bold text-white">New Here? Start With These</h2>
          <p className="text-white/70">
            If you&apos;re just getting started with elizaOS Platform, we recommend reading these guides first:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
            <Link
              href="/docs/introduction"
              className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-none hover:bg-white/10 hover:border-white/20 transition-all group"
            >
              <BookOpen className="h-5 w-5 text-[#FF5800] shrink-0" />
              <div>
                <h3 className="text-white font-semibold group-hover:text-[#FF5800] transition-colors">
                  What is elizaOS?
                </h3>
                <p className="text-sm text-white/60">
                  Learn what you can build
                </p>
              </div>
            </Link>
            <Link
              href="/docs/quick-start"
              className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-none hover:bg-white/10 hover:border-white/20 transition-all group"
            >
              <Settings className="h-5 w-5 text-[#FF5800] shrink-0" />
              <div>
                <h3 className="text-white font-semibold group-hover:text-[#FF5800] transition-colors">
                  Quick Start Guide
                </h3>
                <p className="text-sm text-white/60">
                  Get started in minutes
                </p>
              </div>
            </Link>
          </div>
        </div>
      </BrandCard>
    </div>
  );
}

