/**
 * Sidebar Navigation Section Component
 */

"use client";

import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { SidebarNavigationItem } from "./sidebar-item";
import type { SidebarSection } from "./sidebar-data";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface SidebarNavigationSectionProps {
  section: SidebarSection;
  isCollapsed?: boolean;
}

export function SidebarNavigationSection({
  section,
  isCollapsed = false,
}: SidebarNavigationSectionProps) {
  // Generate a storage key based on section title
  const storageKey = section.title
    ? `sidebar-section-${section.title.toLowerCase().replace(/\s+/g, "-")}`
    : null;

  // Initialize state from localStorage (default to open)
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined" || !storageKey) return true;
    const stored = localStorage.getItem(storageKey);
    return stored === null ? true : stored === "true";
  });

  // Persist state to localStorage
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, String(isOpen));
    }
  }, [isOpen, storageKey]);

  // Use white for all section dots
  const dotColor = "#ffffff";

  // If there's no title, render without collapsible (e.g., Dashboard section)
  if (!section.title) {
    return (
      <nav className="space-y-1">
        {section.items.map((item) => (
          <SidebarNavigationItem key={item.id} item={item} isCollapsed={isCollapsed} />
        ))}
      </nav>
    );
  }

  // If sidebar is collapsed, don't show section header and collapsible
  if (isCollapsed) {
    return (
      <nav className="space-y-1">
        {section.items.map((item) => (
          <SidebarNavigationItem key={item.id} item={item} isCollapsed={isCollapsed} />
        ))}
      </nav>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="group w-full px-3 py-2.5 flex items-center gap-2 hover:opacity-80 transition-opacity">
        {section.icon ? (
          <section.icon className="h-4 w-4 text-white/60 flex-shrink-0" />
        ) : (
          <span
            className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: dotColor }}
          />
        )}
        <h3
          className="flex-1 text-xs font-semibold uppercase tracking-wider text-white/50 text-left"
          style={{
            fontFamily: "var(--font-roboto-mono)",
            fontWeight: 400,
            letterSpacing: "-0.003em",
          }}
        >
          {section.title}
        </h3>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-white/40 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <nav className="space-y-1">
          {section.items.map((item) => (
            <SidebarNavigationItem key={item.id} item={item} isCollapsed={isCollapsed} />
          ))}
        </nav>
      </CollapsibleContent>
    </Collapsible>
  );
}
