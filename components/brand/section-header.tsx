/**
 * Section Header Component
 * Reusable section header with orange dot indicator
 */

import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  label: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  className?: string;
  labelClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  align?: "left" | "center" | "right";
}

export function SectionHeader({
  label,
  title,
  description,
  className,
  labelClassName,
  titleClassName,
  descriptionClassName,
  align = "left",
}: SectionHeaderProps) {
  const alignClass = {
    left: "text-left",
    center: "text-center items-center justify-center",
    right: "text-right items-end justify-end",
  }[align];

  return (
    <div className={cn("mb-12", alignClass, className)}>
      <div
        className={cn(
          "flex items-center gap-3 mb-4",
          align === "center" && "justify-center",
          align === "right" && "justify-end",
        )}
      >
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: "#FF5800" }}
        />
        <p
          className={cn(
            "text-lg md:text-xl uppercase tracking-wider text-white font-medium",
            labelClassName,
          )}
        >
          {label}
        </p>
      </div>

      {title && (
        <h2
          className={cn(
            "text-3xl md:text-4xl lg:text-5xl font-bold mb-4 text-white",
            titleClassName,
          )}
        >
          {title}
        </h2>
      )}

      {description && (
        <div
          className={cn(
            "text-white/70 text-base md:text-lg",
            align === "center" && "max-w-2xl mx-auto",
            descriptionClassName,
          )}
        >
          {description}
        </div>
      )}
    </div>
  );
}

// Simple variant with just label and dot
export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: "#FF5800" }}
      />
      <span className="text-lg md:text-xl uppercase tracking-wider text-white font-medium">
        {children}
      </span>
    </div>
  );
}
