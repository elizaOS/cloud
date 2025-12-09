/**
 * IAP Products Endpoint
 * 
 * GET /api/v1/iap/products
 * 
 * Returns the list of in-app purchase products available for the mobile app.
 * This is used by the frontend to display products with correct pricing before
 * querying the actual store (which may have localized prices).
 */

import { NextResponse } from "next/server";
import { IAP_PRODUCTS, formatPrice, formatCredits } from "@/lib/config/iap-products";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/iap/products
 * 
 * Returns all available IAP products with pricing information
 */
export async function GET() {
  const products = IAP_PRODUCTS.map((product) => ({
    id: product.id,
    displayName: product.displayName,
    description: product.description,
    webPrice: product.webPrice,
    webPriceFormatted: formatPrice(product.webPrice),
    storePrice: product.storePrice,
    storePriceFormatted: formatPrice(product.storePrice),
    credits: product.credits,
    creditsFormatted: formatCredits(product.credits),
    isPopular: product.isPopular ?? false,
    bonusPercentage: product.bonusPercentage ?? 0,
    creditsPerDollar: product.credits / product.storePrice,
  }));
  
  return NextResponse.json({
    products,
    currency: "USD",
    platformFee: 0.30,
    note: "Store prices include platform fees. Web purchases have no platform fee.",
  });
}

