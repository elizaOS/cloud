/**
 * OAuth3 Authentication API
 * 
 * Endpoints for decentralized OAuth3 authentication.
 * All frontend OAuth3 requests are proxied through this route to avoid CORS issues.
 */

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  initOAuth3Login,
  completeOAuth3Login,
  loginWithWallet,
  loginWithFarcaster,
  isOAuth3Available,
  type OAuth3Provider,
} from "@/lib/auth-oauth3";
import type { Address, Hex } from "viem";

// OAuth3 TEE Agent endpoint - used for server-side proxying
const OAUTH3_AGENT_URL = process.env.OAUTH3_AGENT_URL ?? "http://localhost:4200";

export async function GET() {
  const available = await isOAuth3Available();
  
  return NextResponse.json({
    available,
    providers: ["wallet", "farcaster", "google", "github", "twitter", "discord"],
    version: "0.1.0",
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  switch (action) {
    case "init": {
      const { provider, redirectUri } = body as {
        provider: OAuth3Provider;
        redirectUri: string;
      };

      const result = await initOAuth3Login(provider, redirectUri);
      return NextResponse.json(result);
    }

    case "callback": {
      const { state, code } = body as { state: string; code: string };

      const session = await completeOAuth3Login(state, code);

      const cookieStore = await cookies();
      cookieStore.set("oauth3-token", session.sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 86400,
        path: "/",
      });

      return NextResponse.json({ success: true, session });
    }

    case "wallet": {
      const { address, signature, message } = body as {
        address: Address;
        signature: Hex;
        message: string;
      };

      const session = await loginWithWallet(address, signature, message);

      const cookieStore = await cookies();
      cookieStore.set("oauth3-token", session.sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 86400,
        path: "/",
      });

      return NextResponse.json({ success: true, session });
    }

    case "farcaster": {
      const { fid, custodyAddress, signature, message } = body as {
        fid: number;
        custodyAddress: Address;
        signature: Hex;
        message: string;
      };

      const session = await loginWithFarcaster(
        fid,
        custodyAddress,
        signature,
        message
      );

      const cookieStore = await cookies();
      cookieStore.set("oauth3-token", session.sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 86400,
        path: "/",
      });

      return NextResponse.json({ success: true, session });
    }

    // Email authentication - send verification code
    case "email-send-code": {
      const { email } = body as { email: string };

      const response = await fetch(`${OAUTH3_AGENT_URL}/auth/email/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, appId: "eliza-cloud" }),
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: "Failed to send verification code" },
          { status: response.status }
        );
      }

      return NextResponse.json({ success: true });
    }

    // Email authentication - verify code
    case "email-verify": {
      const { code } = body as { code: string };

      const response = await fetch(`${OAUTH3_AGENT_URL}/auth/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, appId: "eliza-cloud" }),
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: "Invalid verification code" },
          { status: response.status }
        );
      }

      const { sessionId } = await response.json();

      const cookieStore = await cookies();
      cookieStore.set("oauth3-token", sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: "/",
      });

      return NextResponse.json({ success: true });
    }

    // Wallet signing
    case "wallet-sign": {
      const { sessionId, message } = body as { sessionId: Hex; message: string };

      const response = await fetch(`${OAUTH3_AGENT_URL}/wallet/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: "Failed to sign message" },
          { status: response.status }
        );
      }

      const data = await response.json();
      return NextResponse.json(data);
    }

    // Link additional account
    case "link": {
      const { sessionId, provider, redirectUri } = body as {
        sessionId: Hex;
        provider: OAuth3Provider;
        redirectUri: string;
      };

      const response = await fetch(`${OAUTH3_AGENT_URL}/auth/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, provider, redirectUri }),
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: "Failed to initialize account linking" },
          { status: response.status }
        );
      }

      const data = await response.json();
      return NextResponse.json(data);
    }

    // Unlink account
    case "unlink": {
      const { sessionId, provider } = body as {
        sessionId: Hex;
        provider: OAuth3Provider;
      };

      const response = await fetch(`${OAUTH3_AGENT_URL}/auth/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, provider }),
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: "Failed to unlink account" },
          { status: response.status }
        );
      }

      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
