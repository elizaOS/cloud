/**
 * Breadcrumb Component
 * Shows navigation path in documentation
 */

"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocMetadata, DocSection } from "@/lib/docs";

interface BreadcrumbProps {
  section?: DocSection;
  doc?: DocMetadata;
  className?: string;
}

export function Breadcrumb({ section, doc, className }: BreadcrumbProps) {
  return (
    <nav className={cn("flex items-center gap-2 text-sm", className)} aria-label="Breadcrumb">
      <Link
        href="/docs"
        className="flex items-center gap-1 text-white/60 hover:text-white transition-colors"
      >
        <Home className="h-3.5 w-3.5" />
        <span>Docs</span>
      </Link>

      {section && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-white/30" />
          <span className="text-white/60">{section.title}</span>
        </>
      )}

      {doc && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-white/30" />
          <span className="text-white font-medium">{doc.title}</span>
        </>
      )}
    </nav>
  );
}

