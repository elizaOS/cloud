/**
 * Sidebar Navigation Section Component
 */

"use client";

import { SidebarNavigationItem } from "./sidebar-item";
import type { SidebarSection } from "./sidebar-data";

interface SidebarNavigationSectionProps {
  section: SidebarSection;
}

export function SidebarNavigationSection({
  section,
}: SidebarNavigationSectionProps) {
  return (
    <div>
      {section.title && (
        <div className="mb-3 px-3 flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: "#FF5800" }}
          />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">
            {section.title}
          </h3>
        </div>
      )}
      <nav className="space-y-1">
        {section.items.map((item) => (
          <SidebarNavigationItem key={item.id} item={item} />
        ))}
      </nav>
    </div>
  );
}
