import type { ReactNode } from "react";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type UsageAlertSeverity = "critical" | "warning" | "info";

export interface UsageAlertItem {
  id: string;
  title: string;
  description?: string;
  severity: UsageAlertSeverity;
  actionLabel?: string;
}

export interface UsageAlertsCardProps {
  alerts: UsageAlertItem[];
  className?: string;
  footer?: ReactNode;
}

function getSeverityPill(severity: UsageAlertSeverity) {
  switch (severity) {
    case "critical":
      return (
        <Badge
          className="rounded-full bg-rose-500/10 text-[11px] text-rose-500"
          variant="secondary"
        >
          critical
        </Badge>
      );
    case "warning":
      return (
        <Badge
          className="rounded-full bg-amber-500/10 text-[11px] text-amber-600"
          variant="secondary"
        >
          warning
        </Badge>
      );
    default:
      return (
        <Badge
          className="rounded-full bg-blue-500/10 text-[11px] text-blue-500"
          variant="secondary"
        >
          info
        </Badge>
      );
  }
}

function getSeverityIcon(severity: UsageAlertSeverity) {
  switch (severity) {
    case "critical":
      return <AlertTriangle className="h-4 w-4 text-rose-500" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
}

export function UsageAlertsCard({
  alerts,
  className,
  footer,
}: UsageAlertsCardProps) {
  return (
    <Card
      className={cn(
        "h-full border-border/50 bg-card/95 backdrop-blur-sm shadow-md",
        className,
      )}
    >
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold tracking-tight">
            Usage signals
          </CardTitle>
          <Badge
            variant="outline"
            className="rounded-full text-[11px] uppercase"
          >
            {alerts.length} active
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Key items from spend automations, quota monitors, and provider health.
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 pt-6">
        {alerts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 to-emerald-500/10 px-4 py-6">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold text-foreground">All clear</p>
              <p className="text-xs text-muted-foreground">
                No outstanding usage-related actions.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <div key={alert.id}>
                <div className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3 transition-all hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {getSeverityIcon(alert.severity)}
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-foreground">
                          {alert.title}
                        </p>
                        {alert.description ? (
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {alert.description}
                          </p>
                        ) : null}
                        {alert.actionLabel ? (
                          <button className="text-xs font-medium text-primary underline-offset-2 hover:underline">
                            {alert.actionLabel}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {getSeverityPill(alert.severity)}
                  </div>
                </div>
                {index < alerts.length - 1 && <Separator className="my-3" />}
              </div>
            ))}
          </div>
        )}

        {footer ? (
          <>
            <Separator />
            <div className="pt-2 text-xs text-muted-foreground/80">
              {footer}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
