/**
 * Chat Sidebar Bottom Panel Component
 * Bottom panel for chat sidebar matching Figma design node-id=1079-21934
 */

"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { Building2, CreditCard, Key, HelpCircle, LogOut, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface ChatSidebarBottomPanelProps {
  className?: string;
}

export function ChatSidebarBottomPanel({ className }: ChatSidebarBottomPanelProps) {
  const { ready, authenticated, user, logout } = usePrivy();
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);

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

  return (
    <div className={cn("flex flex-col gap-2 backdrop-blur backdrop-filter bg-[#101010] border border-[#2e2e2e]", className)}>
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
      <div className="px-4">
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
      <div className="border-t border-[#2e2e2e] pt-4 px-4">
        <div className="flex flex-col gap-4">
          <button
            onClick={() => router.push("/dashboard/settings")}
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
            onClick={() => router.push("/dashboard/settings?tab=usage")}
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
            onClick={() => router.push("/dashboard/settings?tab=api-keys")}
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
            onClick={() => window.open("https://docs.eliza.com", "_blank")}
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
          onClick={handleLogout}
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
  );
}
