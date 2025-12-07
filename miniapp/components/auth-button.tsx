"use client";

import { Bot, ChevronDown, Coins, Loader2, LogIn, LogOut, Settings, User, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { getBilling } from "@/lib/cloud-api";
import { useAuth } from "@/lib/use-auth";

export function AuthButton() {
  const { ready, authenticated, login, logout, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [credits, setCredits] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch credits when authenticated
  useEffect(() => {
    let cancelled = false;
    
    if (authenticated) {
      getBilling()
        .then(({ billing }) => {
          if (!cancelled) setCredits(billing.creditBalance);
        })
        .catch(() => {
          if (!cancelled) setCredits(null);
        });
    }
    
    return () => {
      cancelled = true;
      // Clear credits on cleanup (when auth changes or component unmounts)
      setCredits(null);
    };
  }, [authenticated]);

  // Format credits for display (convert dollars to credits: 1 dollar = 100 credits)
  const formatCredits = (amount: string) => {
    const dollars = parseFloat(amount);
    const credits = Math.round(dollars * 100);
    if (credits >= 10000) {
      return `${(credits / 1000).toFixed(1)}k`;
    }
    return credits.toLocaleString();
  };

  // Still loading
  if (!ready) {
    return (
      <button
        disabled
        className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-white/50"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </button>
    );
  }

  // Not authenticated - show login button
  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
      >
        <LogIn className="h-4 w-4" />
        <span>Sign In</span>
      </button>
    );
  }

  // Authenticated - show user dropdown
  const displayName = user?.email || user?.name || "User";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 transition-colors hover:bg-white/10"
      >
        {/* Credits Badge */}
        {credits && (
          <div className="flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-0.5">
            <Coins className="h-3 w-3 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">
              {formatCredits(credits)} credits
            </span>
          </div>
        )}
        
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent-brand-600">
          <User className="h-4 w-4 text-white" />
        </div>
        <span className="hidden max-w-[120px] truncate text-sm text-white/80 sm:inline">
          {displayName}
        </span>
        <ChevronDown className={`h-4 w-4 text-white/50 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#0a0512] shadow-xl shadow-black/50">
          {/* User Info */}
          <div className="border-b border-white/10 px-4 py-3">
            <p className="truncate text-sm font-medium text-white">{displayName}</p>
            {credits && (
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-400">
                <Coins className="h-3 w-3" />
                {formatCredits(credits)} credits
              </p>
            )}
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <Link
              href="/chats"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Bot className="h-4 w-4 text-brand-400" />
              My Characters
            </Link>
            <Link
              href="/wallet"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Wallet className="h-4 w-4 text-emerald-400" />
              Wallet & Earnings
            </Link>
            <Link
              href="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Settings className="h-4 w-4 text-white/60" />
              Settings
            </Link>
          </div>

          {/* Logout */}
          <div className="border-t border-white/10 py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 transition-colors hover:bg-white/5 hover:text-red-300"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
