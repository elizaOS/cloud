import { z } from "zod";
import { NextResponse } from "next/server";

// Schemas
const AddressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().length(2),
});

export const RegistrantInfoSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  organization: z.string().optional(),
  address: AddressSchema,
  phone: z.string().optional(),
  privacyEnabled: z.boolean().optional(),
});

export type RegistrantInfo = z.infer<typeof RegistrantInfoSchema>;

export const DomainResourceTypes = [
  "app",
  "container",
  "agent",
  "mcp",
] as const;
export type DomainResourceType = (typeof DomainResourceTypes)[number];

export const AssignDomainSchema = z.object({
  resourceType: z.enum(DomainResourceTypes),
  resourceId: z.string().uuid(),
});

export type AssignDomainInput = z.infer<typeof AssignDomainSchema>;

export const DomainSearchSchema = z.object({
  q: z.string().min(1).max(63),
  tlds: z.string().optional(),
});

export const DomainCheckSchema = z.object({
  domain: z.string().min(3).max(253),
});

export const UpdateDomainSchema = z.object({
  autoRenew: z.boolean().optional(),
  registrantInfo: RegistrantInfoSchema.optional(),
});

// Utilities
export const normalizeDomain = (domain: string): string =>
  domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

export const isApexDomain = (domain: string): boolean =>
  domain.split(".").length === 2;

export { extractErrorMessage } from "@/lib/utils/error-handling";

// API response helpers
export const domainNotFound = () =>
  NextResponse.json({ error: "Domain not found" }, { status: 404 });
export const invalidJson = () =>
  NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
export const validationError = (issues: z.ZodIssue[]) =>
  NextResponse.json(
    { error: "Invalid request", details: issues },
    { status: 400 },
  );

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodSchema<T>,
): Promise<
  { success: true; data: T } | { success: false; response: NextResponse }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { success: false, response: invalidJson() };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return { success: false, response: validationError(parsed.error.issues) };
  return { success: true, data: parsed.data };
}

export interface DomainRouteParams {
  params: Promise<{ id: string }>;
}
