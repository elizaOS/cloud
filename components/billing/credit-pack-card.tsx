"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreditPackCardProps {
  id: string;
  name: string;
  description: string | null;
  credits: number | string; // NUMERIC from DB returns string
  priceCents: number;
  isPopular?: boolean;
  onPurchase: (id: string) => void;
  loading?: boolean;
}

export function CreditPackCard({
  id,
  name,
  description,
  credits,
  priceCents,
  isPopular = false,
  onPurchase,
  loading = false,
}: CreditPackCardProps) {
  const price = (priceCents / 100).toFixed(2);
  const creditsValue = Number(credits);
  const pricePerCredit = (priceCents / creditsValue / 100).toFixed(3);

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all hover:shadow-lg",
        isPopular && "border-primary shadow-md",
      )}
    >
      {isPopular && (
        <div className="absolute top-0 right-0">
          <Badge className="rounded-none rounded-bl-lg bg-primary">
            <Sparkles className="mr-1 h-3 w-3" />
            Popular
          </Badge>
        </div>
      )}

      <CardHeader>
        <CardTitle className="text-2xl">{name}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <div className="text-4xl font-bold">${price}</div>
          <div className="text-sm text-muted-foreground">
            ${pricePerCredit} per dollar
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-primary" />
            <span>${creditsValue.toFixed(2)} balance</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-primary" />
            <span>One-time purchase</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-primary" />
            <span>Never expires</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-primary" />
            <span>Instant activation</span>
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <Button
          onClick={() => onPurchase(id)}
          disabled={loading}
          className="w-full"
          size="lg"
          variant={isPopular ? "default" : "outline"}
        >
          {loading ? "Processing..." : "Add Funds"}
        </Button>
      </CardFooter>
    </Card>
  );
}
