/**
 * Sidebar Navigation Item Component
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SidebarItem } from "./sidebar-data";

interface SidebarNavigationItemProps {
  item: SidebarItem;
}

export function SidebarNavigationItem({ item }: SidebarNavigationItemProps) {
  const pathname = usePathname();
  const isActive =
    pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "relative flex items-center gap-3 rounded-none px-3 py-2.5 text-sm font-medium transition-all duration-200",
        "hover:bg-white/5 hover:text-white",
        isActive
          ? "bg-white/10 text-white border-l-2 border-[#FF5800]"
          : "text-white/60 border-l-2 border-transparent",
      )}
    >
      <Icon className={cn("h-4 w-4 transition-colors", isActive && "text-[#FF5800]")} />
      <span className="flex-1">{item.label}</span>
      {item.isNew && (
        <span 
          className="rounded-none px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ 
            backgroundColor: "#FF580020",
            color: "#FF5800",
            border: "1px solid #FF580040"
          }}
        >
          NEW
        </span>
      )}
      {item.badge && !item.isNew && (
        <span className="rounded-none bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">
          {item.badge}
        </span>
      )}
    </Link>
  );
}
