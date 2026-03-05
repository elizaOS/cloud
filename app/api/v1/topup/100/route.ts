import { withX402, type RouteConfig } from "x402-next";
import { createTopupHandler, getPayToAddress, createWrappedHandler, getNetwork } from "@/lib/services/topup-handler";

const AMOUNT = 100;
const handler = createTopupHandler({ amount: AMOUNT });
const payTo = getPayToAddress();
const wrappedHandler = createWrappedHandler(handler, payTo);
const network = getNetwork() as RouteConfig["network"];

const routeConfig: RouteConfig = {
    price: `$${AMOUNT}.00`,
    network,
    config: { description: `Topup $${AMOUNT} credits for Eliza Cloud` },
};

export const POST = withX402(wrappedHandler, payTo, routeConfig);
            if (splits.length > 0) {
                logger.info(`[x402] Processing revenue splits for $${AMOUNT} purchase by user ${user.id}`);
                for (const split of splits) {
                    if (split.amount <= 0) continue;

                    const source = split.role === "app_owner" ? "app_owner_revenue_share" : "creator_revenue_share";
                    const sourceId = crypto.createHash("sha256").update(`${walletAddress}-${AMOUNT}-${Date.now()}-${crypto.randomUUID()}`).digest("hex");

                    await redeemableEarningsService.addEarnings({
                        userId: split.userId,
                        amount: split.amount,
                        source: source,
                        sourceId: `x402_crypto_split_${sourceId}`,
                        description: `${split.role === "app_owner" ? "App Owner" : "Creator"} revenue share (${(split.amount / AMOUNT * 100).toFixed(0)}%) for $${AMOUNT} crypto topup`,
                        metadata: {
                            buyer_user_id: user.id,
                            buyer_org_id: organizationId,
                            role: split.role,
                            payment_method: "x402"
                        },
                    });
                    logger.info(`[x402] Credited split: $${split.amount.toFixed(2)} to ${split.role} (${split.userId})`);
                }
            }
        }

        return NextResponse.json({
            success: true,
            amount: AMOUNT,
            walletAddress,
            organizationId,
            message: `Successfully topped up $${AMOUNT}`
        });
    } catch (error) {
        logger.error("Error processing topup", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

const payToRaw = process.env.X402_RECIPIENT_ADDRESS?.trim();
const payTo =
    payToRaw && payToRaw !== "0x0000000000000000000000000000000000000000" && isAddress(payToRaw)
        ? (payToRaw as `0x${string}`)
        : ("0x0000000000000000000000000000000000000001" as `0x${string}`);

async function wrappedHandler(req: NextRequest): Promise<NextResponse> {
    if (payTo === "0x0000000000000000000000000000000000000001") {
        return NextResponse.json(
            { error: "X402_RECIPIENT_ADDRESS is not configured" },
            { status: 503 }
        );
    }
    return handler(req);
}

const network = (process.env.X402_NETWORK || "base-sepolia") as RouteConfig["network"];
const routeConfig: RouteConfig = {
    price: "$100.00",
    network,
    config: { description: "Topup $100 credits for Eliza Cloud" },
};

export const POST = withX402(wrappedHandler, payTo, routeConfig);
