/**
 * Main Sidebar Navigation Component
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { X, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNavigationSection } from "./sidebar-section";
import { sidebarSections } from "./sidebar-data";
import { CornerBrackets } from "@/components/brand";
import { SidebarBottomPanel } from "./sidebar-bottom-panel";

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

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("sidebar-collapsed");
    return stored === "true";
  });

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebar-collapsed", String(isCollapsed));
    }
  }, [isCollapsed]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

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
          "flex h-full flex-col border-r border-white/10 bg-[#0A0A0A] transition-all duration-300 ease-in-out",
          isMobile
            ? `fixed inset-y-0 left-0 z-50 w-64 ${isOpen ? "translate-x-0" : "-translate-x-full"}`
            : isCollapsed
              ? "relative w-[88px]"
              : "relative w-64",
          className,
        )}
      >
        {/* Header with Logo */}
        <div className="relative flex h-16 items-center justify-between border-b border-white/10 px-4">
          {/* Corner brackets for logo area */}
          {!isCollapsed && <CornerBrackets size="sm" className="opacity-30" />}

          {!isMobile && !isCollapsed ? (
            <>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 transition-opacity hover:opacity-80 relative z-10"
              >
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: "#ffffff" }}
                />
                <Image
                  src="/eliza-font.svg"
                  alt="ELIZA"
                  width={80}
                  height={24}
                  className="h-5 w-auto"
                />
              </Link>
              {/* Desktop Collapse Toggle Button */}
              <button
                onClick={toggleCollapse}
                className="rounded-none p-1.5 hover:bg-white/10 focus:bg-white/10 focus:outline-none relative z-10 transition-colors"
                aria-label="Collapse sidebar"
              >
                <PanelLeft className="h-4 w-4 text-white/60" />
              </button>
            </>
          ) : !isMobile && isCollapsed ? (
            <Link
              href="/dashboard"
              className="flex items-center justify-center w-full transition-opacity hover:opacity-80 relative z-10"
            >
              <Image
                src="/eliza-font.svg"
                alt="ELIZA"
                width={64}
                height={16}
                className="h-4 w-auto"
              />
            </Link>
          ) : (
            <>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 transition-opacity hover:opacity-80 relative z-10"
              >
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: "#ffffff" }}
                />
                <Image
                  src="/eliza-font.svg"
                  alt="ELIZA"
                  width={80}
                  height={24}
                  className="h-5 w-auto"
                />
              </Link>
              {/* Mobile Close Button */}
              {onToggle && (
                <button
                  onClick={onToggle}
                  className="rounded-none p-2 hover:bg-white/10 focus:bg-white/10 focus:outline-none relative z-10 transition-colors"
                  aria-label="Close navigation"
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              )}
            </>
          )}
        </div>

        {!isMobile && isCollapsed ? (
          <>
            {/* Navigation Icons - Simple structure */}
            <div className="flex-1 py-6">
              <div className="flex flex-col items-center">
                {sidebarSections[0].items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      title={item.label}
                      className="p-4 w-full flex items-center justify-center transition-all duration-200 hover:bg-white/5"
                    >
                      <Icon className="h-6 w-6 text-[#a2a2a2]" />
                    </Link>
                  );
                })}
                {sidebarSections[2].items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      title={item.label}
                      className="p-4 w-full flex items-center justify-center transition-all duration-200 hover:bg-white/5"
                    >
                      <Icon className="h-6 w-6 text-[#a2a2a2]" />
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Expand Toggle Button */}
            <div className="border-t border-white/10">
              <button
                onClick={toggleCollapse}
                className="w-full flex items-center justify-center p-4 text-white/60 hover:bg-white/5 hover:text-white transition-all duration-200"
                aria-label="Expand sidebar"
              >
                <PanelLeft className="h-6 w-6" />
              </button>
            </div>

            {/* Bottom Panel */}
            <SidebarBottomPanel isCollapsed={isCollapsed} />
          </>
        ) : (
          <>
            {/* Navigation Content */}
            <nav className="flex-1 overflow-y-auto px-4 py-6">
              <div className="space-y-1">
                {sidebarSections.map((section, index) => (
                  <SidebarNavigationSection key={index} section={section} isCollapsed={isCollapsed} />
                ))}
              </div>
            </nav>

            {/* Bottom Panel with User Info and Settings */}
            <SidebarBottomPanel isCollapsed={isCollapsed} />
          </>
        )}
      </aside>
    </>
  );
}
