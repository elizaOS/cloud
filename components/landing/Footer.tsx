/**
 * Footer component for the landing page.
 * Displays navigation links, social links, and branding with decorative background image.
 */

"use client";

import { Github } from "lucide-react";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="relative border-t border-white/10 bg-black ">
      {/* Faded footer image underlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden px-8 md:px-48 lg:px-64 xl:px-80 2xl:px-96 "></div>

      <div className="container mx-auto px-6 py-16 relative z-10">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8 items-center">
          {/* 1. Left section (Text/Copyright) */}
          <div className="flex flex-col justify-between">
            <div>
              <div className="mb-8 flex items-center gap-3">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: "#FF5800" }}
                />
                <h3
                  className="text-2xl md:text-3xl font-bold uppercase tracking-wider text-white"
                  style={{ fontFamily: "var(--font-geist-sans)" }}
                >
                  START
                  <br />
                  BUILDING
                </h3>
              </div>
            </div>
            <p className="text-sm text-white/60">© 2025 Eliza AI · USA</p>
          </div>

          <div className="hidden md:flex justify-center">
            <Image
              src="/eliza-footer.png"
              alt="Footer Decorative Image"
              height={160}
              width={160}
              className="w-48 h-auto"
              draggable={false}
            />
          </div>

          {/* 3. Right section (Navigation/Social Icons) */}
          <div className="flex flex-col items-start gap-4 md:items-end">
            {/* Navigation */}
            <nav className="flex flex-col gap-3 md:text-right">
              <a
                href="https://elizaos.ai/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-base text-white transition-colors hover:text-[#FF5800]"
              >
                Docs
              </a>
              <a
                href="/privacy-policy"
                className="text-base text-white transition-colors hover:text-[#FF5800]"
              >
                Privacy
              </a>
              <a
                href="/terms-of-service"
                className="text-base text-white transition-colors hover:text-[#FF5800]"
              >
                Terms
              </a>
            </nav>

            {/* Social icons */}
            <div className="mt-8 grid  gap-4">
              <a
                href="https://github.com/elizaos"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white transition-colors hover:text-[#FF5800]"
                aria-label="GitHub"
              >
                <Github className="h-6 w-6" />
              </a>
              <a
                href="https://discord.gg/elizaos"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white transition-colors hover:text-[#FF5800]"
                aria-label="Discord"
              >
                {/* Discord SVG */}
              </a>
              <a
                href="https://x.com/elizaos"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white transition-colors hover:text-[#FF5800]"
                aria-label="X (Twitter)"
              >
                {/* X/Twitter SVG */}
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
