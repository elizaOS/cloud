"use client";

import type React from "react";
import { useState } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export interface LockOnButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  icon?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "icon";
  variant?:
    | "default"
    | "primary"
    | "outline"
    | "ghost"
    | "hud"
    | "icon"
    | "icon-primary"; // For backwards compatibility
  asChild?: boolean;
}

export function LockOnButton({
  children,
  icon,
  onClick,
  disabled = false,
  className,
  size = "md",
  variant = "default",
  asChild = false,
  ...props
}: LockOnButtonProps) {
  const [isActive, setIsActive] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsActive(true);
    onClick?.(e);
    setTimeout(() => setIsActive(false), 600);
  };

  const sizeClasses = {
    sm: "text-xs px-3 py-2",
    md: "text-sm px-6 py-3",
    lg: "text-base px-8 py-4",
    icon: "p-2 h-10 w-10",
  };

  const Comp = asChild ? Slot : "button";

  // If asChild, render without corner brackets (Slot requires single child)
  if (asChild) {
    return (
      <Comp
        onClick={handleClick}
        className={cn(
          "relative",
          sizeClasses[size],
          "font-medium text-white bg-[#FF5800]/25",
          "cursor-pointer overflow-visible transition-all duration-300",
          "inline-flex items-center gap-2 outline-none",
          !disabled &&
            "hover:bg-[#FF5800]/40 hover:shadow-[0_0_20px_rgba(255,88,0,0.4)]",
          !disabled && "active:bg-[#FF5800]/60",
          disabled && "opacity-50 cursor-not-allowed",
          className,
        )}
        {...props}
      >
        {children}
      </Comp>
    );
  }

  return (
    <Comp
      onClick={handleClick}
      onMouseEnter={() => setIsActive(true)}
      onMouseLeave={() => setIsActive(false)}
      disabled={disabled}
      className={cn(
        "relative",
        sizeClasses[size],
        "font-medium text-white bg-[#FF5800]/25",
        "cursor-pointer overflow-visible transition-all duration-300",
        "inline-flex items-center gap-2 outline-none",
        !disabled &&
          "hover:bg-[#FF5800]/40 hover:shadow-[0_0_20px_rgba(255,88,0,0.4)]",
        !disabled && "active:bg-[#FF5800]/60",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      {...props}
    >
      {/* Top-left corner */}
      <span
        className={cn(
          "absolute -top-[2px] -left-[2px] w-3 h-3 flex flex-col pointer-events-none",
        )}
      >
        <span
          className={cn(
            "absolute top-0 left-0 w-3 h-[2px] bg-[#FF5800]",
            isActive
              ? "animate-[expandHorizontal_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]"
              : "animate-[contractHorizontal_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]",
          )}
          style={{ transformOrigin: "left center" }}
        />
        <span
          className={cn(
            "absolute top-0 left-0 w-[2px] h-3 bg-[#FF5800]",
            isActive
              ? "animate-[expandVertical_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]"
              : "animate-[contractVertical_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]",
          )}
          style={{ transformOrigin: "top center" }}
        />
      </span>

      {/* Top-right corner */}
      <span
        className={cn(
          "absolute -top-[2px] -right-[2px] w-3 h-3 flex flex-col pointer-events-none",
        )}
      >
        <span
          className={cn(
            "absolute top-0 right-0 w-3 h-[2px] bg-[#FF5800]",
            isActive
              ? "animate-[expandHorizontal_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]"
              : "animate-[contractHorizontal_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]",
          )}
          style={{ transformOrigin: "right center" }}
        />
        <span
          className={cn(
            "absolute top-0 right-0 w-[2px] h-3 bg-[#FF5800]",
            isActive
              ? "animate-[expandVertical_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]"
              : "animate-[contractVertical_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]",
          )}
          style={{ transformOrigin: "top center" }}
        />
      </span>

      {/* Bottom-left corner */}
      <span
        className={cn(
          "absolute -bottom-[2px] -left-[2px] w-3 h-3 flex flex-col pointer-events-none",
        )}
      >
        <span
          className={cn(
            "absolute bottom-0 left-0 w-3 h-[2px] bg-[#FF5800]",
            isActive
              ? "animate-[expandHorizontal_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]"
              : "animate-[contractHorizontal_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]",
          )}
          style={{ transformOrigin: "left center" }}
        />
        <span
          className={cn(
            "absolute bottom-0 left-0 w-[2px] h-3 bg-[#FF5800]",
            isActive
              ? "animate-[expandVertical_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]"
              : "animate-[contractVertical_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]",
          )}
          style={{ transformOrigin: "bottom center" }}
        />
      </span>

      {/* Bottom-right corner */}
      <span
        className={cn(
          "absolute -bottom-[2px] -right-[2px] w-3 h-3 flex flex-col pointer-events-none",
        )}
      >
        <span
          className={cn(
            "absolute bottom-0 right-0 w-3 h-[2px] bg-[#FF5800]",
            isActive
              ? "animate-[expandHorizontal_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]"
              : "animate-[contractHorizontal_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]",
          )}
          style={{ transformOrigin: "right center" }}
        />
        <span
          className={cn(
            "absolute bottom-0 right-0 w-[2px] h-3 bg-[#FF5800]",
            isActive
              ? "animate-[expandVertical_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]"
              : "animate-[contractVertical_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]",
          )}
          style={{ transformOrigin: "bottom center" }}
        />
      </span>

      {/* Button content */}
      <span className="relative z-10 flex items-center gap-2">
        {icon}
        {children}
      </span>
    </Comp>
  );
}
