/**
 * Mobile Billing Card Component
 * 
 * Displays in-app purchase options for the mobile app.
 * Uses native IAP (StoreKit 2 / Google Play Billing) for purchases.
 */

"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { 
  Coins, 
  Sparkles, 
  Check, 
  Loader2, 
  Smartphone,
  CreditCard,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useIAP } from "@/lib/hooks/use-iap";
import { useCredits } from "@/lib/providers/CreditsProvider";
import { formatCredits, formatPrice, type IAPProduct } from "@/lib/config/iap-products";

/**
 * Single product card for IAP
 */
function ProductCard({
  product,
  onPurchase,
  isPurchasing,
  isSelected,
}: {
  product: IAPProduct;
  onPurchase: (productId: string) => void;
  isPurchasing: boolean;
  isSelected: boolean;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="relative"
    >
      <Card 
        className={`cursor-pointer transition-all duration-200 ${
          isSelected 
            ? "border-primary ring-2 ring-primary/20" 
            : "border-border hover:border-primary/50"
        } ${product.isPopular ? "border-primary" : ""}`}
        onClick={() => !isPurchasing && onPurchase(product.id)}
      >
        {product.isPopular && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="bg-primary text-primary-foreground">
              <Sparkles className="mr-1 h-3 w-3" />
              Most Popular
            </Badge>
          </div>
        )}
        
        {product.bonusPercentage && product.bonusPercentage > 0 && (
          <div className="absolute -top-3 right-4">
            <Badge variant="secondary" className="bg-green-500/10 text-green-500">
              +{product.bonusPercentage}% Bonus
            </Badge>
          </div>
        )}
        
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Coins className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">{product.displayName}</p>
                <p className="text-sm text-muted-foreground">
                  {formatCredits(product.credits)} credits
                </p>
              </div>
            </div>
            
            <div className="text-right">
              <p className="text-lg font-bold">{formatPrice(product.storePrice)}</p>
              {product.webPrice !== product.storePrice && (
                <p className="text-xs text-muted-foreground">
                  {formatPrice(product.webPrice)} on web
                </p>
              )}
            </div>
          </div>
          
          {isSelected && isPurchasing && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/**
 * Main mobile billing component
 */
export function MobileBillingCard() {
  const { creditBalance, refreshBalance } = useCredits();
  const { 
    isAvailable, 
    isLoading, 
    isPurchasing, 
    products, 
    purchase, 
    restorePurchases,
    platform,
  } = useIAP();
  
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  
  const handlePurchase = async (productId: string) => {
    setSelectedProduct(productId);
    const success = await purchase(productId);
    if (success) {
      refreshBalance();
    }
    setSelectedProduct(null);
  };
  
  const handleRestore = async () => {
    await restorePurchases();
    refreshBalance();
  };
  
  if (!isAvailable) {
    // Show web billing info if not on mobile
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Add Credits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            In-app purchases are available in our mobile app. 
            On web, please visit the billing page to add credits.
          </p>
          <Button className="mt-4 w-full" asChild>
            <a href="/dashboard/billing">Go to Billing</a>
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Purchase Credits
          </CardTitle>
          <Badge variant="outline">
            {platform === "ios" ? "App Store" : "Play Store"}
          </Badge>
        </div>
        
        {creditBalance !== null && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Current balance:</span>
            <span className="font-mono font-bold">
              {formatCredits(Math.floor(creditBalance * 100))} credits
            </span>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onPurchase={handlePurchase}
                  isPurchasing={isPurchasing}
                  isSelected={selectedProduct === product.id}
                />
              ))}
            </div>
            
            <div className="border-t pt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleRestore}
                disabled={isPurchasing}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Restore Purchases
              </Button>
            </div>
            
            <p className="text-center text-xs text-muted-foreground">
              Purchases are processed by {platform === "ios" ? "Apple" : "Google"}. 
              Credits are added to your account immediately after purchase confirmation.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Compact credit purchase button for use in other components
 */
export function BuyCreditsButton({ 
  productId = "credits_1000",
  variant = "default",
  size = "default",
  className,
}: {
  productId?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}) {
  const { isAvailable, isPurchasing, purchase, products } = useIAP();
  const { refreshBalance } = useCredits();
  
  const product = products.find((p) => p.id === productId);
  
  if (!isAvailable || !product) {
    return null;
  }
  
  const handlePurchase = async () => {
    const success = await purchase(productId);
    if (success) {
      refreshBalance();
    }
  };
  
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handlePurchase}
      disabled={isPurchasing}
    >
      {isPurchasing ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Coins className="mr-2 h-4 w-4" />
      )}
      {formatPrice(product.storePrice)}
    </Button>
  );
}

