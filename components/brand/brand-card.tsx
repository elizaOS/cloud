/**
 * Brand Card Component
 * Reusable card component with brand styling and corner decorations
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { CornerBrackets } from "./corner-brackets";

interface BrandCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  corners?: boolean;
  cornerSize?: "sm" | "md" | "lg" | "xl";
  cornerColor?: string;
  asChild?: boolean;
}

export function BrandCard({
  children,
  className,
  hover = false,
  corners = true,
  cornerSize = "md",
  cornerColor = "#E1E1E1",
  asChild = false,
  ...props
}: BrandCardProps) {
  const Component = asChild ? "div" : "div";

  return (
    <Component
      className={cn(
        "relative bg-zinc-900/90 border border-zinc-700/50 p-4 md:p-6",
        hover && "group hover:border-zinc-500/50 transition-all duration-300",
        className,
      )}
      {...props}
    >
      {corners && <CornerBrackets size={cornerSize} color={cornerColor} />}
      {children}
    </Component>
  );
}

// Agent card variant used in landing page
interface AgentCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  action?: React.ReactNode;
  className?: string;
}

export function AgentCard({
  title,
  description,
  icon,
  color,
  action,
  className,
}: AgentCardProps) {
  return (
    <BrandCard hover className={cn("group", className)}>
      {/* Icon */}
      <div
        className="mb-4 inline-flex p-3 rounded-lg"
        style={{
          backgroundColor: `${color}20`,
          color: color,
        }}
      >
        {icon}
      </div>

      {/* Content */}
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-white/60 text-sm mb-4">{description}</p>

      {/* Action */}
      {action && action}
    </BrandCard>
  );
}
