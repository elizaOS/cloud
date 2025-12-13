/**
 * Shared domain types, schemas, and helpers
 */
import { z } from "zod";
import { NextResponse } from "next/server";

// ============================================
// SCHEMAS
// ============================================

// Registrant address schema
const AddressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().length(2), // ISO 3166-1 alpha-2
});

// Registrant information schema (used across purchase and registration)
export const RegistrantInfoSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  organization: z.string().optional(),
  address: AddressSchema,
  phone: z.string().optional(),
  privacyEnabled: z.boolean().optional(),
});

export type RegistrantInfo = z.infer<typeof RegistrantInfoSchema>;

// Resource types that domains can be assigned to
export const DomainResourceTypes = ["app", "container", "agent", "mcp"] as const;
export type DomainResourceType = (typeof DomainResourceTypes)[number];

// Domain assignment schema
export const AssignDomainSchema = z.object({
  resourceType: z.enum(DomainResourceTypes),
  resourceId: z.string().uuid(),
});

export type AssignDomainInput = z.infer<typeof AssignDomainSchema>;

// Domain search schema
export const DomainSearchSchema = z.object({
  q: z.string().min(1).max(63),
  tlds: z.string().optional(),
});

// Domain check schema
export const DomainCheckSchema = z.object({
  domain: z.string().min(3).max(253),
});

// Domain update schema (for PATCH)
export const UpdateDomainSchema = z.object({
  autoRenew: z.boolean().optional(),
  registrantInfo: RegistrantInfoSchema.optional(),
});

// Domain status types
export type DomainStatus = "pending" | "active" | "expired" | "suspended" | "transferring";
export type DomainModerationStatus = "clean" | "pending_review" | "flagged" | "suspended";

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Normalize domain consistently
export function normalizeDomain(domain: string): string {
  return domain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

// Check if domain is apex (e.g., example.com vs sub.example.com)
export function isApexDomain(domain: string): boolean {
  return domain.split(".").length === 2;
}

// Re-export from shared error handling utility
export { extractErrorMessage } from "@/lib/utils/error-handling";

// ============================================
// API RESPONSE HELPERS
// ============================================

// Standard error responses
export const domainNotFound = () => 
  NextResponse.json({ error: "Domain not found" }, { status: 404 });

export const invalidJson = () => 
  NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

export const validationError = (issues: z.ZodIssue[]) =>
  NextResponse.json({ error: "Invalid request", details: issues }, { status: 400 });

// Parse JSON body with error handling
export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { success: false, response: invalidJson() };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { success: false, response: validationError(parsed.error.issues) };
  }

  return { success: true, data: parsed.data };
}

// Common route params type for [id] routes
export interface DomainRouteParams {
  params: Promise<{ id: string }>;
}

