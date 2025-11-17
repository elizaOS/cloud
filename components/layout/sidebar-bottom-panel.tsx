/**
 * Sidebar Bottom Panel Component
 * Bottom panel for main sidebar matching Figma design node-id=1079-21876
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { usePrivy, useLogout } from "@privy-io/react-auth";
import { useRouter, usePathname } from "next/navigation";
import { useCreditsStream } from "@/hooks/use-credits-stream";
import { useUserProfile } from "@/hooks/use-user-profile";
import {
  Building2,
  CreditCard,
  Key,
  HelpCircle,
  LogOut,
  Coins,
  Loader2,
  UserPlus,
  LogIn,
  Settings,
  User,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CornerBrackets } from "@/components/brand";
import { useChatStore } from "@/stores/chat-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface SidebarBottomPanelProps {
  className?: string;
  isCollapsed?: boolean;
}

export function SidebarBottomPanel({ className, isCollapsed = false }: SidebarBottomPanelProps) {
  const { ready, authenticated, user } = usePrivy();
  const { logout } = useLogout();
  const router = useRouter();
  const pathname = usePathname();
  const { creditBalance, isLoading: loadingCredits } = useCreditsStream();
  const { profile } = useUserProfile();
  const { clearChatData } = useChatStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isDropdownOpen]);

  const getUserWallet = () => {
    if (user?.linkedAccounts) {
      for (const account of user.linkedAccounts) {
        if (
          account.type === "wallet" &&
          "address" in account &&
          typeof account.address === "string"
        ) {
          return account.address;
        }
      }
    }
    return null;
  };

  const getUserEmail = () => {
    if (user?.email?.address) {
      return user.email.address;
    }
    if (user?.linkedAccounts) {
      for (const account of user.linkedAccounts) {
        if ("address" in account && account.type === "email") {
          return account.address;
        }
        if ("email" in account && typeof account.email === "string") {
          return account.email;
        }
      }
    }
    return null;
  };

  const getUserName = () => {
    if (user?.google?.name) {
      return user.google.name;
    }
    if (user?.github?.username) {
      return user.github.username;
    }
    if (user?.linkedAccounts) {
      for (const account of user.linkedAccounts) {
        if ("name" in account && typeof account.name === "string") {
          return account.name;
        }
        if ("username" in account && typeof account.username === "string") {
          return account.username;
        }
      }
    }
    const email = getUserEmail();
    if (email) {
      return email.split("@")[0];
    }
    const wallet = getUserWallet();
    if (wallet) {
      return `${wallet.substring(0, 6)}...${wallet.substring(wallet.length - 4)}`;
    }
    return "User";
  };

  const getWalletAddress = () => {
    const wallet = getUserWallet();
    if (wallet) {
      return `${wallet.substring(0, 8)}...${wallet.substring(wallet.length - 6)}`;
    }
    return null;
  };

  const onSignOut = async () => {
    try {
      clearChatData();
      await logout();
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
      router.push("/");
    }
  };

  // Anonymous user view
  if (!ready || !authenticated || !user) {
    if (!ready) {
      return null;
    }

    if (isCollapsed) {
      return (
        <div className={cn("relative border-t border-white/10", className)}>
          <div className="relative z-10 px-4 py-4 flex flex-col items-center gap-3">
            <button
              onClick={() => router.push("/login")}
              title="Sign Up"
              className="p-2.5 bg-white hover:bg-white/90 text-black rounded-none transition-all duration-200"
            >
              <UserPlus className="h-6 w-6" />
            </button>
            <button
              onClick={() => router.push("/login")}
              title="Log In"
              className="p-2.5 border border-white/20 hover:bg-white/5 text-white/80 hover:text-white rounded-none transition-all duration-200"
            >
              <LogIn className="h-6 w-6" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={cn("relative border-t border-white/10", className)}>
        <CornerBrackets size="sm" className="opacity-30" />
        <div className="relative z-10 px-4 py-4">
          <div
            className="flex flex-col gap-3"
            style={{
              fontFamily: "var(--font-roboto-mono)",
              fontWeight: 400,
              letterSpacing: "-0.003em",
            }}
          >
            <div className="text-sm text-white/60 mb-1">
              Sign up for full access
            </div>
            <button
              onClick={() => router.push("/login")}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-2.5",
                "bg-white hover:bg-white/90",
                "text-black font-medium rounded-none",
                "transition-all duration-200 cursor-pointer",
              )}
              style={{
                fontFamily: "var(--font-roboto-mono)",
                fontWeight: 500,
                fontSize: "14px",
                lineHeight: "18px",
                letterSpacing: "-0.003em",
              }}
            >
              <UserPlus className="h-4 w-4" />
              <span>Sign Up</span>
            </button>
            <button
              onClick={() => router.push("/login")}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-2.5",
                "border border-white/20 hover:bg-white/5",
                "text-white/80 hover:text-white rounded-none",
                "transition-all duration-200 cursor-pointer",
              )}
              style={{
                fontFamily: "var(--font-roboto-mono)",
                fontWeight: 400,
                fontSize: "14px",
                lineHeight: "18px",
                letterSpacing: "-0.003em",
              }}
            >
              <LogIn className="h-4 w-4" />
              <span>Log In</span>
            </button>
            <div className="mt-2 space-y-1.5 text-xs text-white/40">
              <div className="flex items-center gap-2">
                <div
                  className="h-1 w-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: "#ffffff" }}
                />
                <span>Unlimited conversations</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="h-1 w-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: "#ffffff" }}
                />
                <span>Create custom agents</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="h-1 w-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: "#ffffff" }}
                />
                <span>Access premium features</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const menuItems = [
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
      href: "/dashboard/settings",
    },
  ];

  // Collapsed authenticated view
  if (isCollapsed) {
    return (
      <div className={cn("relative", className)}>
        <div className="flex flex-col gap-[8px] p-[16px] rounded-[6px]">
          {/* Settings Section */}
          <div className="flex flex-col gap-[16px] p-[16px]">
            <div className="flex gap-[20px] items-center justify-center rounded-[15px]">
              <button
                onClick={() => router.push("/dashboard/settings")}
                title="Settings"
                className="flex items-center justify-center gap-[12.052px] h-[24px] rounded-[4.571px] transition-all duration-200 hover:bg-white/5"
              >
                <Settings2 className="h-[24px] w-[24px]" style={{ color: "#a2a2a2" }} />
              </button>
            </div>
          </div>

          {/* User Button */}
          <div className="flex gap-[8px] h-[53px] items-center justify-center overflow-clip">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              title={getUserName()}
              className="border border-[#2e2e2e] flex items-center justify-center p-[16px] h-full w-full transition-opacity hover:opacity-80"
            >
              <User className="h-[24px] w-[24px]" style={{ color: "#a2a2a2" }} />
            </button>
          </div>
        </div>

        {/* Dropdown Menu - positioned absolutely when collapsed */}
        {isDropdownOpen && (
          <div
            ref={dropdownRef}
            className="absolute left-[88px] backdrop-blur backdrop-filter bg-[#101010] border border-[#2e2e2e] z-50"
            style={{ bottom: "16px", width: "207px" }}
          >
            {/* User Info Section */}
            <div className="border-b border-[#2e2e2e] px-4 py-4">
              <div className="flex flex-col gap-1">
                <p
                  className="truncate"
                  style={{
                    fontFamily: "Geist Mono, monospace",
                    fontWeight: 400,
                    fontSize: "16px",
                    lineHeight: "normal",
                    color: "#e1e1e1",
                  }}
                >
                  {getUserName()}
                </p>
                {getWalletAddress() && (
                  <p
                    style={{
                      fontFamily: "Geist Mono, monospace",
                      fontWeight: 400,
                      fontSize: "14px",
                      lineHeight: "normal",
                      color: "#a2a2a2",
                    }}
                  >
                    {getWalletAddress()}
                  </p>
                )}
              </div>
            </div>

            {/* Balance Section */}
            <div className="px-4 py-3">
              <div className="bg-[#1b1b1b] flex items-center gap-2 px-2 py-2">
                <Coins className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
                <div className="flex items-center gap-1">
                  {loadingCredits && creditBalance === null ? (
                    <span
                      style={{
                        fontFamily: "Geist Mono, monospace",
                        fontWeight: 400,
                        fontSize: "14px",
                        lineHeight: "normal",
                        color: "#a2a2a2",
                      }}
                    >
                      Loading...
                    </span>
                  ) : (
                    <>
                      <span
                        style={{
                          fontFamily: "Geist Mono, monospace",
                          fontWeight: 400,
                          fontSize: "14px",
                          lineHeight: "normal",
                          color: "#e1e1e1",
                        }}
                      >
                        {creditBalance !== null ? Number(creditBalance).toFixed(2) : "0.00"}
                      </span>
                      <span
                        style={{
                          fontFamily: "Geist Mono, monospace",
                          fontWeight: 400,
                          fontSize: "14px",
                          lineHeight: "normal",
                          color: "#a2a2a2",
                        }}
                      >
                        {" balance"}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Menu Items Section */}
            <div className="border-t border-[#2e2e2e] py-4 px-4">
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    router.push("/dashboard/account");
                  }}
                  className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity"
                >
                  <Building2 className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
                  <span
                    style={{
                      fontFamily: "Geist Mono, monospace",
                      fontWeight: 500,
                      fontSize: "14px",
                      lineHeight: "normal",
                      letterSpacing: "-0.056px",
                      color: "#a2a2a2",
                    }}
                  >
                    Account
                  </span>
                </button>

                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    router.push("/dashboard/billing");
                  }}
                  className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity"
                >
                  <CreditCard className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
                  <span
                    style={{
                      fontFamily: "Geist Mono, monospace",
                      fontWeight: 500,
                      fontSize: "14px",
                      lineHeight: "normal",
                      letterSpacing: "-0.056px",
                      color: "#a2a2a2",
                    }}
                  >
                    Billing
                  </span>
                </button>

                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    router.push("/dashboard/settings?tab=api-keys");
                  }}
                  className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity"
                >
                  <Key className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
                  <span
                    style={{
                      fontFamily: "Geist Mono, monospace",
                      fontWeight: 500,
                      fontSize: "14px",
                      lineHeight: "normal",
                      letterSpacing: "-0.056px",
                      color: "#a2a2a2",
                    }}
                  >
                    API Keys
                  </span>
                </button>

                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    window.open("https://docs.eliza.com", "_blank");
                  }}
                  className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity"
                >
                  <HelpCircle className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
                  <span
                    style={{
                      fontFamily: "Geist Mono, monospace",
                      fontWeight: 500,
                      fontSize: "14px",
                      lineHeight: "normal",
                      letterSpacing: "-0.056px",
                      color: "#a2a2a2",
                    }}
                  >
                    Help
                  </span>
                </button>
              </div>
            </div>

            {/* Logout Section */}
            <div className="border-t border-[#2e2e2e] px-4 py-4">
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  onSignOut();
                }}
                className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity"
              >
                <LogOut className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
                <span
                  style={{
                    fontFamily: "Geist Mono, monospace",
                    fontWeight: 500,
                    fontSize: "14px",
                    lineHeight: "normal",
                    letterSpacing: "-0.056px",
                    color: "#a2a2a2",
                  }}
                >
                  Logout
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Expanded authenticated view - matching Figma design node-id=1079-21876
  return (
    <div ref={dropdownRef} className={cn("relative", className)}>
      {/* Settings Section */}
      <div className="px-6 py-4 cursor-pointer" onClick={() => router.push("/dashboard/settings")}>
        <div className="flex items-center gap-2 px-4 py-4">
          <Settings2 className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
          <span
            style={{
              fontFamily: "Geist Mono, monospace",
              fontWeight: 500,
              fontSize: "16px",
              lineHeight: "normal",
              color: "#a2a2a2",
            }}
          >
            Settings
          </span>
        </div>
      </div>

      {/* User Button - triggers dropdown */}
      <div className="px-6 pb-2">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center gap-2 w-full border border-[#2e2e2e] px-4 py-4 hover:opacity-80 transition-opacity"
          style={{ height: "53px" }}
        >
          <User className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
          <span
            className="truncate"
            style={{
              fontFamily: "Geist Mono, monospace",
              fontWeight: 400,
              fontSize: "16px",
              lineHeight: "normal",
              color: "#a2a2a2",
            }}
          >
            {getUserName()}
          </span>
        </button>
      </div>

      {/* Dropdown Menu - shown when button is clicked */}
      {isDropdownOpen && (
        <div
          className="absolute left-6 backdrop-blur backdrop-filter bg-[#101010] border border-[#2e2e2e] z-50"
          style={{ bottom: "69px", width: "207px" }}
        >
          {/* User Info Section */}
          <div className="border-b border-[#2e2e2e] px-4 py-4">
            <div className="flex flex-col gap-1">
              <p
                className="truncate"
                style={{
                  fontFamily: "Geist Mono, monospace",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "normal",
                  color: "#e1e1e1",
                }}
              >
                {getUserName()}
              </p>
              {getWalletAddress() && (
                <p
                  style={{
                    fontFamily: "Geist Mono, monospace",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "normal",
                    color: "#a2a2a2",
                  }}
                >
                  {getWalletAddress()}
                </p>
              )}
            </div>
          </div>

          {/* Balance Section */}
          <div className="px-4 py-3">
            <div className="bg-[#1b1b1b] flex items-center gap-2 px-2 py-2">
              <Coins className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
              <div className="flex items-center gap-1">
                {loadingCredits && creditBalance === null ? (
                  <span
                    style={{
                      fontFamily: "Geist Mono, monospace",
                      fontWeight: 400,
                      fontSize: "14px",
                      lineHeight: "normal",
                      color: "#a2a2a2",
                    }}
                  >
                    Loading...
                  </span>
                ) : (
                  <>
                    <span
                      style={{
                        fontFamily: "Geist Mono, monospace",
                        fontWeight: 400,
                        fontSize: "14px",
                        lineHeight: "normal",
                        color: "#e1e1e1",
                      }}
                    >
                      {creditBalance !== null ? Number(creditBalance).toFixed(2) : "0.00"}
                    </span>
                    <span
                      style={{
                        fontFamily: "Geist Mono, monospace",
                        fontWeight: 400,
                        fontSize: "14px",
                        lineHeight: "normal",
                        color: "#a2a2a2",
                      }}
                    >
                      {" balance"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Menu Items Section */}
          <div className="border-t border-[#2e2e2e] py-4 px-4">
            <div className="flex flex-col gap-4">
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  router.push("/dashboard/account");
                }}
                className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity"
              >
                <Building2 className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
                <span
                  style={{
                    fontFamily: "Geist Mono, monospace",
                    fontWeight: 500,
                    fontSize: "14px",
                    lineHeight: "normal",
                    letterSpacing: "-0.056px",
                    color: "#a2a2a2",
                  }}
                >
                  Account
                </span>
              </button>

              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  router.push("/dashboard/billing");
                }}
                className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity"
              >
                <CreditCard className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
                <span
                  style={{
                    fontFamily: "Geist Mono, monospace",
                    fontWeight: 500,
                    fontSize: "14px",
                    lineHeight: "normal",
                    letterSpacing: "-0.056px",
                    color: "#a2a2a2",
                  }}
                >
                  Billing
                </span>
              </button>

              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  router.push("/dashboard/settings?tab=api-keys");
                }}
                className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity"
              >
                <Key className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
                <span
                  style={{
                    fontFamily: "Geist Mono, monospace",
                    fontWeight: 500,
                    fontSize: "14px",
                    lineHeight: "normal",
                    letterSpacing: "-0.056px",
                    color: "#a2a2a2",
                  }}
                >
                  API Keys
                </span>
              </button>

              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  window.open("https://docs.eliza.com", "_blank");
                }}
                className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity"
              >
                <HelpCircle className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
                <span
                  style={{
                    fontFamily: "Geist Mono, monospace",
                    fontWeight: 500,
                    fontSize: "14px",
                    lineHeight: "normal",
                    letterSpacing: "-0.056px",
                    color: "#a2a2a2",
                  }}
                >
                  Help
                </span>
              </button>
            </div>
          </div>

          {/* Logout Section */}
          <div className="border-t border-[#2e2e2e] px-4 py-4">
            <button
              onClick={() => {
                setIsDropdownOpen(false);
                onSignOut();
              }}
              className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity"
            >
              <LogOut className="h-4 w-4 shrink-0" style={{ color: "#a2a2a2" }} />
              <span
                style={{
                  fontFamily: "Geist Mono, monospace",
                  fontWeight: 500,
                  fontSize: "14px",
                  lineHeight: "normal",
                  letterSpacing: "-0.056px",
                  color: "#a2a2a2",
                }}
              >
                Logout
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
