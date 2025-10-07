import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface ProviderHealthItem {
  provider: string;
  status: "healthy" | "degraded" | "down";
  responseTime?: number | null; // ms
  errorRate?: number | null; // 0..1
  lastChecked?: Date | string | null;
}

export interface ProviderHealthCardProps {
  items: ProviderHealthItem[];
  className?: string;
}

function statusBadge(status: ProviderHealthItem["status"]) {
  switch (status) {
    case "healthy":
      return (
        <Badge className="rounded-full bg-emerald-500/10 text-[11px] text-emerald-500">
          healthy
        </Badge>
      );
    case "degraded":
      return (
        <Badge className="rounded-full bg-amber-500/10 text-[11px] text-amber-500">
          degraded
        </Badge>
      );
    case "down":
      return (
        <Badge className="rounded-full bg-rose-500/10 text-[11px] text-rose-500">
          down
        </Badge>
      );
  }
}

export function ProviderHealthCard({
  items,
  className,
}: ProviderHealthCardProps) {
  const top = [...items].slice(0, 4);
  const icon = (
    <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-muted/30">
      <Activity className="h-5 w-5 text-primary" />
    </span>
  );

  return (
    <Card
      className={cn("border-border/60 bg-background/85 shadow-sm", className)}
    >
      <CardHeader>
        <div className="flex items-center gap-3">
          {icon}
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold tracking-tight">
              Provider health
            </CardTitle>
            <CardDescription className="text-xs">
              Live status checks for key providers.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="pt-6">
        {top.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No providers to display.
          </p>
        ) : (
          <div className="space-y-3">
            {top.map((p, index) => (
              <div key={p.provider}>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/90 px-4 py-3 transition-all hover:border-primary/40 hover:bg-muted/20">
                  <div className="flex items-center gap-3">
                    {p.status === "healthy" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : p.status === "degraded" ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                    )}
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-foreground">
                        {p.provider}
                      </span>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                        {p.responseTime ? `${p.responseTime} ms` : "—"}
                        {p.errorRate != null
                          ? ` • ${(p.errorRate * 100).toFixed(1)}% err`
                          : ""}
                      </span>
                    </div>
                  </div>
                  {statusBadge(p.status)}
                </div>
                {index < top.length - 1 && <Separator className="my-3" />}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
