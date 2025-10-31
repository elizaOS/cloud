"use client";

import { useState } from "react";
import { Loader2, Sparkles, Zap, Stars } from "lucide-react";
import { cn } from "@/lib/utils";

const LOADING_MESSAGES = [
  "Painting pixels with AI magic...",
  "Mixing colors and dreams...",
  "Bringing your vision to life...",
  "Consulting with digital artists...",
  "Adding the finishing touches...",
];

interface EnhancedLoadingProps {
  message?: string;
  progress?: number;
}

interface Particle {
  left: string;
  top: string;
  animationDelay: string;
  animationDuration: string;
}

export function EnhancedLoading({ message, progress }: EnhancedLoadingProps) {
  const [randomMessage] = useState(
    () => LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)],
  );
  const [particles] = useState<Particle[]>(() =>
    [...Array(12)].map(() => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 2}s`,
      animationDuration: `${3 + Math.random() * 2}s`,
    })),
  );
  const displayMessage = message || randomMessage;

  return (
    <div className="relative w-full aspect-square rounded-2xl border-2 bg-gradient-to-br from-purple-500/5 via-blue-500/5 to-pink-500/5 overflow-hidden">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-pink-500/10 animate-pulse" />

      {/* Floating particles */}
      <div className="absolute inset-0">
        {particles.map((particle, i) => (
          <div
            key={i}
            className={cn(
              "absolute w-2 h-2 rounded-full bg-primary/30",
              "animate-float",
            )}
            style={particle}
          />
        ))}
      </div>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-12 space-y-6">
        {/* Animated icon group */}
        <div className="relative">
          <div className="absolute inset-0 animate-ping">
            <div className="w-24 h-24 rounded-full bg-primary/20" />
          </div>
          <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 backdrop-blur-sm border-2 border-primary/20">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
          </div>

          {/* Orbiting icons */}
          <div
            className="absolute inset-0 animate-spin"
            style={{ animationDuration: "3s" }}
          >
            <Sparkles className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 text-purple-500" />
          </div>
          <div
            className="absolute inset-0 animate-spin"
            style={{ animationDuration: "4s", animationDirection: "reverse" }}
          >
            <Zap className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-4 text-blue-500" />
          </div>
          <div
            className="absolute inset-0 animate-spin"
            style={{ animationDuration: "5s" }}
          >
            <Stars className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-pink-500" />
          </div>
        </div>

        {/* Loading text */}
        <div className="text-center space-y-3">
          <p className="text-base font-semibold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent animate-pulse">
            {displayMessage}
          </p>

          {/* Progress bar */}
          {progress !== undefined && (
            <div className="w-64 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 via-blue-500 to-pink-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            This may take 10-30 seconds
          </p>
        </div>

        {/* Stats or tips */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>AI Model Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
