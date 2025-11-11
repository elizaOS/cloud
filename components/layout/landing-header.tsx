/**
 * Landing Header Component
 * Header for the landing page - shows different UI for authenticated vs unauthenticated users
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LockOnButton } from "@/components/brand";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import UserMenu from "@/components/layout/user-menu";

export default function LandingHeader() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  // No auto-redirect - let users stay on landing page even when logged in

  const handleLogin = () => {
    router.push("/login");
  };

  const handleDashboard = () => {
    router.push("/dashboard");
  };

  return (
    <header className="border-b border-white/10 bg-[#0A0A0A] sticky top-0 z-50 backdrop-blur-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: "#FF5800" }}
            />
            <Image
              src="/eliza-font.svg"
              alt="ELIZA"
              width={80}
              height={24}
              className="h-5 w-auto"
            />
          </div>
        </Link>
        
        {/* Center Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          <a 
            href="https://eliza.how"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-all duration-200 hover:drop-shadow-[0_0_8px_rgba(255,88,0,0.6)] active:scale-95"
            style={{
              fontFamily: "Roboto Mono, monospace",
              fontWeight: 400,
              fontSize: "16px",
              lineHeight: "21px",
              letterSpacing: "-0.002em",
              color: "#A2A0A3"
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#FF5800"}
            onMouseLeave={(e) => e.currentTarget.style.color = "#A2A0A3"}
          >
            Docs
          </a>
          <a 
            href="https://github.com/elizaos"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-all duration-200 hover:drop-shadow-[0_0_8px_rgba(255,88,0,0.6)] active:scale-95"
            style={{
              fontFamily: "Roboto Mono, monospace",
              fontWeight: 400,
              fontSize: "16px",
              lineHeight: "21px",
              letterSpacing: "-0.002em",
              color: "#A2A0A3"
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#FF5800"}
            onMouseLeave={(e) => e.currentTarget.style.color = "#A2A0A3"}
          >
            Github
          </a>
          <span 
            className="opacity-40 cursor-not-allowed"
            style={{
              fontFamily: "Roboto Mono, monospace",
              fontWeight: 400,
              fontSize: "16px",
              lineHeight: "21px",
              letterSpacing: "-0.002em",
              color: "#A2A0A3"
            }}
          >
            About
          </span>
          <span 
            className="opacity-40 cursor-not-allowed"
            style={{
              fontFamily: "Roboto Mono, monospace",
              fontWeight: 400,
              fontSize: "16px",
              lineHeight: "21px",
              letterSpacing: "-0.002em",
              color: "#A2A0A3"
            }}
          >
            Pricing
          </span>
        </nav>

        <div className="flex items-center gap-3">
          {authenticated ? (
            <>
              {/* Authenticated user - show Dashboard + UserMenu */}
              <Button
                size="sm"
                onClick={handleDashboard}
                className="bg-[#FF5800] hover:bg-[#FF5800]/90 text-white"
              >
                Dashboard
              </Button>
              <UserMenu />
            </>
          ) : (
            <>
              {/* Unauthenticated - show Login + Get Started */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogin}
                disabled={!ready}
                className="text-white/70 hover:text-white hover:bg-white/5"
              >
                Log in
              </Button>
              <LockOnButton
                size="sm"
                onClick={handleLogin}
                disabled={!ready}
              >
                Get Started
              </LockOnButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
