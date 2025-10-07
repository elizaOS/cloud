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
  return (
    <Avatar className={cn(className)}>
      {avatarUrl ? (
        <AvatarImage 
          src={avatarUrl} 
          alt={name}
          className={animate ? "animate-pulse" : ""}
        />
      ) : null}
      <AvatarFallback className={cn("bg-gradient-to-br from-purple-500 to-blue-600", fallbackClassName)}>
        <Bot className={cn("text-white", iconClassName, animate && "animate-pulse")} />
      </AvatarFallback>
    </Avatar>
  );
}
