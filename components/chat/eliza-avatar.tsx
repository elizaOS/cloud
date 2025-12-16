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

import { cn } from "@/lib/utils";
import Image from "next/image";
import { isBuiltInAvatar, ensureAvatarUrl } from "@/lib/utils/default-avatar";

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
 */
export function ElizaAvatar({
  avatarUrl,
  name = "Eliza",
  className,
  iconClassName,
  animate = false,
}: ElizaAvatarProps) {
  const resolvedAvatarUrl = ensureAvatarUrl(avatarUrl);

  return (
    <div
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full",
        className,
      )}
    >
      <Image
        key={resolvedAvatarUrl}
        src={resolvedAvatarUrl}
        alt={name}
        fill
        className={cn(
          "object-cover",
          animate ? "animate-pulse" : "",
          iconClassName,
        )}
        sizes="48px"
        unoptimized={!isBuiltInAvatar(resolvedAvatarUrl)}
      />
    </div>
  );
}
