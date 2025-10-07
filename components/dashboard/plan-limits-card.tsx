import { ShieldAlert, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface PlanLimitsCardProps {
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
  maxApiRequests,
  maxTokensPerRequest,
  allowedProviders,
  allowedModels,
  autoTopUp = true,
  nextReset,
  className,
}: PlanLimitsCardProps) {
  return (
    <Card
      className={cn(
        "h-full border-border/50 bg-card/95 backdrop-blur-sm shadow-md",
        className,
      )}
    >
      <CardHeader className="space-y-1">
        <CardTitle className="text-sm font-semibold tracking-tight">
          Usage Limits
        </CardTitle>
        <CardDescription className="text-xs">
          Monitor your usage limits and what your team can access.
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-3 rounded-xl border border-border/50 bg-gradient-to-br from-muted/20 to-muted/40 p-4">
          <div className="flex items-center justify-between text-sm text-foreground">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              API request budget
            </span>
            <span className="text-sm font-semibold">
              {maxApiRequests != null ? (
                <>
                  {nf.format(maxApiRequests)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    per month
                  </span>
                </>
              ) : (
                <Badge variant="secondary" className="rounded-full">
                  Unlimited
                </Badge>
              )}
            </span>
          </div>
          <Separator />
          <div className="flex items-center justify-between text-sm text-foreground">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Max tokens / request
            </span>
            <span className="text-sm font-semibold">
              {maxTokensPerRequest != null ? (
                nf.format(maxTokensPerRequest)
              ) : (
                <Badge variant="secondary" className="rounded-full">
                  Unlimited
                </Badge>
              )}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">Allowed providers</span>
            <Badge variant="outline" className="rounded-full text-[10px]">
              {allowedProviders.length}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allowedProviders.slice(0, 4).map((provider) => (
              <Badge
                key={provider}
                variant="secondary"
                className="rounded-full border-border/60 bg-muted/40 text-[10px]"
              >
                {provider}
              </Badge>
            ))}
            {allowedProviders.length > 4 ? (
              <Badge
                variant="secondary"
                className="rounded-full border-border/60 bg-muted/40 text-[10px]"
              >
                +{allowedProviders.length - 4}
              </Badge>
            ) : null}
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">Allowed models</span>
            <Badge variant="outline" className="rounded-full text-[10px]">
              {allowedModels.length}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allowedModels.slice(0, 5).map((model) => (
              <Badge
                key={model}
                variant="secondary"
                className="rounded-full bg-muted/40 text-[10px]"
              >
                {model}
              </Badge>
            ))}
            {allowedModels.length > 5 ? (
              <Badge
                variant="secondary"
                className="rounded-full bg-muted/40 text-[10px]"
              >
                +{allowedModels.length - 5}
              </Badge>
            ) : null}
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between rounded-xl border border-border/50 bg-gradient-to-br from-muted/20 to-muted/40 px-3 py-2.5">
          <div className="flex items-center gap-2">
            {autoTopUp ? (
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            )}
            <span className="text-xs font-medium text-foreground">
              {autoTopUp ? "Auto top-up enabled" : "Auto top-up disabled"}
            </span>
          </div>
          {nextReset ? (
            <Badge variant="outline" className="rounded-full text-[10px] uppercase">
              resets {nextReset}
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
