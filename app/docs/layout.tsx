/**
 * Documentation Layout
 * Persistent sidebar layout for all documentation pages
 */

import type { Metadata } from "next";
import { DocsSidebar } from "@/components/docs";

export const metadata: Metadata = {
  title: {
    default: "Documentation - elizaOS Platform",
    template: "%s - elizaOS Platform Docs",
  },
  description:
    "Complete documentation for elizaOS Platform - AI agent development, deployment, and management",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-full bg-[#0A0A0A]">
      <DocsSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

