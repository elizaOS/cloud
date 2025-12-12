/**
 * Application header component with navigation and user menu.
 * Memoized to prevent unnecessary re-renders from parent state changes.
 *
 * @param props - Header configuration
 * @param props.onToggleSidebar - Callback to toggle mobile sidebar visibility
 * @param props.children - Additional content to render in header
 * @param props.isAnonymous - Whether user is anonymous (shows sign up button instead of user menu)
 */

"use client";

import { memo, useCallback, useState } from "react";
import { Menu, LogIn, Plus } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { BrandButton } from "@/components/brand";
import UserMenu from "./user-menu";
import { usePageHeader } from "./page-header-context";
import { QuickCreateDialog } from "@/components/builders";

interface HeaderProps {
  onToggleSidebar: () => void;
  children?: React.ReactNode;
  isAnonymous?: boolean;
}

function HeaderComponent({
  onToggleSidebar,
  children,
  isAnonymous = false,
}: HeaderProps) {
  const { pageInfo } = usePageHeader();
  const { login } = usePrivy();
  const [showQuickCreate, setShowQuickCreate] = useState(false);

  // Memoize login handler to prevent unnecessary re-renders
  const handleLogin = useCallback(() => {
    login();
  }, [login]);

  return (
    <header className="flex h-16 items-center justify-between border-b border-white/10 bg-black/40 px-4 md:px-6">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* Mobile Menu Button */}
        <BrandButton
          variant="ghost"
          size="icon"
          className="md:hidden shrink-0"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation"
        >
          <Menu className="h-5 w-5 text-white" />
        </BrandButton>

        {/* Page Title and Description */}
        {pageInfo && (
          <div className="flex flex-col min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight truncate text-white">
              {pageInfo.title}
            </h1>
            <p className="text-xs text-white/60 truncate hidden md:block">
              {pageInfo.description}
            </p>
          </div>
        )}
      </div>

      {/* Right side content */}
      <div className="flex items-center gap-4 shrink-0">
        {pageInfo?.actions && <div>{pageInfo.actions}</div>}
        {children}

        {/* Show signup button for anonymous users, otherwise user menu */}
        {isAnonymous ? (
          <BrandButton
            variant="primary"
            size="sm"
            onClick={handleLogin}
            className="gap-2"
          >
            <LogIn className="h-4 w-4" />
            <span className="hidden md:inline">Sign Up Free</span>
            <span className="md:hidden">Sign Up</span>
          </BrandButton>
        ) : (
          <div className="flex flex-row items-center gap-3">
            {/* Quick Create Button */}
            <BrandButton
              variant="primary"
              size="sm"
              onClick={() => setShowQuickCreate(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden md:inline">Create</span>
            </BrandButton>
            <UserMenu />
          </div>
        )}
      </div>

      {/* Quick Create Dialog */}
      <QuickCreateDialog
        open={showQuickCreate}
        onOpenChange={setShowQuickCreate}
      />
    </header>
  );
}

// Memoize the header to prevent re-renders when parent state changes
const Header = memo(HeaderComponent);
export default Header;
