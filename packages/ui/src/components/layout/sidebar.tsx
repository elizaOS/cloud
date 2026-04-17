/**
 * Main sidebar navigation component with responsive mobile support.
 * Memoized to prevent unnecessary re-renders from parent state changes.
 * Always expanded on desktop, toggleable on mobile.
 *
 * @param props - Sidebar configuration
 * @param props.className - Additional CSS classes
 * @param props.isOpen - Whether sidebar is open (mobile)
 * @param props.onToggle - Callback to toggle sidebar visibility
 */

"use client";

import { ElizaCloudLockup, ScrollArea } from "@elizaos/cloud-ui";
import { X } from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SidebarBottomPanel } from "./sidebar-bottom-panel";
import { sidebarSections } from "./sidebar-data";
import { SidebarNavigationSection } from "./sidebar-section";

interface SidebarProps {
  className?: string;
  isOpen?: boolean;
  onToggle?: () => void;
}

function SidebarComponent({
  className,
  isOpen = false,
  onToggle,
}: SidebarProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const handleBackdropClick = useCallback(() => {
    onToggle?.();
  }, [onToggle]);

  const handleCloseClick = useCallback(() => {
    onToggle?.();
  }, [onToggle]);

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={handleBackdropClick}
        />
      )}

      {/* Sidebar Container — always w-72 on desktop */}
      <aside
        className={cn(
          "flex h-full flex-col overflow-hidden border-r border-white/10 bg-black/50 transition-all duration-300 ease-in-out backdrop-blur-sm w-72 p-1.5",
          isMobile &&
            `fixed inset-y-0 left-0 z-50 ${isOpen ? "translate-x-0" : "-translate-x-full"}`,
          className,
        )}
      >
        {/* Header with Logo */}
        <div className="relative flex h-14 mb-2 shrink-0 grow-0 items-center justify-between px-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 hover:opacity-80 relative z-10"
          >
            <ElizaCloudLockup
              logoClassName={isMobile ? "h-4" : "h-5"}
              textClassName="text-[9px] md:text-[10px]"
            />
          </Link>
          {/* Mobile Close Button */}
          {isMobile && onToggle && (
            <button
              onClick={handleCloseClick}
              className="relative z-10 border border-white/10 bg-white/5 p-2 transition-colors hover:border-white/20 hover:bg-white/10 focus:bg-white/10 focus:outline-none"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          )}
        </div>

        {/* Navigation Content */}
        <ScrollArea className="flex-1">
          <nav className="py-6 px-4">
            <div className="space-y-8">
              {sidebarSections.map((section, index) => (
                <SidebarNavigationSection
                  key={index}
                  section={section}
                  isCollapsed={false}
                />
              ))}
            </div>
          </nav>
        </ScrollArea>

        {/* Bottom Panel with User Info and Settings */}
        <SidebarBottomPanel />
      </aside>
    </>
  );
}

// Memoize the sidebar to prevent re-renders when parent state changes
const Sidebar = memo(SidebarComponent);
export default Sidebar;
