/**
 * Shared domain types and schemas
 */
import { z } from "zod";

// Registrant information schema (used across purchase and registration)
export const RegistrantInfoSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  organization: z.string().optional(),
  address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().min(1),
    country: z.string().length(2), // ISO 3166-1 alpha-2
  }),
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

// Domain status types
export type DomainStatus = "pending" | "active" | "expired" | "suspended" | "transferring";
export type DomainModerationStatus = "clean" | "pending_review" | "flagged" | "suspended";

// Helper to normalize domains consistently
export function normalizeDomain(domain: string): string {
  return domain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

// Helper to check if domain is apex (e.g., example.com vs sub.example.com)
export function isApexDomain(domain: string): boolean {
  return domain.split(".").length === 2;
}

// Extract error message from unknown error
export function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

