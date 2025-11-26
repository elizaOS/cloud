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
}

export function SidebarNavigationItem({ item }: SidebarNavigationItemProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { authenticated } = usePrivy();

  const isActive =
    pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  // Check if this item is locked for anonymous users
  const isLocked = !authenticated && item.freeAllowed === false;

  // If item is locked, show as button with login prompt
  if (isLocked) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          router.push("/login");
        }}
        className={cn(
          "relative flex w-full items-center gap-3 rounded-none px-3 py-2.5 transition-all duration-200",
          "hover:bg-white/5 hover:text-white/80",
          "text-white/40 border-l-2 border-transparent cursor-pointer",
        )}
        style={{
          fontFamily: "var(--font-roboto-mono)",
          fontWeight: 400,
          fontSize: "14px",
          lineHeight: "18px",
          letterSpacing: "-0.003em",
        }}
      >
        <Icon className="h-4 w-4 opacity-50" />
        <span className="flex-1">{item.label}</span>
        <Lock className="h-3 w-3 text-white/40" />
      </button>
    );
  }

  // Regular accessible link
  return (
    <Link
      href={item.href}
      className={cn(
        "relative flex items-center gap-3 rounded-none px-3 py-2.5 transition-all duration-200",
        "hover:bg-white/5 hover:text-white",
        isActive
          ? "bg-white/10 text-white border-l-2 border-[#FF5800]"
          : "text-white/60 border-l-2 border-transparent",
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
          "h-4 w-4 transition-colors",
          isActive && "text-[#FF5800]",
        )}
      />
      <span className="flex-1">{item.label}</span>
      {item.isNew && (
        <span
          className="rounded-none px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{
            backgroundColor: "#FF580020",
            color: "#FF5800",
            border: "1px solid #FF580040",
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
