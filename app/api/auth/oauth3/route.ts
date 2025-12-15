/**
 * OAuth3 Authentication API
 * 
 * Endpoints for decentralized OAuth3 authentication.
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

export async function GET(request: NextRequest) {
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

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
