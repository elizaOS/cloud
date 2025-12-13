"use client";

import { Bot } from "lucide-react";
import Link from "next/link";

import { useAuth } from "@/lib/use-auth";

import { AuthButton } from "./auth-button";

export function Header() {
  const { authenticated, ready } = useAuth();

  // Determine logo link - go to chats when logged in, home when not
  const logoHref = ready && authenticated ? "/chats" : "/";

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/5 bg-[#050109]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href={logoHref} className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white">FriendAI</span>
        </Link>

        {/* Auth Button with Dropdown */}
        <AuthButton />
      </div>
    </header>
  );
}
