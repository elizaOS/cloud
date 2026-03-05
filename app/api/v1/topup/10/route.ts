import { withX402, type RouteConfig } from "x402-next";
import crypto from "crypto";
import { createTopupHandler, getPayToAddress, createWrappedHandler, getNetwork } from "@/lib/services/topup-handler";

const AMOUNT = 10;
const handler = createTopupHandler({
  amount: AMOUNT,
  getSourceId: (walletAddress: string, paymentId: string) => {
    return crypto.createHash("sha256")
      .update(`${walletAddress}-${AMOUNT}-${paymentId}`)
      .digest("hex");
  }
});
const payTo = getPayToAddress();
const wrappedHandler = createWrappedHandler(handler, payTo);
const network = getNetwork() as RouteConfig["network"];

const routeConfig: RouteConfig = {
  price: `$${AMOUNT}.00`,
  network,
  config: { description: `Topup $${AMOUNT} credits for Eliza Cloud` },
};

export const POST = withX402(wrappedHandler, payTo, routeConfig);
    
