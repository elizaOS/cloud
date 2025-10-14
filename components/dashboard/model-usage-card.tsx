import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface ModelUsageEntry {
  model: string | null;
  provider: string;
  count: number;
  totalCost: number;
}

export interface ModelUsageCardProps {
  items: ModelUsageEntry[];
  className?: string;
  title?: string;
  description?: string;
}

const numberFormatter = new Intl.NumberFormat("en-US");

export function ModelUsageCard({
  items,
  className,
  title = "Model usage",
  description = "Breakdown of requests by provider and model.",
}: ModelUsageCardProps) {
  const sorted = [...items].sort((a, b) => b.count - a.count).slice(0, 6);

  return (
    <Card
      className={cn(
        "border-border/50 bg-card/95 backdrop-blur-sm shadow-md",
        className,
      )}
    >
      <CardHeader className="space-y-1">
        <CardTitle className="text-sm font-semibold tracking-tight">
          {title}
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="pt-6">
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No model usage recorded yet.
          </p>
        ) : (
          <div className="space-y-3">
            {sorted.map((item, index) => (
              <div key={`${item.provider}-${item.model ?? "unknown"}`}>
                <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 px-4 py-3 transition-all hover:border-primary/40 hover:bg-muted/40">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-foreground">
                      {item.model ?? "Unknown model"}
                    </span>
                    <Badge
                      variant="secondary"
                      className="w-fit rounded-full text-[10px]"
                    >
                      {item.provider}
                    </Badge>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge
                      variant="outline"
                      className="rounded-full border-border/60 text-[11px]"
                    >
                      {numberFormatter.format(item.count)} calls
                    </Badge>
                    <span className="text-sm font-semibold text-foreground">
                      {numberFormatter.format(item.totalCost)} cr
                    </span>
                  </div>
                </div>
                {index < sorted.length - 1 && <Separator className="my-3" />}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
