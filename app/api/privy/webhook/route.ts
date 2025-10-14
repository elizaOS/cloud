import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";
import { syncUserFromPrivy } from "@/lib/privy-sync";

// Verify webhook signature from Privy using their recommended method
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  // Privy sends signature as "v1,timestamp,signature"
  const parts = signature.split(",");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return false;
  }

  const timestamp = parts[1];
  const providedSignature = parts[2];

  // Construct the signed payload
  const signedPayload = `v1:${timestamp}:${payload}`;

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  // Compare signatures
  return crypto.timingSafeEqual(
    Buffer.from(providedSignature),
    Buffer.from(expectedSignature),
  );
}

export async function POST(request: NextRequest) {
  try {
    // Get the raw body
    const body = await request.text();

    // Get headers
    const headersList = await headers();
    const signature = headersList.get("privy-webhook-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing webhook signature" },
        { status: 401 },
      );
    }

    // Verify webhook signature
    const webhookSecret = process.env.PRIVY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("PRIVY_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 },
      );
    }

    const isValid = await verifyWebhookSignature(
      body,
      signature,
      webhookSecret,
    );
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 },
      );
    }

    // Parse the webhook payload
    const payload = JSON.parse(body);

    console.log("Received Privy webhook:", payload.type);

    // Handle different webhook events
    switch (payload.type) {
      case "user.created":
      case "user.linked_account":
      case "user.authenticated": {
        // Sync user on creation, linking new account, or authentication
        const user = await syncUserFromPrivy(payload.user);
        console.log("User synced via webhook:", user.id);
        break;
      }

      case "user.updated": {
        // Update existing user
        const user = await syncUserFromPrivy(payload.user);
        console.log("User updated via webhook:", user.id);
        break;
      }

      case "user.deleted": {
        // Handle user deletion if needed
        console.log("User deletion event received:", payload.user.userId);
        // For now, we'll keep the user in our database but could mark as inactive
        break;
      }

      default:
        console.log("Unhandled webhook type:", payload.type);
    }

    return NextResponse.json(
      { success: true, message: "Webhook processed" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Webhook processing error:", error);

    // Return 200 to prevent retries for processing errors
    // But log the error for debugging
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Processing error",
      },
      { status: 200 },
    );
  }
}
