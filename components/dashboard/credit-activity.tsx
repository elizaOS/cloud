import type { CreditTransaction } from "@/lib/types";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      className={cn("border-border/60 bg-background/85 shadow-sm", className)}
    >
      <CardHeader className="space-y-1">
        <CardTitle className="text-sm font-semibold tracking-tight">
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No credit transactions recorded.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((transaction) => {
              const isCredit = transaction.amount > 0;
              return (
                <div
                  key={transaction.id}
                  className="flex items-start justify-between rounded-xl border border-border/60 bg-background/90 px-4 py-3"
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {transaction.description ||
                          `Credit ${transaction.type}`}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full border-transparent text-[11px]",
                          isCredit
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-rose-500/10 text-rose-500",
                        )}
                      >
                        {transaction.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(transaction.created_at).toLocaleString()}
                    </p>
                    {transaction.actor ? (
                      <p className="text-xs text-muted-foreground/80">
                        Actor: {transaction.actor}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      isCredit ? "text-emerald-500" : "text-rose-500",
                    )}
                  >
                    {isCredit ? "+" : "-"}
                    {numberFormatter.format(Math.abs(transaction.amount))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
