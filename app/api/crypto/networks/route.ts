import { NextResponse } from "next/server";
import {
  NETWORK_CONFIGS,
  MIN_PAYMENT_AMOUNT,
  MAX_PAYMENT_AMOUNT,
  getSupportedNetworks,
} from "@/lib/config/crypto";

/**
 * Public API endpoint to get crypto payment network configurations.
 * Used by frontend to display network options and validation rules.
 */
export async function GET() {
  try {
    const networks = getSupportedNetworks().map((networkId) => {
      const config = NETWORK_CONFIGS[networkId];
      return {
        id: config.id,
        name: config.name,
        confirmations: config.confirmations,
        minAmount: config.minAmount.toString(),
        maxAmount: config.maxAmount.toString(),
      };
    });

    return NextResponse.json({
      networks,
      limits: {
        min: MIN_PAYMENT_AMOUNT.toString(),
        max: MAX_PAYMENT_AMOUNT.toString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch network configurations" },
      { status: 500 },
    );
  }
}

