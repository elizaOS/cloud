import { NextRequest } from "next/server";

export function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export const CRON_MAX_RUNTIME_MS = 50000;

// Simple in-memory lock to prevent overlapping cron runs
// Note: This only works within a single serverless instance
// For distributed locking, use Redis or database locks
const locks: Record<string, number> = {};
const LOCK_TTL_MS = 120000; // 2 minutes

export function acquireLock(jobName: string): boolean {
  const now = Date.now();
  const existing = locks[jobName];

  // Lock exists and hasn't expired
  if (existing && now < existing) {
    return false;
  }

  // Acquire lock
  locks[jobName] = now + LOCK_TTL_MS;
  return true;
}

export function releaseLock(jobName: string): void {
  delete locks[jobName];
}
