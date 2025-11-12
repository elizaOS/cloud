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
        "group relative bg-black/40 transition-all duration-300 ease-out",
        "hover:bg-black/60 hover:scale-[1.02] hover:shadow-xl hover:shadow-white/10",
        withBorder && "border border-white/20 hover:border-white/30",
        className,
      )}
    >
      <CornerBrackets
        size={cornerSize}
        color={cornerColor}
        hoverColor="#FF5800"
        hoverScale={true}
      />
      {children}
    </div>
  );
}
