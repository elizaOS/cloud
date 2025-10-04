/**
 * Main Sidebar Navigation Component
 */

"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SidebarNavigationSection } from "./sidebar-section";
import { sidebarSections } from "./sidebar-data";

interface SidebarProps {
  className?: string;
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function Sidebar({
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

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={cn(
          "flex h-full flex-col border-r bg-sidebar transition-transform duration-300 ease-in-out",
          isMobile
            ? `fixed inset-y-0 left-0 z-50 w-64 ${isOpen ? "translate-x-0" : "-translate-x-full"}`
            : "relative w-64",
          className,
        )}
      >
        {/* Header with Logo */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          <Link
            href="/dashboard"
            className="flex items-center space-x-2 transition-opacity hover:opacity-80"
          >
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600"></div>
            <span className="text-lg font-semibold">ElizaOS</span>
          </Link>

          {/* Mobile Close Button */}
          {isMobile && onToggle && (
            <button
              onClick={onToggle}
              className="rounded-md p-2 hover:bg-accent focus:bg-accent focus:outline-none"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Navigation Content */}
        <nav className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-6">
            {sidebarSections.map((section, index) => (
              <SidebarNavigationSection key={index} section={section} />
            ))}
          </div>
        </nav>

        {/* Footer with Theme Toggle */}
        <div className="border-t p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </aside>
    </>
  );
}
