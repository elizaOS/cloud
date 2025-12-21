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
import { useState, useEffect, memo, useCallback, useRef } from "react";
import { X, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNavigationSection } from "./sidebar-section";
import { sidebarSections } from "./sidebar-data";
import { SidebarBottomPanel } from "./sidebar-bottom-panel";

interface SidebarProps {
  className?: string;
  isOpen?: boolean;
  onToggle?: () => void;
}

const TOKEN_ADDRESSES = [
  {
    name: "Solana",
    address: "DuMbhu7mvQvqQHGcnikDgb4XegXJRyhUBfdU22uELiZA",
    id: "solana",
  },
  {
    name: "Ethereum",
    address: "0xea17Df5Cf6D172224892B5477A16ACb111182478",
    id: "ethereum",
  },
  {
    name: "Base",
    address: "0xea17Df5Cf6D172224892B5477A16ACb111182478",
    id: "base",
  },
  {
    name: "Bsc",
    address: "0xea17Df5Cf6D172224892B5477A16ACb111182478",
    id: "bsc",
  },
] as const;

function SidebarComponent({
  className,
  isOpen = false,
  onToggle,
}: SidebarProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState(false);
  const tokensRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Handle click outside to close token display
  useEffect(() => {
    if (!showTokens) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (tokensRef.current && !tokensRef.current.contains(event.target as Node)) {
        setShowTokens(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTokens]);

  // Handle escape key to close token display
  useEffect(() => {
    if (!showTokens) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowTokens(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showTokens]);

  // Focus management - move focus to container when opened
  useEffect(() => {
    if (showTokens && tokensRef.current) {
      tokensRef.current.focus();
    }
  }, [showTokens]);

  // Memoize toggle handler
  const handleBackdropClick = useCallback(() => {
    onToggle?.();
  }, [onToggle]);

  const handleCloseClick = useCallback(() => {
    onToggle?.();
  }, [onToggle]);

  const handleCopyAddress = useCallback(
    async (address: string, network: string) => {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(network);
      setTimeout(() => setCopiedAddress(null), 2000);
    },
    []
  );

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
          className
        )}
      >
        {/* Header with Logo */}
        <div className="relative flex h-16 items-center justify-between border-b border-white/10 px-4 overflow-visible">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 transition-opacity hover:opacity-80 relative z-10"
          >
            <Image
              src="/cloudlogo.svg"
              alt="ELIZA"
              width={80}
              height={24}
              className={`invert shrink-0 ${isMobile ? "w-20" : "w-24"}`}
            />
          </Link>
          <div
            className={`flex items-center w-full ${
              isMobile ? "justify-start pl-4" : "justify-end"
            }`}
          >
            <div ref={tokensRef} tabIndex={-1}>
              {showTokens && (
                <div
                  id="token-addresses-sidebar"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="token-title-sidebar"
                  className="bg-[#0A0A0A] border border-white/10 p-4 sm:p-3 mt-2 w-[calc(100vw-1rem)] sm:w-[460px] max-w-[96vw] absolute top-full left-2 z-[60]"
                >
                  <div className="space-y-3">
                    <h3 id="token-title-sidebar" className="text-xl font-mono font-bold text-brand-orange text-start border-b border-white/10 pb-3 sm:px-3">
                      elizaOS Token Addresses
                    </h3>
                    <div className="space-y-4 sm:space-y-0 font-mono text-sm">
                      {TOKEN_ADDRESSES.map((token) => (
                        <button
                          type="button"
                          key={token.id}
                          onClick={() =>
                            handleCopyAddress(token.address, token.id)
                          }
                          className="group/token flex flex-col w-full gap-1 sm:gap-0 hover:bg-brand-orange/10 sm:p-3"
                        >
                          <div className="flex items-end gap-1">
                            <span className="text-brand-orange font-semibold">
                              {token.name}
                            </span>
                            <div
                              className="transition-opacity p-1 hover:bg-brand-orange/10 rounded sm:hidden cursor-pointer"
                              role="button"
                              tabIndex={0}
                              aria-label={`Copy ${token.name} address`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCopyAddress(token.address, token.id);
                                }
                              }}
                            >
                              {copiedAddress === token.id ? (
                                <Check className="size-3.5 text-brand-orange" />
                              ) : (
                                <Copy className="size-3.5 text-white/70" />
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 group">
                            <span className="text-white/70 break-all font-mono text-start tracking-tight sm:tracking-normal">
                              {token.address}
                            </span>
                            <div
                              className="hidden sm:flex shrink-0 opacity-100 sm:group-hover/token:opacity-100 sm:opacity-0 cursor-pointer"
                              role="button"
                              tabIndex={0}
                              aria-label={`Copy ${token.name} address`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCopyAddress(token.address, token.id);
                                }
                              }}
                            >
                              {copiedAddress === token.id ? (
                                <Check className="size-4 text-brand-orange" />
                              ) : (
                                <Copy className="size-4 text-white/70" />
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={() => setShowTokens(!showTokens)}
                aria-expanded={showTokens}
                aria-controls="token-addresses-sidebar"
                className="rounded-full hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-white/20"
                aria-label="View token addresses"
              >
                <div className="size-8 rounded-full bg-brand-orange flex items-center justify-center p-[5px]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 37.19 42.14"
                    className="size-full"
                  >
                    <polygon points="29.75 4.96 29.75 2.48 27.27 2.48 24.79 2.48 22.31 2.48 22.31 0 19.83 0 17.35 0 14.87 0 14.87 2.48 12.4 2.48 9.92 2.48 9.92 4.96 12.4 4.96 14.87 4.96 17.35 4.96 19.83 4.96 22.31 4.96 24.79 4.96 24.79 7.44 27.27 7.44 29.75 7.44 32.23 7.44 32.23 4.96 29.75 4.96" />
                    <polygon points="32.23 12.4 29.75 12.4 29.75 14.87 29.75 17.35 32.23 17.35 32.23 14.87 34.71 14.87 34.71 12.4 32.23 12.4" />
                    <polygon points="34.71 14.87 34.71 17.35 34.71 19.83 37.19 19.83 37.19 17.35 37.19 14.87 34.71 14.87" />
                    <polygon points="22.31 9.92 19.83 9.92 17.35 9.92 14.87 9.92 14.87 7.44 12.4 7.44 9.92 7.44 7.44 7.44 7.44 9.92 4.96 9.92 4.96 12.4 4.96 14.87 4.96 17.35 4.96 19.83 4.96 22.31 2.48 22.31 2.48 24.79 2.48 27.27 2.48 29.75 2.48 32.23 2.48 34.71 0 34.71 0 37.19 0 39.66 2.48 39.66 2.48 42.14 4.96 42.14 7.44 42.14 7.44 39.66 9.92 39.66 9.92 37.19 12.4 37.19 12.4 34.71 12.4 32.23 12.4 29.75 12.4 27.27 12.4 24.79 9.92 24.79 9.92 22.31 9.92 19.83 9.92 17.35 12.4 17.35 14.87 17.35 14.87 19.83 17.35 19.83 19.83 19.83 19.83 17.35 19.83 14.87 22.31 14.87 24.79 14.87 24.79 12.4 24.79 9.92 22.31 9.92" />
                    <polygon points="29.75 32.23 29.75 34.71 29.75 37.19 27.27 37.19 27.27 34.71 24.79 34.71 22.31 34.71 22.31 37.19 22.31 39.66 22.31 42.14 24.79 42.14 24.79 39.66 27.27 39.66 27.27 42.14 29.75 42.14 32.23 42.14 32.23 39.66 32.23 37.19 32.23 34.71 32.23 32.23 29.75 32.23" />
                  </svg>
                </div>
              </button>
            </div>
          </div>
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
