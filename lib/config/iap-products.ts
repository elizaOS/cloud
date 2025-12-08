/**
 * In-App Purchase Products Configuration
 * 
 * This file defines the credit packs available for purchase in the iOS App Store
 * and Google Play Store. Prices are calculated to account for the 30% platform fee
 * so that users receive the same credit value regardless of where they purchase.
 * 
 * Web Price: Direct price (no fee)
 * Store Price: Price × 1.43 to account for 30% fee (1 / 0.70 ≈ 1.43)
 * 
 * Example: $10 web = $13.99 store → user gets same credits, we net ~$10
 */

/**
 * Platform fee percentage charged by App Store / Play Store
 */
export const PLATFORM_FEE_PERCENTAGE = 0.30;

/**
 * Multiplier to apply to web price to get store price (accounts for 30% fee)
 * Formula: 1 / (1 - 0.30) = 1.4286, rounded to practical store price tiers
 */
export const STORE_PRICE_MULTIPLIER = 1.43;

/**
 * IAP Product definition
 */
export interface IAPProduct {
  /** Product ID used in App Store Connect and Play Console */
  id: string;
  /** Price on web (direct purchase, no platform fee) in USD */
  webPrice: number;
  /** Price in App Store / Play Store (includes platform fee) in USD */
  storePrice: number;
  /** Number of credits the user receives */
  credits: number;
  /** Human-readable display name */
  displayName: string;
  /** Description for the store listing */
  description: string;
  /** Whether this is the most popular / recommended option */
  isPopular?: boolean;
  /** Percentage bonus over base rate (for display) */
  bonusPercentage?: number;
}

/**
 * Credit packs available for in-app purchase
 * 
 * Store prices are tier prices that Apple/Google accept:
 * - Must be from their predefined price tiers
 * - Prices shown are USD equivalents
 * 
 * Credits are valued at $0.01 each (100 credits = $1)
 */
export const IAP_PRODUCTS: IAPProduct[] = [
  {
    id: "credits_100",
    webPrice: 1.00,
    storePrice: 1.49,  // Tier A $0.99-1.99, using $1.49
    credits: 100,
    displayName: "100 Credits",
    description: "100 credits for Eliza Cloud services",
  },
  {
    id: "credits_500",
    webPrice: 5.00,
    storePrice: 6.99,  // Tier B
    credits: 500,
    displayName: "500 Credits",
    description: "500 credits for Eliza Cloud services",
  },
  {
    id: "credits_1000",
    webPrice: 10.00,
    storePrice: 13.99,  // Tier C
    credits: 1000,
    displayName: "1,000 Credits",
    description: "1,000 credits for Eliza Cloud services",
    isPopular: true,
  },
  {
    id: "credits_2500",
    webPrice: 25.00,
    storePrice: 34.99,  // Tier D
    credits: 2500,
    displayName: "2,500 Credits",
    description: "2,500 credits for Eliza Cloud services",
    bonusPercentage: 0,  // No bonus at this tier
  },
  {
    id: "credits_5000",
    webPrice: 50.00,
    storePrice: 69.99,  // Tier E
    credits: 5250,  // 5% bonus
    displayName: "5,000 Credits + 5% Bonus",
    description: "5,000 credits + 250 bonus for Eliza Cloud services",
    bonusPercentage: 5,
  },
  {
    id: "credits_10000",
    webPrice: 100.00,
    storePrice: 139.99,  // Tier F
    credits: 11000,  // 10% bonus
    displayName: "10,000 Credits + 10% Bonus",
    description: "10,000 credits + 1,000 bonus for Eliza Cloud services",
    bonusPercentage: 10,
  },
];

/**
 * Get a product by its ID
 */
export function getProductById(productId: string): IAPProduct | undefined {
  return IAP_PRODUCTS.find((p) => p.id === productId);
}

/**
 * Get all product IDs for querying the store
 */
export function getProductIds(): string[] {
  return IAP_PRODUCTS.map((p) => p.id);
}

/**
 * Calculate net revenue after platform fees
 * @param storePrice - The price paid in the app store
 * @returns Net revenue we receive after 30% fee
 */
export function getNetRevenue(storePrice: number): number {
  return storePrice * (1 - PLATFORM_FEE_PERCENTAGE);
}

/**
 * Calculate credits per dollar for a product
 * Useful for showing value comparison
 */
export function getCreditsPerDollar(product: IAPProduct): number {
  return product.credits / product.storePrice;
}

/**
 * Get the "best value" product (highest credits per dollar)
 */
export function getBestValueProduct(): IAPProduct {
  return IAP_PRODUCTS.reduce((best, current) => {
    const bestValue = getCreditsPerDollar(best);
    const currentValue = getCreditsPerDollar(current);
    return currentValue > bestValue ? current : best;
  });
}

/**
 * Convert credits to USD value
 * Credits are valued at $0.01 each
 */
export function creditsToUsd(credits: number): number {
  return credits / 100;
}

/**
 * Convert USD to credits
 */
export function usdToCredits(usd: number): number {
  return Math.floor(usd * 100);
}

/**
 * Format price for display
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price);
}

/**
 * Format credits for display
 */
export function formatCredits(credits: number): string {
  return new Intl.NumberFormat("en-US").format(credits);
}

