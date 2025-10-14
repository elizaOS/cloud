import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Logout endpoint for Privy authentication
 * Clears the Privy auth cookie
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("privy-token");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("privy-token");

    return NextResponse.redirect(
      new URL("/", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
    );
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.redirect(
      new URL("/", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
    );
  }
}
