import { type LucideIcon, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
      className={cn("flex flex-col border-border/60 bg-background/85 shadow-sm", className)}
    >
      <CardHeader className="space-y-1">
        <CardTitle className="text-sm font-semibold tracking-tight">
          {title}
        </CardTitle>
        {description ? (
          <CardDescription className="text-xs">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <Separator />
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-[320px]">
          <div className="flex flex-col p-5">
            {hasItems ? (
              items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={item.id}>
                    <div className="flex gap-3 py-3">
                      <div className="relative mt-1">
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 transition-all hover:border-primary/40 hover:bg-muted/60">
                          <Icon className="h-4 w-4 text-foreground" />
                        </div>
                        {index < items.length - 1 && (
                          <div className="absolute left-1/2 top-12 h-full w-px -translate-x-1/2 bg-border/60" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2 pb-4">
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
                            <Badge variant="secondary" className="rounded-full text-[11px]">
                              {item.metadata}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/80">
                          <Clock className="h-3 w-3" />
                          {item.timestamp}
                        </div>
                      </div>
                    </div>
                    {index < items.length - 1 && <Separator className="ml-12" />}
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
        </ScrollArea>
      </CardContent>
      {footerAction ? (
        <>
          <Separator />
          <CardFooter className="p-4">{footerAction}</CardFooter>
        </>
      ) : null}
    </Card>
  );
}
