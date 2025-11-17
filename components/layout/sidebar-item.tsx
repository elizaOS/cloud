/**
 * Sidebar Navigation Item Component
 */

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SidebarItem } from "./sidebar-data";

interface SidebarNavigationItemProps {
  item: SidebarItem;
  isCollapsed?: boolean;
}

export function SidebarNavigationItem({ item, isCollapsed = false }: SidebarNavigationItemProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { authenticated } = usePrivy();

  // For Dashboard, only match exact path to avoid matching all /dashboard/* routes
  const isActive = item.href === "/dashboard"
    ? pathname === "/dashboard"
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  // Check if this item is locked for anonymous users
  const isLocked = !authenticated && item.freeAllowed === false;

  // If item is coming soon, show as disabled button
  if (item.comingSoon) {
    return (
      <button
        disabled
        title={item.label}
        className={cn(
          "relative flex w-full items-center rounded-none transition-all duration-200",
          "text-white/40 border-l-2 border-transparent cursor-not-allowed",
          isCollapsed ? "justify-center px-4 py-3" : "gap-3 px-3 py-2.5"
        )}
        style={{
          fontFamily: "var(--font-roboto-mono)",
          fontWeight: 400,
          fontSize: "14px",
          lineHeight: "18px",
          letterSpacing: "-0.003em",
        }}
      >
        <Icon className={cn("opacity-50", isCollapsed ? "h-6 w-6" : "h-4 w-4")} />
        {!isCollapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            <span
              className="rounded-none px-2 py-0.5 text-[10px] font-medium tracking-wide"
              style={{
                fontFamily: "var(--font-roboto-mono)",
                fontSize: "10px",
                color: "#a1a1a1",
              }}
            >
              Coming soon
            </span>
          </>
        )}
      </button>
    );
  }

  // If item is locked, show as button with login prompt
  if (isLocked) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          router.push("/login");
        }}
        title={item.label}
        className={cn(
          "relative flex w-full items-center rounded-none transition-all duration-200",
          "hover:bg-white/5 hover:text-white/80",
          "text-white/40 border-l-2 border-transparent cursor-pointer",
          isCollapsed ? "justify-center px-4 py-3" : "gap-3 px-3 py-2.5"
        )}
        style={{
          fontFamily: "var(--font-roboto-mono)",
          fontWeight: 400,
          fontSize: "14px",
          lineHeight: "18px",
          letterSpacing: "-0.003em",
        }}
      >
        <Icon className={cn("opacity-50", isCollapsed ? "h-6 w-6" : "h-4 w-4")} />
        {!isCollapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            <Lock className="h-3 w-3 text-white/40" />
          </>
        )}
      </button>
    );
  }

  // Regular accessible link
  return (
    <Link
      href={item.href}
      title={isCollapsed ? item.label : undefined}
      className={cn(
        "relative flex items-center rounded-none transition-all duration-200",
        "hover:bg-white/5 hover:text-white",
        isActive
          ? "bg-white/10 text-white border-l-2 border-white"
          : "text-white/60 border-l-2 border-transparent",
        isCollapsed ? "justify-center px-4 py-3" : "gap-3 px-3 py-2.5"
      )}
      style={{
        fontFamily: "var(--font-roboto-mono)",
        fontWeight: 400,
        fontSize: "14px",
        lineHeight: "18px",
        letterSpacing: "-0.003em",
      }}
    >
      <Icon
        className={cn(
          "transition-colors",
          isCollapsed ? "h-6 w-6" : "h-4 w-4",
          isActive && "text-white",
        )}
      />
      {!isCollapsed && (
        <>
          <span className="flex-1">{item.label}</span>
          {item.isNew && (
            <span
              className="rounded-none px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                color: "#ffffff",
                border: "1px solid rgba(255, 255, 255, 0.2)",
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
        </>
      )}
    </Link>
  );
}
