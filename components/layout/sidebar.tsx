/**
 * Main sidebar navigation component with responsive mobile support.
 * Memoized to prevent unnecessary re-renders from parent state changes.
 *
 * @param props - Sidebar configuration
 * @param props.className - Additional CSS classes
 * @param props.isOpen - Whether sidebar is open (mobile)
 * @param props.onToggle - Callback to toggle sidebar visibility
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, memo, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNavigationSection } from "./sidebar-section";
import { sidebarSections } from "./sidebar-data";
import { CornerBrackets } from "@/components/brand";
import { SidebarBottomPanel } from "./sidebar-bottom-panel";

interface SidebarProps {
  className?: string;
  isOpen?: boolean;
  onToggle?: () => void;
  isAnonymous?: boolean;
}

function SidebarComponent({
  className,
  isOpen = false,
  onToggle,
  isAnonymous = false,
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

  // Memoize toggle handler
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

      {/* Sidebar Container */}
      <aside
        className={cn(
          "flex h-full flex-col border-r border-white/10 bg-[#0A0A0A] transition-transform duration-300 ease-in-out",
          isMobile
            ? `fixed inset-y-0 left-0 z-50 w-64 ${isOpen ? "translate-x-0" : "-translate-x-full"}`
            : "relative w-64",
          className,
        )}
      >
        {/* Header with Logo */}
        <div className="relative flex h-16 items-center justify-between border-b border-white/10 px-4">
          {/* Corner brackets for logo area */}
          <CornerBrackets size="sm" className="opacity-30" />

          <Link
            href="/dashboard"
            className="flex items-center gap-2 transition-opacity hover:opacity-80 relative z-10"
          >
            <Image
              src="/eliza-font.svg"
              alt="ELIZA"
              width={80}
              height={24}
              className="h-5 w-auto"
            />
          </Link>

          {/* Mobile Close Button */}
          {isMobile && onToggle && (
            <button
              onClick={handleCloseClick}
              className="rounded-none p-2 hover:bg-white/10 focus:bg-white/10 focus:outline-none relative z-10 transition-colors"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          )}
        </div>

        {/* Navigation Content */}
        <nav className="flex-1 overflow-y-auto px-4 py-6">
          <div className="space-y-8">
            {sidebarSections.map((section, index) => (
              <SidebarNavigationSection key={index} section={section} />
            ))}
          </div>
        </nav>

        {/* Bottom Panel with User Info and Settings */}
        <SidebarBottomPanel />
      </aside>
    </>
  );
}

// Memoize the sidebar to prevent re-renders when parent state changes
const Sidebar = memo(SidebarComponent);
export default Sidebar;
