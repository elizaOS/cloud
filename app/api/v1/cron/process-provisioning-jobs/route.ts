import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * DISABLED — Provisioning is handled exclusively by the standalone VPS worker.
 * This route is kept as a no-op to prevent 404s from any lingering cron invocations.
 * The VPS worker polls the jobs table directly and has SSH access to Docker nodes.
 */
export async function POST() {
  return NextResponse.json({
    success: true,
    message: "Provisioning handled by VPS worker",
    skipped: true,
  });
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Provisioning handled by VPS worker",
    skipped: true,
  });
}
