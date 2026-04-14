import { NextResponse, type NextRequest } from "next/server";
import { verifyStewardTokenCached } from "@/lib/auth/steward-client";
import { usersService } from "@/lib/services/users";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = body?.token;
    if (!token) return NextResponse.json({ error: "no token" }, { status: 400 });

    const claims = await verifyStewardTokenCached(token);
    if (!claims) return NextResponse.json({ error: "verification failed", step: "verify" });

    const user = await usersService.getByStewardId(claims.userId);
    
    return NextResponse.json({
      ok: true,
      claims: { userId: claims.userId, email: claims.email, tenantId: claims.tenantId },
      userFound: !!user,
      userId: user?.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.split("\n").slice(0, 3) }, { status: 500 });
  }
}
