import { ShieldAlert, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface PlanLimitsCardProps {
  subscriptionTier: string;
  maxApiRequests?: number | null;
  maxTokensPerRequest?: number | null;
  allowedProviders: string[];
  allowedModels: string[];
  autoTopUp?: boolean;
  nextReset?: string;
  className?: string;
}

const nf = new Intl.NumberFormat("en-US");

export function PlanLimitsCard({
  subscriptionTier,
  maxApiRequests,
  maxTokensPerRequest,
  allowedProviders,
  allowedModels,
  autoTopUp = true,
  nextReset,
  className,
}: PlanLimitsCardProps) {
  const tierBadgeVariant = subscriptionTier.toLowerCase() === "free" ? "outline" : "default";

  return (
    <Card className={cn("h-full border-border/60 bg-background/85 shadow-sm", className)}>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold tracking-tight">Plan limits</CardTitle>
          <Badge variant={tierBadgeVariant} className="rounded-full text-[11px] uppercase">
            {subscriptionTier}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Stay within your contract limits and monitor what your team can access.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-xl border border-border/60 bg-background/95 p-4">
          <div className="flex items-center justify-between text-sm text-foreground">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              API request budget
            </span>
            <span className="text-sm font-semibold">
              {maxApiRequests != null ? (
                <>
                  {nf.format(maxApiRequests)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">per month</span>
                </>
              ) : (
                "Unlimited"
              )}
            </span>
          </div>
          <div className="h-px bg-border/60" />
          <div className="flex items-center justify-between text-sm text-foreground">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Max tokens / request
            </span>
            <span className="text-sm font-semibold">
              {maxTokensPerRequest != null ? nf.format(maxTokensPerRequest) : "Unlimited"}
            </span>
          </div>
        </div>

        <div className="grid gap-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Allowed providers</span>
            <span className="font-medium text-foreground">{allowedProviders.length}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {allowedProviders.slice(0, 4).map((provider) => (
              <Badge key={provider} variant="outline" className="rounded-full border-border/60 text-[10px]">
                {provider}
              </Badge>
            ))}
            {allowedProviders.length > 4 ? (
              <Badge variant="outline" className="rounded-full border-border/60 text-[10px]">
                +{allowedProviders.length - 4}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Allowed models</span>
            <span className="font-medium text-foreground">{allowedModels.length}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {allowedModels.slice(0, 5).map((model) => (
              <Badge key={model} variant="secondary" className="rounded-full bg-muted/60 text-[10px]">
                {model}
              </Badge>
            ))}
            {allowedModels.length > 5 ? (
              <Badge variant="secondary" className="rounded-full bg-muted/60 text-[10px]">
                +{allowedModels.length - 5}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/95 px-3 py-2">
          <div className="flex items-center gap-2">
            {autoTopUp ? (
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            )}
            <span className="text-xs font-medium text-muted-foreground">
              {autoTopUp ? "Auto top-up enabled" : "Auto top-up disabled"}
            </span>
          </div>
          {nextReset ? (
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground/80">resets {nextReset}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
