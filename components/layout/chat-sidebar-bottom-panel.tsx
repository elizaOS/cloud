/**
 * Chat Sidebar Bottom Panel Component
 * Bottom panel for chat sidebar matching Figma design node-id=1079-21876
 */

"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { Building2, CreditCard, Key, HelpCircle, LogOut, Coins, User, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";

interface ChatSidebarBottomPanelProps {
  className?: string;
  isCollapsed?: boolean;
}

export function ChatSidebarBottomPanel({ className, isCollapsed = false }: ChatSidebarBottomPanelProps) {
  const { ready, authenticated, user, logout } = usePrivy();
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const response = await fetch("/api/credits/balance");
        if (response.ok) {
          const data = await response.json();
          setBalance(data.balance);
        }
      } catch (error) {
        console.error("Failed to fetch balance:", error);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    if (authenticated) {
      fetchBalance();
    }
  }, [authenticated]);

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
    if (user?.email?.address) {
      return user.email.address.split("@")[0];
    }
    return "User";
  };

  const getWalletAddress = () => {
    if (user?.wallet?.address) {
      const address = user.wallet.address;
      return `${address.substring(0, 8)}...${address.substring(address.length - 6)}`;
    }
    return null;
  };

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  if (!ready || !authenticated || !user) {
    return null;
  }

  // Collapsed view
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
                  {isLoadingBalance ? (
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
                        {balance !== null ? balance.toFixed(2) : "0.00"}
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
                    router.push("/dashboard/settings?tab=usage");
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
                  handleLogout();
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

  // Expanded view
  return (
    <div ref={dropdownRef} className={cn("relative", className)}>
      {/* Settings Section */}
      <div className="px-6 py-4">
        <div className="flex items-center gap-2 px-4 py-4 cursor-pointer" onClick={
          () => { router.push("/dashboard/settings") }
        }>
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
                {isLoadingBalance ? (
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
                      {balance !== null ? balance.toFixed(2) : "0.00"}
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
                  router.push("/dashboard/settings?tab=usage");
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
                handleLogout();
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
