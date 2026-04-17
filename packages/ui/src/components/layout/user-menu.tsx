/**
 * User menu dropdown component displaying authentication state and user actions.
 * Shows user avatar, credit balance, and navigation options (settings, API keys, logout).
 * Handles logout and chat data clearing.
 *
 * Wrapped in an error boundary to prevent crashes from propagating to the page.
 */

"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@elizaos/cloud-ui";
import { useLogout, usePrivy } from "@privy-io/react-auth";
import {
  BookOpen,
  Coins,
  Key,
  Loader2,
  LogOut,
  MessageSquare,
  SettingsIcon,
  UserCircle,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { useCredits } from "@/lib/providers/CreditsProvider";
import { useChatStore } from "@/lib/stores/chat-store";
import { FeedbackModal } from "./feedback-modal";

interface UserProfile {
  id: string;
  name: string | null;
  avatar: string | null;
  email: string | null;
}

// ---------------------------------------------------------------------------
// Error Boundary – catches render errors so the whole page doesn't crash
// ---------------------------------------------------------------------------
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class UserMenuErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[UserMenu] Render error caught by boundary:",
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          // Fallback: direct link to account page in case dropdown fails
          <a
            href="/dashboard/account"
            className="flex items-center justify-center h-8 w-8 md:h-10 md:w-10 border border-white/10 bg-white/5 hover:border-orange-500/50 hover:bg-white/10 transition-colors opacity-80"
            title="Account Settings"
          >
            <UserCircle className="h-5 w-5 text-white" />
          </a>
        )
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Safe helper to extract user wallet from Privy user object
// ---------------------------------------------------------------------------
function safeGetUserWallet(
  user: ReturnType<typeof usePrivy>["user"],
): string | null {
  try {
    if (!user) return null;

    // Direct wallet property
    if (user.wallet?.address && typeof user.wallet.address === "string") {
      return user.wallet.address;
    }

    // Check linked accounts for wallet
    const accounts = user.linkedAccounts;
    if (Array.isArray(accounts)) {
      for (const account of accounts) {
        if (
          account &&
          account.type === "wallet" &&
          "address" in account &&
          typeof (account as { address: unknown }).address === "string"
        ) {
          return (account as { address: string }).address;
        }
      }
    }
  } catch (e) {
    console.warn("[UserMenu] Error reading wallet:", e);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Safe helper to extract user email from Privy user object
// ---------------------------------------------------------------------------
function safeGetUserEmail(
  user: ReturnType<typeof usePrivy>["user"],
): string | null {
  try {
    if (!user) return null;

    // Direct email property
    if (user.email?.address && typeof user.email.address === "string") {
      return user.email.address;
    }

    // Check linked accounts
    const accounts = user.linkedAccounts;
    if (Array.isArray(accounts)) {
      for (const account of accounts) {
        if (!account) continue;
        if (account.type === "email" && "address" in account) {
          const addr = (account as { address: unknown }).address;
          if (typeof addr === "string") return addr;
        }
        if ("email" in account) {
          const email = (account as { email: unknown }).email;
          if (typeof email === "string") return email;
        }
      }
    }
  } catch (e) {
    console.warn("[UserMenu] Error reading email:", e);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Safe helper to extract user display name from Privy user object
// ---------------------------------------------------------------------------
function safeGetUserName(user: ReturnType<typeof usePrivy>["user"]): string {
  try {
    if (!user) return "User";

    // Try Google name
    if (user.google?.name && typeof user.google.name === "string") {
      return user.google.name;
    }

    // Try GitHub username
    if (user.github?.username && typeof user.github.username === "string") {
      return user.github.username;
    }

    // Try Twitter username
    if (user.twitter?.username && typeof user.twitter.username === "string") {
      return user.twitter.username;
    }

    // Try Discord username
    if (user.discord?.username && typeof user.discord.username === "string") {
      return user.discord.username;
    }

    // Try linked accounts
    const accounts = user.linkedAccounts;
    if (Array.isArray(accounts)) {
      for (const account of accounts) {
        if (!account) continue;
        if (
          "name" in account &&
          typeof (account as { name: unknown }).name === "string"
        ) {
          return (account as { name: string }).name;
        }
        if (
          "username" in account &&
          typeof (account as { username: unknown }).username === "string"
        ) {
          return (account as { username: string }).username;
        }
      }
    }

    // Fall back to email prefix
    const email = safeGetUserEmail(user);
    if (email) {
      return email.split("@")[0] || "User";
    }

    // Fall back to truncated wallet
    const wallet = safeGetUserWallet(user);
    if (wallet && wallet.length >= 10) {
      return `${wallet.substring(0, 6)}...${wallet.substring(wallet.length - 4)}`;
    }
  } catch (e) {
    console.warn("[UserMenu] Error reading name:", e);
  }
  return "User";
}

// ---------------------------------------------------------------------------
// Safe helper to get user identifier (wallet or email)
// ---------------------------------------------------------------------------
function safeGetUserIdentifier(
  user: ReturnType<typeof usePrivy>["user"],
): string {
  try {
    const wallet = safeGetUserWallet(user);
    if (wallet && wallet.length >= 14) {
      return `${wallet.substring(0, 8)}...${wallet.substring(wallet.length - 6)}`;
    }
    const email = safeGetUserEmail(user);
    if (email) return email;
  } catch (e) {
    console.warn("[UserMenu] Error reading identifier:", e);
  }
  return "Connected";
}

// ---------------------------------------------------------------------------
// Safe helper to get user initials for avatar fallback
// ---------------------------------------------------------------------------
function safeGetInitials(
  profile: UserProfile | null,
  user: ReturnType<typeof usePrivy>["user"],
): string {
  try {
    const name = profile?.name || safeGetUserName(user);
    if (name && name !== "User" && name.trim().length > 0) {
      const parts = name.trim().split(/\s+/).filter(Boolean);
      if (parts.length > 0 && parts[0].length > 0) {
        return parts
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);
      }
    }
    const email = profile?.email || safeGetUserEmail(user);
    if (email && email.length >= 2) {
      return email.slice(0, 2).toUpperCase();
    }
  } catch (e) {
    console.warn("[UserMenu] Error computing initials:", e);
  }
  return "U";
}

// ---------------------------------------------------------------------------
// Safe credit balance formatter
// ---------------------------------------------------------------------------
function formatCreditBalance(balance: number | null): string {
  try {
    if (balance === null || balance === undefined) return "0.00";
    const num = Number(balance);
    if (Number.isNaN(num) || !Number.isFinite(num)) return "0.00";
    return num.toFixed(2);
  } catch {
    return "0.00";
  }
}

type PrivyUser = ReturnType<typeof usePrivy>["user"];

interface UserMenuProps {
  preserveWhileUnauthed?: boolean;
}

// ---------------------------------------------------------------------------
// Main component (inner)
// ---------------------------------------------------------------------------
function UserMenuInner({ preserveWhileUnauthed = false }: UserMenuProps) {
  const { ready, authenticated, user } = usePrivy();
  const pathname = usePathname();
  const { logout } = useLogout();
  const router = useRouter();
  const { creditBalance, isLoading: loadingCredits } = useCredits();
  const { clearChatData } = useChatStore();

  // User profile state for avatar
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [lastAuthenticatedUser, setLastAuthenticatedUser] =
    useState<PrivyUser | null>(null);

  useEffect(() => {
    if (authenticated && user) {
      setLastAuthenticatedUser(user);
      return;
    }

    if (!preserveWhileUnauthed) {
      setLastAuthenticatedUser(null);
      setUserProfile(null);
    }
  }, [authenticated, user, preserveWhileUnauthed]);

  const effectiveUser =
    authenticated && user
      ? user
      : preserveWhileUnauthed
        ? lastAuthenticatedUser
        : null;

  // Fetch user profile from API to get avatar
  useEffect(() => {
    if (!authenticated) return;

    let mounted = true;

    const fetchProfile = async () => {
      try {
        const response = await fetch("/api/v1/user");
        if (response.ok && mounted) {
          const data = await response.json();
          if (data.success && data.data) {
            setUserProfile({
              id: data.data.id ?? "",
              name: data.data.name ?? null,
              avatar: data.data.avatar ?? null,
              email: data.data.email ?? null,
            });
          }
        }
      } catch (error) {
        console.error("[UserMenu] Failed to fetch user profile:", error);
      }
    };

    fetchProfile();

    // Listen for avatar updates and post-migration refreshes.
    const handleProfileRefresh = () => {
      void fetchProfile();
    };
    window.addEventListener("user-avatar-updated", handleProfileRefresh);
    window.addEventListener("anon-migration-complete", handleProfileRefresh);

    return () => {
      mounted = false;
      window.removeEventListener("user-avatar-updated", handleProfileRefresh);
      window.removeEventListener(
        "anon-migration-complete",
        handleProfileRefresh,
      );
    };
  }, [authenticated]);

  // Loading state
  if (!ready && !effectiveUser) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  // Build login URL with returnTo parameter to return to current page after login
  const loginUrl = (() => {
    const fullUrl =
      pathname + (typeof window !== "undefined" ? window.location.search : "");
    return `/login?returnTo=${encodeURIComponent(fullUrl)}`;
  })();

  // Signed out state — use plain <a> tags to avoid dependency on client-side router
  // which can break when RSC navigation has issues
  if (!effectiveUser) {
    return (
      <div className="flex items-center gap-2">
        <a href={loginUrl}>
          <Button variant="ghost" size="sm" disabled={!ready}>
            Log in
          </Button>
        </a>
        <a href={loginUrl}>
          <Button size="sm" disabled={!ready}>
            Sign Up
          </Button>
        </a>
      </div>
    );
  }

  // Handle sign out
  const onSignOut = async () => {
    try {
      // Clear chat data (rooms, entityId, localStorage)
      clearChatData();

      // Call Privy's logout to clear authentication state
      await logout();

      // Use router.replace to avoid browser history pollution
      // This prevents back button issues after re-login
      router.replace("/");
    } catch (error) {
      console.error("[UserMenu] Error during sign out:", error);
      // Still try to redirect even if logout partially fails
      router.replace("/");
    }
  };

  // Pre-compute all display values safely (outside JSX to keep render clean)
  const displayName = safeGetUserName(effectiveUser);
  const displayIdentifier = safeGetUserIdentifier(effectiveUser);
  const initials = safeGetInitials(userProfile, effectiveUser);
  const feedbackName = userProfile?.name || displayName;
  const feedbackEmail =
    userProfile?.email || safeGetUserEmail(effectiveUser) || "";

  // Signed in state
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative h-8 w-8 border-white/10 bg-white/5 p-0 hover:border-[#FF5800]/50 hover:bg-white/10 md:h-10 md:w-10"
          >
            <Avatar className="h-8 w-8 md:h-10 md:w-10 rounded-none">
              {userProfile?.avatar && (
                <AvatarImage
                  src={userProfile.avatar}
                  alt={userProfile.name || "User avatar"}
                  className="object-cover"
                />
              )}
              <AvatarFallback className="rounded-none bg-gradient-to-br from-[#FF5800]/20 to-[#FF5800]/5 font-semibold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        {/* Keep the menu lazily mounted. Eager mounting (`forceMount`) can trip the
            error boundary during transient auth/provider churn even while the menu is closed. */}
        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{displayName}</p>
              <p className="text-xs leading-none text-muted-foreground">
                {displayIdentifier}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-2 py-2">
            {loadingCredits && creditBalance === null ? (
              <div className="flex items-center gap-2 border border-white/10 bg-white/5 px-2 py-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Loading...
                </span>
              </div>
            ) : (
              <a href="/dashboard/settings?tab=billing" className="block">
                <Badge
                  variant="secondary"
                  className="gap-1.5 px-3 py-1.5 w-full justify-center cursor-pointer hover:bg-white/10"
                >
                  <Coins className="h-3.5 w-3.5 select-none" />
                  <span className="font-semibold select-none">
                    ${formatCreditBalance(creditBalance)}
                  </span>
                  <span className="text-xs opacity-80 select-none">
                    balance
                  </span>
                </Badge>
              </a>
            )}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/dashboard/account">
              <UserCircle className="mr-2 h-4 w-4" />
              <span>Account</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="/dashboard/settings">
              <SettingsIcon className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="/dashboard/settings?tab=billing">
              <Coins className="mr-2 h-4 w-4" />
              <span>Billing</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="/dashboard/api-keys">
              <Key className="mr-2 h-4 w-4" />
              <span>API Keys</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="/docs">
              <BookOpen className="mr-2 h-4 w-4" />
              <span>Docs</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setFeedbackOpen(true)}>
            <MessageSquare className="mr-2 h-4 w-4" />
            <span>Feedback</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="bg-red-500/40 data-[highlighted]:bg-red-500/60 data-[highlighted]:text-white"
            onClick={onSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FeedbackModal
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        defaultName={feedbackName}
        defaultEmail={feedbackEmail}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Exported component – wrapped in error boundary
// ---------------------------------------------------------------------------
export default function UserMenu({
  preserveWhileUnauthed = false,
}: UserMenuProps) {
  return (
    <UserMenuErrorBoundary>
      <UserMenuInner preserveWhileUnauthed={preserveWhileUnauthed} />
    </UserMenuErrorBoundary>
  );
}
