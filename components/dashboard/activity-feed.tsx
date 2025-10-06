import { type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  success: "bg-emerald-500/10 text-emerald-500",
  warning: "bg-amber-500/10 text-amber-500",
  error: "bg-rose-500/10 text-rose-500",
  info: "bg-blue-500/10 text-blue-500",
};

export function ActivityFeed({
  title = "Recent activity",
  description = "Stay informed about the latest agent runs, API calls, and credit updates.",
  items,
  emptyState,
  footerAction,
  className,
}: ActivityFeedProps) {
  const hasItems = items.length > 0;

  return (
    <Card
      className={cn("border-border/60 bg-background/85 shadow-sm", className)}
    >
      <CardHeader className="space-y-1">
        <CardTitle className="text-sm font-semibold tracking-tight">
          {title}
        </CardTitle>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[320px] overflow-y-auto">
          <div className="flex flex-col gap-4 p-5">
            {hasItems ? (
              items.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className="flex gap-3">
                    <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-2xl border border-border/60 bg-muted/40">
                      <Icon className="h-4 w-4 text-foreground" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {item.title}
                        </p>
                        {item.status ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full border-transparent text-[11px]",
                              STATUS_BADGE[item.status],
                            )}
                          >
                            {item.status}
                          </Badge>
                        ) : null}
                        {item.metadata ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            {item.metadata}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                        {item.timestamp}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : emptyState ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  {emptyState.title}
                </p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  {emptyState.description}
                </p>
                {emptyState.action}
              </div>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No activity yet.
              </p>
            )}
          </div>
        </div>
      </CardContent>
      {footerAction ? <CardFooter>{footerAction}</CardFooter> : null}
    </Card>
  );
}
