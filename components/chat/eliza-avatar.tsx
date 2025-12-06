/**
 * Eliza avatar component with consistent fallback behavior.
 * Shows custom avatar if provided, otherwise shows the default Eliza avatar.
 *
 * @param props - Eliza avatar configuration
 * @param props.avatarUrl - Optional custom avatar URL
 * @param props.name - Optional name for alt text
 * @param props.className - Additional classes for the Avatar wrapper
 * @param props.fallbackClassName - Additional classes for the AvatarFallback
 * @param props.iconClassName - Additional classes for the avatar image
 * @param props.animate - Whether to animate the avatar with pulse
 */

"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  isBuiltInAvatar,
  ensureAvatarUrl,
  DEFAULT_AVATAR,
} from "@/lib/utils/default-avatar";

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
 * Shows custom avatar if provided, otherwise shows the default Eliza avatar.
 *
 * @param avatarUrl - Optional custom avatar URL
 * @param name - Optional name for alt text
 * @param className - Additional classes for the Avatar wrapper
 * @param fallbackClassName - Additional classes for the AvatarFallback
 * @param iconClassName - Additional classes for the avatar image
 * @param animate - Whether to animate the avatar with pulse
 */
export function ElizaAvatar({
  avatarUrl,
  name = "Eliza",
  className,
  fallbackClassName,
  iconClassName,
  animate = false,
}: ElizaAvatarProps) {
  // Always ensure we have an avatar URL - use Eliza as fallback
  const resolvedAvatarUrl = ensureAvatarUrl(avatarUrl);

  return (
    <Avatar className={cn(className)}>
      <Image
        src={resolvedAvatarUrl}
        alt={name}
        fill
        className={cn(
          "object-cover",
          animate ? "animate-pulse" : "",
          iconClassName,
        )}
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        unoptimized={!isBuiltInAvatar(resolvedAvatarUrl)}
      />
      <AvatarFallback
        className={cn(
          "bg-gradient-to-br from-purple-500 to-blue-600",
          fallbackClassName,
        )}
      >
        <Image src={DEFAULT_AVATAR} alt="Eliza" fill className="object-cover" />
      </AvatarFallback>
    </Avatar>
  );
}
