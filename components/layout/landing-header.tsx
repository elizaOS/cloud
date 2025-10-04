/**
 * Landing Header Component
 * Header for the unauthenticated landing page
 */

"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Sparkles } from "lucide-react";

interface LandingHeaderProps {
  signInUrl: string;
  signUpUrl: string;
}

export default function LandingHeader({
  signInUrl,
  signUpUrl,
}: LandingHeaderProps) {
  return (
    <header className="border-b">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6" />
          <span className="text-xl font-bold">elizaOS Cloud</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild>
            <Link href={signInUrl}>Log in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href={signUpUrl}>Get Started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
