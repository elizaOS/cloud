/**
 * Sidebar navigation section component with collapsible functionality.
 * Persists open/closed state to localStorage and provides color-coded sections.
 * Supports admin-only sections that are hidden from non-admin users.
 *
 * @param props - Sidebar section configuration
 * @param props.section - Section data including title, items, and metadata
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { SidebarNavigationItem } from "./sidebar-item";
import type { SidebarSection, SidebarItem } from "./sidebar-data";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { isFeatureEnabled } from "@/lib/config/feature-flags";

// Default anvil wallet for devnet admin access
const ANVIL_DEFAULT_WALLET = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function isDevnet(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DEVNET === "true"
  );
}

interface SidebarNavigationSectionProps {
  section: SidebarSection;
}

export function SidebarNavigationSection({
  section,
}: SidebarNavigationSectionProps) {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [isAdmin, setIsAdmin] = useState(false);

  // Generate a storage key based on section title
  const storageKey = section.title
    ? `sidebar-section-${section.title.toLowerCase().replace(/\s+/g, "-")}`
    : null;

  // Initialize state from localStorage (default to open)
  // MUST be before any conditional returns to follow React hooks rules
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined" || !storageKey) return true;
    const stored = localStorage.getItem(storageKey);
    return stored === null ? true : stored === "true";
  });

  // Check if user is admin (client-side check)
  // Uses AbortController for cleanup and async pattern to satisfy lint rules
  useEffect(() => {
    const abortController = new AbortController();

    const checkAdmin = async () => {
      // Early exit if not authenticated
      if (!authenticated) {
        return false;
      }

      // Get connected wallet address
      const connectedWallet = wallets?.[0]?.address;
      if (!connectedWallet) {
        return false;
      }

      // In devnet, anvil wallet is always admin
      if (
        isDevnet() &&
        connectedWallet.toLowerCase() === ANVIL_DEFAULT_WALLET.toLowerCase()
      ) {
        return true;
      }

      // Check admin status via API (async)
      const res = await fetch("/api/v1/admin/moderation", {
        method: "HEAD",
        signal: abortController.signal,
      }).catch(() => null);

      return res?.ok ?? false;
    };

    checkAdmin().then((adminStatus) => {
      if (!abortController.signal.aborted) {
        setIsAdmin(adminStatus);
      }
    });

    return () => {
      abortController.abort();
    };
  }, [authenticated, wallets]);

  // Persist state to localStorage
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, String(isOpen));
    }
  }, [isOpen, storageKey]);

  const filteredItems = useMemo(() => {
    return section.items.filter((item: SidebarItem) => {
      // Check feature flag
      if (item.featureFlag && !isFeatureEnabled(item.featureFlag)) {
        return false;
      }
      // Check admin-only items
      if (item.adminOnly && !isAdmin) {
        return false;
      }
      return true;
    });
  }, [section.items, isAdmin]);

  // Hide admin-only sections from non-admins
  if (section.adminOnly && !isAdmin) {
    return null;
  }

  if (filteredItems.length === 0) {
    return null;
  }

  // Assign colors based on section type
  const getSectionColor = () => {
    if (!section.title) return "#FF5800"; // Default orange

    switch (section.title.toLowerCase()) {
      case "agents":
        return "#0B35F1"; // Blue - AI/Agents
      case "generation studio":
        return "#FF5800"; // Orange - Creative/Generation
      case "infrastructure":
        return "#22C55E"; // Green - System/Infrastructure
      case "monetization":
        return "#FFD700"; // Gold - Monetization/Earnings
      case "admin":
        return "#EF4444"; // Red - Admin/Moderation
      default:
        return "#FF5800"; // Default orange
    }
  };

  const dotColor = getSectionColor();

  // Check if this section is "coming soon" (disabled)
  const isComingSoon =
    section.title?.toLowerCase() === "monetization" ||
    section.title?.toLowerCase() === "admin";

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

  // Render collapsed "coming soon" sections
  if (isComingSoon) {
    return (
      <div className="w-full mb-3 px-3 flex items-center gap-2 opacity-50 select-none cursor-default">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        <h3
          className="flex-1 text-xs font-normal uppercase tracking-wider text-white/50 text-left"
        >
          {section.title}
        </h3>
        <span
          className="text-[10px] font-medium uppercase tracking-wider text-white/40 bg-white/10 px-1.5 py-0.5 rounded"
          style={{
            fontFamily: "var(--font-roboto-mono)",
          }}
        >
          soon
        </span>
      </div>
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
