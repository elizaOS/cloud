import crypto from "crypto";

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyInviteToken(token: string, hash: string): boolean {
  return hashInviteToken(token) === hash;
}
