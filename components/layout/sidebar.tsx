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
import { X, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNavigationSection } from "./sidebar-section";
import { sidebarSections } from "./sidebar-data";
import { SidebarBottomPanel } from "./sidebar-bottom-panel";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface SidebarProps {
  className?: string;
  isOpen?: boolean;
  onToggle?: () => void;
  isAnonymous?: boolean;
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
  isAnonymous = false,
}: SidebarProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

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
          className,
        )}
      >
        {/* Header with Logo */}
        <div className="relative flex h-16 items-center justify-between border-b border-white/10 px-4">
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
            <Dialog>
              <DialogTrigger asChild>
                <button
                  className="rounded-full hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-white/20"
                  aria-label="View token addresses"
                >
                  <Image
                    src="/elizaOS_token_logo.png"
                    alt="ELIZA Token"
                    width={24}
                    height={24}
                    className="size-8 rounded-full"
                  />
                </button>
              </DialogTrigger>
              <DialogContent className="bg-[#0A0A0A] border-white/10 text-white max-w-md">
                <div className="space-y-6">
                  <DialogTitle className="text-xl font-mono font-bold text-brand-orange">
                    TOKEN_ADDRESSES
                  </DialogTitle>
                  <div className="space-y-4 font-mono text-sm">
                    {TOKEN_ADDRESSES.map((token) => (
                      <div key={token.id} className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-brand-orange font-semibold">
                            {token.name}
                          </span>
                          <button
                            onClick={() =>
                              handleCopyAddress(token.address, token.id)
                            }
                            className="transition-opacity p-1 hover:bg-brand-orange/10 rounded sm:hidden"
                            aria-label={`Copy ${token.name} address`}
                          >
                            {copiedAddress === token.id ? (
                              <Check className="size-3.5 text-brand-orange" />
                            ) : (
                              <Copy className="size-3.5 text-white/70" />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-2 group">
                          <span className="text-white/70 break-all font-mono">
                            {token.address}
                          </span>
                          <button
                            onClick={() =>
                              handleCopyAddress(token.address, token.id)
                            }
                            className="transition-opacity p-1 hover:bg-brand-orange/10 rounded hidden sm:block shrink-0"
                            aria-label={`Copy ${token.name} address`}
                          >
                            {copiedAddress === token.id ? (
                              <Check className="size-4 text-brand-orange" />
                            ) : (
                              <Copy className="size-4 text-white/70" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
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
