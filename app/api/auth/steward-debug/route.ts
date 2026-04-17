import { type NextRequest, NextResponse } from "next/server";
import { verifyStewardTokenCached } from "@/lib/auth/steward-client";
import { usersService } from "@/lib/services/users";
import { syncUserFromSteward } from "@/lib/steward-sync";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = body?.token;
    if (!token)
      return NextResponse.json({ error: "no token" }, { status: 400 });

    const claims = await verifyStewardTokenCached(token);
    if (!claims)
      return NextResponse.json({
        error: "verification failed",
        step: "verify",
      });

    let user = await usersService.getByStewardId(claims.userId);
    let synced = false;

    if (!user) {
      try {
        user = await syncUserFromSteward({
          stewardUserId: claims.userId,
          email: claims.email,
          walletAddress: claims.address,
        });
        synced = true;
      } catch (syncErr: any) {
        return NextResponse.json(
          {
            error: "sync failed",
            message: syncErr.message,
            claims: {
              userId: claims.userId,
              email: claims.email,
              tenantId: claims.tenantId,
            },
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      claims: {
        userId: claims.userId,
        email: claims.email,
        tenantId: claims.tenantId,
      },
      userFound: true,
      synced,
      userId: user?.id,
      orgId: user?.organization_id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
