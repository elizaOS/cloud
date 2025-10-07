/**
 * Landing Header Component
 * Header for the unauthenticated landing page
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useThemeLogo } from "./use-theme-logo";

interface LandingHeaderProps {
  signInUrl: string;
  signUpUrl: string;
}

export default function LandingHeader({
  signInUrl,
  signUpUrl,
}: LandingHeaderProps) {
  const logoSrc = useThemeLogo();

  return (
    <header className="border-b">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src={logoSrc}
            alt="elizaOS"
            width={120}
            height={40}
            className="h-8 w-auto"
            priority
            key={logoSrc}
          />
        </Link>
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
