import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
        <Card className={cn("border-border/60 bg-background/85 shadow-sm", className)}>
            <CardHeader className="space-y-1">
                <CardTitle className="text-sm font-semibold tracking-tight">{title}</CardTitle>
                <p className="text-xs text-muted-foreground">{description}</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                {sorted.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No model usage recorded yet.</p>
                ) : (
                    <div className="space-y-3">
                        {sorted.map((item) => (
                            <div
                                key={`${item.provider}-${item.model ?? "unknown"}`}
                                className="flex items-center justify-between rounded-xl border border-border/60 bg-background/90 px-4 py-3"
                            >
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-foreground">
                                        {item.model ?? "Unknown model"}
                                    </span>
                                    <span className="text-xs text-muted-foreground">{item.provider}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="rounded-full border-border/60 text-[11px]">
                                        {numberFormatter.format(item.count)} calls
                                    </Badge>
                                    <span className="text-sm font-medium text-muted-foreground">
                                        {numberFormatter.format(item.totalCost)} credits
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
