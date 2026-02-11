import type { NextRequest } from "next/server";
import type { UserWithOrganization } from "@/db/repositories/users";
import type { ApiKey } from "@/db/schemas/api-keys";

export type AuthLevel =
  | "session"
  | "sessionWithOrg"
  | "apiKey"
  | "apiKeyWithOrg";

export interface CacheConfig {
  maxTTL: number;
  hitCostMultiplier?: number;
  isMethodCacheable?: (method: string) => boolean;
  maxResponseSize?: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (request: NextRequest) => string;
}

export type ProxyRequestBody = Record<string, unknown>;

export interface ServiceConfig {
  id: string;
  name: string;
  auth: AuthLevel;
  rateLimit?: RateLimitConfig;
  cache?: CacheConfig;
  getCost: (body: ProxyRequestBody, searchParams: URLSearchParams) => Promise<number>;
}

export interface HandlerContext {
  body: ProxyRequestBody;
  auth: { user: UserWithOrganization; apiKey?: ApiKey };
  searchParams: URLSearchParams;
}

export interface HandlerResult {
  response: Response;
  actualCost?: number;
  usageMetadata?: Record<string, unknown>;
}

export type ServiceHandler = (ctx: HandlerContext) => Promise<HandlerResult>;
