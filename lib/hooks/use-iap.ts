/**
 * In-App Purchase Hook
 *
 * Provides a React hook for handling in-app purchases in the Tauri mobile app.
 * Handles communication with the native IAP layer (iOS StoreKit 2 / Android Billing).
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import { usePrivy } from "@/lib/providers/PrivyProvider";
import { toast } from "sonner";
import { isMobileApp, isIOS, isAndroid } from "@/lib/api/mobile-client";
import {
  IAP_PRODUCTS,
  type IAPProduct,
  getProductIds,
  formatCredits,
  formatPrice,
} from "@/lib/config/iap-products";

/**
 * Product information from the native store
 */
interface StoreProduct {
  id: string;
  price: string;
  priceAmountMicros: number;
  currencyCode: string;
  title: string;
  description: string;
}

/**
 * Purchase result from native layer
 */
interface PurchaseResult {
  success: boolean;
  transactionId?: string;
  receipt?: string;
  originalTransactionId?: string;
  purchaseToken?: string;
  error?: string;
  errorCode?: string;
}

/**
 * IAP state and actions
 */
interface UseIAPReturn {
  /** Whether IAP is available on this platform */
  isAvailable: boolean;
  /** Whether products are loading from the store */
  isLoading: boolean;
  /** Whether a purchase is in progress */
  isPurchasing: boolean;
  /** Products with store prices (if available) */
  products: IAPProduct[];
  /** Store products with localized prices */
  storeProducts: StoreProduct[];
  /** Error message if any */
  error: string | null;
  /** Load products from the store */
  loadProducts: () => Promise<void>;
  /** Purchase a product by ID */
  purchase: (productId: string) => Promise<boolean>;
  /** Restore previous purchases */
  restorePurchases: () => Promise<void>;
  /** Get the platform name */
  platform: "ios" | "android" | "web";
}

/**
 * Check if Tauri invoke is available
 */
async function getTauriInvoke(): Promise<
  ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null
> {
  if (typeof window === "undefined") return null;

  // @ts-expect-error - Tauri types not available at compile time
  if (window.__TAURI__?.core?.invoke) {
    // @ts-expect-error - Tauri types
    return window.__TAURI__.core.invoke;
  }

  // @ts-expect-error - Tauri types
  if (window.__TAURI_INTERNALS__?.invoke) {
    // @ts-expect-error - Tauri types
    return window.__TAURI_INTERNALS__.invoke;
  }

  return null;
}

/**
 * Hook for handling in-app purchases
 */
export function useIAP(): UseIAPReturn {
  const { getAccessToken } = usePrivy();
  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [invoke, setInvoke] = useState<
    ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null
  >(null);

  // Determine platform
  const platform: "ios" | "android" | "web" = isIOS()
    ? "ios"
    : isAndroid()
      ? "android"
      : "web";
  const isAvailable =
    isMobileApp() && (platform === "ios" || platform === "android");

  // Initialize Tauri invoke
  useEffect(() => {
    getTauriInvoke().then(setInvoke);
  }, []);

  // Merge store products with our product definitions
  const products: IAPProduct[] = IAP_PRODUCTS.map((product) => {
    const storeProduct = storeProducts.find((sp) => sp.id === product.id);
    if (storeProduct) {
      return {
        ...product,
        // Override with localized store price if available
        storePrice: storeProduct.priceAmountMicros / 1_000_000,
      };
    }
    return product;
  });

  /**
   * Load products from the native store
   */
  const loadProducts = useCallback(async () => {
    if (!isAvailable || !invoke) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const productIds = getProductIds();
    const result = (await invoke("get_products", {
      productIds,
    })) as StoreProduct[];
    setStoreProducts(result);
    setIsLoading(false);
  }, [isAvailable, invoke]);

  /**
   * Purchase a product
   */
  const purchase = useCallback(
    async (productId: string): Promise<boolean> => {
      if (!isAvailable || !invoke) {
        toast.error("In-app purchases are not available on this platform");
        return false;
      }

      setIsPurchasing(true);
      setError(null);

      const product = IAP_PRODUCTS.find((p) => p.id === productId);
      if (!product) {
        setError("Product not found");
        setIsPurchasing(false);
        return false;
      }

      // Initiate native purchase
      const result = (await invoke("purchase_product", {
        productId,
      })) as PurchaseResult;

      if (!result.success) {
        if (result.errorCode !== "USER_CANCELLED") {
          setError(result.error || "Purchase failed");
          toast.error(result.error || "Purchase failed");
        }
        setIsPurchasing(false);
        return false;
      }

      // Verify receipt with backend
      const token = await getAccessToken();

      const verifyResponse = await fetch("/api/v1/iap/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          platform,
          productId,
          transactionId: result.transactionId,
          receipt: result.receipt,
          purchaseToken: result.purchaseToken,
        }),
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyData.success) {
        setError(verifyData.error || "Failed to verify purchase");
        toast.error("Purchase verification failed. Please contact support.");
        setIsPurchasing(false);
        return false;
      }

      // Success!
      toast.success(`Added ${formatCredits(product.credits)} credits!`);
      setIsPurchasing(false);
      return true;
    },
    [isAvailable, invoke, platform, getAccessToken],
  );

  /**
   * Restore previous purchases
   */
  const restorePurchases = useCallback(async () => {
    if (!isAvailable || !invoke) {
      toast.error("Restore is not available on this platform");
      return;
    }

    setIsLoading(true);
    setError(null);

    const results = (await invoke("restore_purchases")) as PurchaseResult[];

    if (results.length === 0) {
      toast.info("No previous purchases found");
    } else {
      // Verify each restored purchase
      const token = await getAccessToken();
      let restored = 0;

      for (const result of results) {
        if (result.success && result.transactionId && result.receipt) {
          const verifyResponse = await fetch("/api/v1/iap/verify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token && { Authorization: `Bearer ${token}` }),
            },
            body: JSON.stringify({
              platform,
              productId: "restored", // Backend should extract from receipt
              transactionId: result.transactionId,
              receipt: result.receipt,
              purchaseToken: result.purchaseToken,
            }),
          });

          if (verifyResponse.ok) {
            restored++;
          }
        }
      }

      if (restored > 0) {
        toast.success(`Restored ${restored} purchase(s)`);
      } else {
        toast.info("All purchases already applied");
      }
    }

    setIsLoading(false);
  }, [isAvailable, invoke, platform, getAccessToken]);

  // Load products on mount if available
  useEffect(() => {
    if (isAvailable && invoke) {
      // Use queueMicrotask to defer setState and avoid cascading render warning
      queueMicrotask(() => {
        loadProducts();
      });
    }
  }, [isAvailable, invoke, loadProducts]);

  return {
    isAvailable,
    isLoading,
    isPurchasing,
    products,
    storeProducts,
    error,
    loadProducts,
    purchase,
    restorePurchases,
    platform,
  };
}

export type { StoreProduct, PurchaseResult, UseIAPReturn };
