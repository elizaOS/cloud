/**
 * POST /api/v1/topup/50 — X402 $50 credit topup.
 * Uses shared createTopupHandler so referral and revenue splits run for all tiers.
 */
import crypto from "crypto";
import { withX402, type RouteConfig } from "x402-next";
import {
  createTopupHandler,
  getPayToAddress,
  createWrappedHandler,
  getNetwork,
} from "@/lib/services/topup-handler";

const AMOUNT = 50;

const handler = createTopupHandler({
  amount: AMOUNT,
  getSourceId: (walletAddress: string, paymentId: string) =>
    crypto.createHash("sha256").update(`${walletAddress}-${AMOUNT}-${paymentId}`).digest("hex"),
});

const payTo = getPayToAddress();
const wrappedHandler = createWrappedHandler(handler, payTo);
const network = getNetwork() as RouteConfig["network"];

const routeConfig: RouteConfig = {
  price: "$50.00",
  network,
  config: { description: "Topup $50 credits for Eliza Cloud" },
};

export const POST = withX402(wrappedHandler, payTo, routeConfig);
