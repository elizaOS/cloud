/**
 * HUD Container Component
 * Container with HUD-style corner decorations, used for input areas and cards
 */

import { cn } from "@/lib/utils";
import { CornerBrackets } from "./corner-brackets";

interface HUDContainerProps {
  children: React.ReactNode;
  className?: string;
  cornerSize?: "sm" | "md" | "lg" | "xl";
  cornerColor?: string;
  withBorder?: boolean;
}

export function HUDContainer({
  children,
  className,
  cornerSize = "md",
  cornerColor = "#E1E1E1",
  withBorder = true,
}: HUDContainerProps) {
  return (
    <div
      className={cn(
        "relative bg-black/40",
        withBorder && "border border-white/20",
        className
      )}
    >
      <CornerBrackets size={cornerSize} color={cornerColor} />
      {children}
    </div>
  );
}

