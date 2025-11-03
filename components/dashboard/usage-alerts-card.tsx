import type { ReactNode } from "react";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { BrandCard, CornerBrackets } from "@/components/brand";

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
        <span className="rounded-none bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[11px] text-rose-400 uppercase tracking-wide">
          critical
        </span>
      );
    case "warning":
      return (
        <span className="rounded-none bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[11px] text-amber-300 uppercase tracking-wide">
          warning
        </span>
      );
    default:
      return (
        <span className="rounded-none bg-blue-500/20 border border-blue-500/40 px-2 py-0.5 text-[11px] text-blue-400 uppercase tracking-wide">
          info
        </span>
      );
  }
}

function getSeverityIcon(severity: UsageAlertSeverity) {
  switch (severity) {
    case "critical":
      return <AlertTriangle className="h-4 w-4 text-rose-400" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-amber-400" />;
    default:
      return <Info className="h-4 w-4 text-blue-400" />;
  }
}

export function UsageAlertsCard({
  alerts,
  className,
  footer,
}: UsageAlertsCardProps) {
  return (
    <BrandCard className={cn("h-full", className)}>
      <CornerBrackets size="sm" className="opacity-50" />

      <div className="relative z-10 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF5800]" />
              <h3 className="text-sm font-semibold tracking-tight text-white">
                Usage signals
              </h3>
            </div>
            <p className="text-xs text-white/60">
              Key items from spend automations, quota monitors, and provider
              health.
            </p>
          </div>
          <span className="rounded-none border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] uppercase text-white/70">
            {alerts.length} active
          </span>
        </div>

        <div className="border-t border-white/10" />

        <div className="space-y-3 pt-6">
          {alerts.length === 0 ? (
            <div className="flex items-center gap-3 rounded-none border border-white/10 bg-green-500/10 px-4 py-6">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
              <div>
                <p className="text-sm font-semibold text-white">All clear</p>
                <p className="text-xs text-white/60">
                  No outstanding usage-related actions.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert, index) => (
                <div key={alert.id}>
                  <div className="rounded-none border border-white/10 bg-black/40 px-4 py-3 transition-all hover:border-[#FF5800]/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {getSeverityIcon(alert.severity)}
                        <div className="space-y-1.5">
                          <p className="text-sm font-semibold text-white">
                            {alert.title}
                          </p>
                          {alert.description ? (
                            <p className="text-xs leading-relaxed text-white/60">
                              {alert.description}
                            </p>
                          ) : null}
                          {alert.actionLabel ? (
                            <button className="text-xs font-medium text-[#FF5800] underline-offset-2 hover:underline">
                              {alert.actionLabel}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {getSeverityPill(alert.severity)}
                    </div>
                  </div>
                  {index < alerts.length - 1 && (
                    <div className="my-3 border-t border-white/10" />
                  )}
                </div>
              ))}
            </div>
          )}

          {footer ? (
            <>
              <div className="border-t border-white/10 mt-4" />
              <div className="pt-2 text-xs text-white/60">{footer}</div>
            </>
          ) : null}
        </div>
      </div>
    </BrandCard>
  );
}
