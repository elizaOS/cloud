import { type LucideIcon, Clock } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { BrandCard, CornerBrackets } from "@/components/brand";

export interface ActivityFeedItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  icon: LucideIcon;
  status?: "success" | "warning" | "error" | "info";
  metadata?: string;
}

export interface ActivityFeedProps {
  title?: string;
  description?: string;
  items: ActivityFeedItem[];
  emptyState?: {
    title: string;
    description: string;
    action?: React.ReactNode;
  };
  footerAction?: React.ReactNode;
  className?: string;
}

const STATUS_BADGE: Record<NonNullable<ActivityFeedItem["status"]>, string> = {
  success: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  warning: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  error: "bg-rose-500/20 text-rose-400 border-rose-500/40",
  info: "bg-blue-500/20 text-blue-400 border-blue-500/40",
};

export function ActivityFeed({
  title = "Recent activity",
  description = "Stay informed about the latest agent runs, API calls, and balance updates.",
  items,
  emptyState,
  footerAction,
  className,
}: ActivityFeedProps) {
  const hasItems = items.length > 0;

  return (
    <BrandCard className={cn("flex flex-col", className)}>
      <CornerBrackets size="sm" className="opacity-50" />

      <div className="relative z-10 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5800]" />
            <h3 className="text-sm font-semibold tracking-tight text-white">
              {title}
            </h3>
          </div>
          {description ? (
            <p className="text-xs text-white/60">{description}</p>
          ) : null}
        </div>
        <div className="border-t border-white/10" />
        <div className="flex-1 p-0">
          <ScrollArea className="h-[320px]">
            <div className="flex flex-col p-5">
              {hasItems ? (
                items.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.id}>
                      <div className="flex gap-3 py-3">
                        <div className="relative mt-1">
                          <div className="flex h-9 w-9 items-center justify-center rounded-none border border-white/10 bg-black/40 transition-all hover:border-[#FF5800]/40 hover:bg-black/50">
                            <Icon className="h-4 w-4 text-[#FF5800]" />
                          </div>
                          {index < items.length - 1 && (
                            <div className="absolute left-1/2 top-12 h-full w-px -translate-x-1/2 bg-white/10" />
                          )}
                        </div>
                        <div className="flex-1 space-y-2 pb-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-white">
                              {item.title}
                            </p>
                            {item.status ? (
                              <span
                                className={cn(
                                  "rounded-none border text-[11px] px-2 py-0.5 uppercase tracking-wide",
                                  STATUS_BADGE[item.status],
                                )}
                              >
                                {item.status}
                              </span>
                            ) : null}
                            {item.metadata ? (
                              <span className="rounded-none bg-white/10 px-2 py-0.5 text-[11px] text-white/70">
                                {item.metadata}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs leading-relaxed text-white/60">
                            {item.description}
                          </p>
                          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/50">
                            <Clock className="h-3 w-3 text-[#FF5800]" />
                            {item.timestamp}
                          </div>
                        </div>
                      </div>
                      {index < items.length - 1 && (
                        <div className="ml-12 border-t border-white/10" />
                      )}
                    </div>
                  );
                })
              ) : emptyState ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-white/60">
                  <p className="font-medium text-white">{emptyState.title}</p>
                  <p className="max-w-xs text-xs text-white/60">
                    {emptyState.description}
                  </p>
                  {emptyState.action}
                </div>
              ) : (
                <p className="py-16 text-center text-sm text-white/60">
                  No activity yet.
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
        {footerAction ? (
          <>
            <div className="border-t border-white/10" />
            <div className="p-4">{footerAction}</div>
          </>
        ) : null}
      </div>
    </BrandCard>
  );
}
