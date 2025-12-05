/**
 * Sidebar Navigation Section Component
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { SidebarNavigationItem } from "./sidebar-item";
import type { SidebarSection, SidebarItem } from "./sidebar-data";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { isFeatureEnabled } from "@/lib/config/feature-flags";

interface SidebarNavigationSectionProps {
  section: SidebarSection;
}

export function SidebarNavigationSection({
  section,
}: SidebarNavigationSectionProps) {
  const filteredItems = useMemo(() => {
    return section.items.filter((item: SidebarItem) => {
      if (!item.featureFlag) return true;
      return isFeatureEnabled(item.featureFlag);
    });
  }, [section.items]);

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

  if (filteredItems.length === 0) {
    return null;
  }

  // Assign colors based on section type
  const getSectionColor = () => {
    if (!section.title) return "#FF5800"; // Default orange

    switch (section.title.toLowerCase()) {
      case "generation studio":
        return "#FF5800"; // Orange - Creative/Generation
      case "agent development":
        return "#0B35F1"; // Blue - AI/Development
      case "infrastructure":
        return "#22C55E"; // Green - System/Infrastructure
      default:
        return "#FF5800"; // Default orange
    }
  };

  const dotColor = getSectionColor();

  // If there's no title, render without collapsible (e.g., Dashboard section)
  if (!section.title) {
    return (
      <nav className="space-y-1">
        {filteredItems.map((item) => (
          <SidebarNavigationItem key={item.id} item={item} />
        ))}
      </nav>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="group w-full mb-3 px-3 flex items-center gap-2 hover:opacity-80 transition-opacity">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: dotColor }}
        />
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
          {filteredItems.map((item) => (
            <SidebarNavigationItem key={item.id} item={item} />
          ))}
        </nav>
      </CollapsibleContent>
    </Collapsible>
  );
}
