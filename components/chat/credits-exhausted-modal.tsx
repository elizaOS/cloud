"use client";

import { CornerBrackets } from "@/components/brand";

interface CreditsExhaustedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTopUp: () => void;
}

export function CreditsExhaustedModal({
  isOpen,
  onClose,
  onTopUp,
}: CreditsExhaustedModalProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close modal"
      />

      {/* Modal container */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center px-4">
        <div
          className="relative bg-[#161616] border border-[#252527] px-16 py-10 flex flex-col items-center gap-6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Corner brackets decoration */}
          <CornerBrackets size="md" color="#a1a1a1" />

          {/* Content */}
          <div className="flex flex-col items-center gap-6">
            {/* Text content */}
            <div className="flex flex-col items-center gap-2">
              <h2
                className="text-center"
                style={{
                  fontFamily: "var(--font-roboto-mono)",
                  fontWeight: 500,
                  fontSize: "20px",
                  lineHeight: "normal",
                  letterSpacing: "-0.2px",
                  color: "#e1e1e1",
                }}
              >
                Ups, you&apos;ve ran out of credits!
              </h2>
              <p
                className="text-center"
                style={{
                  fontFamily: "var(--font-roboto-mono)",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "normal",
                  letterSpacing: "-0.064px",
                  color: "#858585",
                }}
              >
                Login or Sign up to continue using Eliza
              </p>
            </div>

            {/* Top Up Button */}
            <div className="w-full flex flex-col items-center">
              <button
                onClick={onTopUp}
                className="relative w-[400px] px-6 py-3 bg-[rgba(255,88,0,0.25)] hover:bg-[rgba(255,88,0,0.35)] transition-colors"
                style={{
                  fontFamily: "var(--font-roboto-mono)",
                  fontWeight: 500,
                  fontSize: "16px",
                  lineHeight: "normal",
                  color: "#ff5800",
                }}
              >
                {/* Button corner brackets */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[#ff5800]" />
                <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[#ff5800]" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-[#ff5800]" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[#ff5800]" />

                Top Up
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
