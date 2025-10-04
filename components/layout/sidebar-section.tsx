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
        <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {section.title}
        </h3>
      )}
      <nav className="space-y-1">
        {section.items.map((item) => (
          <SidebarNavigationItem key={item.id} item={item} />
        ))}
      </nav>
    </div>
  );
}
