/**
 * Documentation Sidebar Component
 * Navigation sidebar for documentation pages
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { DOC_SECTIONS, getDocsBySection } from "@/lib/docs";
import { ChevronRight, BookOpen } from "lucide-react";
import { CornerBrackets } from "@/components/brand";

export function DocsSidebar() {
  const pathname = usePathname();
  const docsBySection = getDocsBySection();

  return (
    <aside className="w-64 border-r border-white/10 bg-[#0A0A0A] h-full overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#0A0A0A] border-b border-white/10 relative">
        <CornerBrackets size="sm" className="opacity-30" />
        <Link
          href="/docs"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity relative z-10 p-4"
        >
          <BookOpen className="h-5 w-5 text-[#FF5800]" />
          <span className="text-white text-lg font-bold tracking-wide">
            Documentation
          </span>
        </Link>
      </div>

      <nav className="p-4">
        <div className="space-y-8">
          {DOC_SECTIONS.map((section) => {
            const docs = docsBySection.get(section.slug) || [];
            if (docs.length === 0) return null;

            return (
              <div key={section.slug}>
                <h3 className="text-xs font-semibold uppercase text-white/50 tracking-wider mb-3 px-3">
                  {section.title}
                </h3>
                <div className="space-y-1">
                  {docs.map((doc) => {
                    const isActive = pathname === `/docs/${doc.slug}`;

                    return (
                      <Link
                        key={doc.slug}
                        href={`/docs/${doc.slug}`}
                        className={cn(
                          "flex items-center gap-2 rounded-none px-3 py-2 text-sm transition-all border-l-2 group",
                          isActive
                            ? "bg-white/10 text-white border-[#FF5800]"
                            : "text-white/60 border-transparent hover:bg-white/5 hover:text-white",
                        )}
                      >
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 transition-transform",
                            isActive && "rotate-90",
                          )}
                        />
                        <span className="flex-1">{doc.title}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

