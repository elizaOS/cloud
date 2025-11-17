"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface ElizaAvatarProps {
  avatarUrl?: string;
  name?: string;
  className?: string;
  fallbackClassName?: string;
  iconClassName?: string;
  animate?: boolean;
}

/**
 * Reusable Eliza avatar component with consistent fallback behavior.
 * Shows custom avatar if provided, otherwise shows Bot icon with gradient background.
 *
 * @param avatarUrl - Optional custom avatar URL
 * @param name - Optional name for alt text
 * @param className - Additional classes for the Avatar wrapper
 * @param fallbackClassName - Additional classes for the AvatarFallback
 * @param iconClassName - Additional classes for the Bot icon
 * @param animate - Whether to animate the avatar/icon with pulse
 */
export function ElizaAvatar({
  avatarUrl,
  name = "Eliza",
  className,
  fallbackClassName,
  iconClassName,
  animate = false,
}: ElizaAvatarProps) {
  const getInitial = () => {
    if (!name) return "E";
    return name.charAt(0).toUpperCase();
  };

  return (
    <Avatar className={cn(className)}>
      {avatarUrl ? (
        <AvatarImage
          src={avatarUrl}
          alt={name}
          className={animate ? "animate-pulse" : ""}
        />
      ) : null}
      <AvatarFallback
        className={cn(
          "bg-[#FF5800] text-white font-bold flex items-center justify-center text-center",
          fallbackClassName,
        )}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          className={cn("text-xs leading-none", iconClassName, animate && "animate-pulse")}
          style={{
            display: "block",
            textAlign: "center",
            lineHeight: "1",
          }}
        >
          {getInitial()}
        </span>
      </AvatarFallback>
    </Avatar>
  );
}
