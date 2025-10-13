import type { CreditTransaction } from "@/lib/types";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CreditActivityProps {
  transactions: Array<
    Pick<
      CreditTransaction,
      "id" | "amount" | "type" | "description" | "created_at"
    > & {
      actor?: string | null;
    }
  >;
  className?: string;
  title?: string;
  description?: string;
}

const numberFormatter = new Intl.NumberFormat("en-US");

export function CreditActivity({
  transactions,
  className,
  title = "Credit ledger",
  description = "Recent adjustments to your organization credit balance.",
}: CreditActivityProps) {
  const items = transactions.slice(0, 6);

  return (
    <Card
      className={cn("border-border/50 bg-card/95 backdrop-blur-sm shadow-md", className)}
    >
      <CardHeader className="space-y-1">
        <CardTitle className="text-sm font-semibold tracking-tight">
          {title}
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="pt-6">
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No credit transactions recorded.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((transaction, index) => {
              const isCredit = transaction.amount > 0;
              return (
                <div key={transaction.id}>
                  <div className="flex items-start justify-between rounded-xl border border-border/50 bg-muted/30 px-4 py-3 transition-all hover:border-primary/40 hover:bg-muted/40">
                    <div className="flex flex-1 flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {transaction.description ||
                            `Credit ${transaction.type}`}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "rounded-full border-0 text-[11px]",
                            isCredit
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-rose-500/10 text-rose-500",
                          )}
                        >
                          {transaction.type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/80">
                        <Clock className="h-3 w-3" />
                        {new Date(transaction.created_at).toLocaleString()}
                      </div>
                      {transaction.actor ? (
                        <p className="text-xs text-muted-foreground/80">
                          Actor: {transaction.actor}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "text-lg font-semibold",
                        isCredit ? "text-emerald-500" : "text-rose-500",
                      )}
                    >
                      {isCredit ? "+" : ""}
                      {numberFormatter.format(transaction.amount)}
                    </span>
                  </div>
                  {index < items.length - 1 && <Separator className="my-3" />}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
