import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  requireAuthWithOrg,
  requireAuthOrApiKey,
  requireAuthOrApiKeyWithOrg,
} from "@/lib/auth";
import { creditsService, InsufficientCreditsError } from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import { cache } from "@/lib/cache/client";
import { logger } from "@/lib/utils/logger";
import { PricingNotFoundError } from "./pricing";
import type {
  ServiceConfig,
  ServiceHandler,
  HandlerContext,
  HandlerResult,
  AuthLevel,
  ProxyRequestBody,
} from "./types";
import { createHash } from "node:crypto";

async function getAuthForLevel(request: NextRequest, level: AuthLevel) {
  switch (level) {
    case "session":
      return { user: await requireAuth() };
    case "sessionWithOrg":
      return { user: await requireAuthWithOrg() };
    case "apiKey":
      return await requireAuthOrApiKey(request);
    case "apiKeyWithOrg":
      return await requireAuthOrApiKeyWithOrg(request);
  }
}

function buildCacheKey(
  serviceId: string,
  orgId: string,
  body: ProxyRequestBody,
  searchParams: URLSearchParams,
): string {
  try {
    const contentHash = createHash("sha256")
      .update(JSON.stringify(body) + searchParams.toString())
      .digest("hex")
      .substring(0, 16);
    return `svc:${serviceId}:${orgId}:${contentHash}`;
  } catch (error) {
    logger.warn("Failed to serialize body for cache key", { error });
    // Fallback to a generic key without body content
    return `svc:${serviceId}:${orgId}:fallback`;
  }
}</search>
</change>

<change path="lib/services/proxy/engine.ts">
<search>import type {
  ServiceConfig,
  ServiceHandler,
  HandlerContext,
  HandlerResult,
  AuthLevel,
  ProxyRequestBody,
} from "./types";</search>
<replace>import type {
  ServiceConfig,
  ServiceHandler,
  HandlerContext,
  HandlerResult,
  AuthLevel,
  ProxyRequestBody,
} from "./types";</change>
</change>

<change path="lib/services/proxy/services/solana-rpc.ts">
<search>export const solanaRpcConfig: ServiceConfig = {
  id: "solana-rpc",
  name: "Solana RPC",
  auth: "apiKeyWithOrg",
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100,
  },
  cache: {
    enabled: true,
    ttl: 60,
  },
  getCost: async (body: Record<string, unknown> | Record<string, unknown>[])</search>
<replace>export const solanaRpcConfig: ServiceConfig = {
  id: "solana-rpc",
  name: "Solana RPC",
  auth: "apiKeyWithOrg",
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100,
  },
  cache: {
    enabled: true,
    ttl: 60,
  },
  getCost: async (body: ProxyRequestBody | ProxyRequestBody[])

export function createHandler(
  config: ServiceConfig,
  work: ServiceHandler,
): (request: NextRequest) => Promise<Response> {
  const handler = async (request: NextRequest): Promise<Response> => {
    const startTime = Date.now();
    const searchParams = new URL(request.url).searchParams;

    try {
      const auth = await getAuthForLevel(request, config.auth);
      const { user } = auth;
      const apiKey = "apiKey" in auth ? auth.apiKey : undefined;

      const body =
        request.method === "POST" ? await request.json() : null;

      const cost = await config.getCost(body, searchParams);

      if (!user.organization_id) {
        return Response.json(
          { error: "Organization required for billing" },
          { status: 403 },
        );
      }

      if (!user.organization_id) {
        return NextResponse.json(
          { error: "Organization membership required for billing" },
          { status: 403 },
        );
      }

      if (!user.organization_id) {
        return NextResponse.json(
          { error: "Organization membership required to use this service" },
          { status: 403 },
        );
      }

      if (!user.organization_id) {
        return new Response(
          JSON.stringify({ error: "Organization membership required to use this service" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }

      const reservation = await creditsService.reserve({
        organizationId: user.organization_id,
        userId: user.id,
        amount: cost,
        description: config.name,
      });

      if (config.cache && body && !Array.isArray(body)) {
        const cacheControl = request.headers.get("cache-control");
        const maxAgeMatch = cacheControl?.match(/max-age=(\d+)/);
        const clientMaxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;

        if (clientMaxAge > 0) {
          const method =
            body && typeof body === "object" && "method" in body
              ? String(body.method)
              : "_default";

          const isCacheable = config.cache.isMethodCacheable
            ? config.cache.isMethodCacheable(method)
            : true;

          if (isCacheable) {
            const cacheKey = buildCacheKey(
              config.id,
              user.organization_id,
              body,
              searchParams,
            );

            const cachedResponse = await cache.get<{
              body: string;
              status: number;
              headers: Record<string, string>;
              cachedAt: number;
            }>(cacheKey);

            if (cachedResponse) {
              const age = Math.floor((Date.now() - cachedResponse.cachedAt) / 1000);
              if (age <= clientMaxAge) {
                const hitMultiplier = config.cache.hitCostMultiplier ?? 0.5;
                await reservation.reconcile(cost * hitMultiplier);

                const response = new Response(cachedResponse.body, {
                  status: cachedResponse.status,
                  headers: {
                    ...cachedResponse.headers,
                    "X-Cache": "HIT",
                    "X-Cache-Age": String(age),
                  },
                });

                (async () => {
                  try {
                    await usageService.create({
                      organization_id: user.organization_id,
                      user_id: user.id,
                      api_key_id: apiKey?.id,
                      type: config.id,
                      provider: config.id,
                      input_cost: cost * hitMultiplier,
                      output_cost: 0,
                      markup: 0,
                      duration_ms: Date.now() - startTime,
                      is_successful: true,
                      metadata: { cached: true, cache_age: age },
                    });
                  } catch (error) {
                    logger.error("[Proxy Engine] Usage tracking failed (cache hit)", { error });
                  }
                })();

                return response;
              }
            }
          }
        }
      }

      let result: HandlerResult;
      try {
        result = await work({ body, auth, searchParams });
      } catch (error) {
        await reservation.reconcile(0);
        throw error;
      }

      const actualCost = result.actualCost ?? cost;
      await reservation.reconcile(actualCost);

      if (
        config.cache &&
        body &&
        !Array.isArray(body) &&
        result.response.ok
      ) {
        const cacheControl = request.headers.get("cache-control");
        const maxAgeMatch = cacheControl?.match(/max-age=(\d+)/);
        const clientMaxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;

        if (clientMaxAge > 0) {
          const method =
            body && typeof body === "object" && "method" in body
              ? String(body.method)
              : "_default";

          const isCacheable = config.cache.isMethodCacheable
            ? config.cache.isMethodCacheable(method)
            : true;

          if (isCacheable) {
            // Clone response before consuming body to preserve original stream
            const clonedResponse = result.response.clone();
            const responseBody = await clonedResponse.text();
            const maxSize = config.cache.maxResponseSize ?? 65536;

            if (responseBody.length <= maxSize) {
              const cacheKey = buildCacheKey(
                config.id,
                user.organization_id,
                body,
                searchParams,
              );

              const ttl = Math.min(clientMaxAge, config.cache.maxTTL);
              const headersObj: Record<string, string> = {};
              result.response.headers.forEach((value, key) => {
                headersObj[key] = value;
              });

              await cache.set(
                cacheKey,
                {
                  body: responseBody,
                  status: result.response.status,
                  headers: headersObj,
                  cachedAt: Date.now(),
                },
                ttl,
              );

              result.response = new Response(responseBody, {
                status: result.response.status,
                headers: {
                  ...headersObj,
                  "X-Cache": "MISS",
                },
              });
            }
          }
        }
      }

      const isSuccessful = result.response.ok;

      (async () => {
        try {
          await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: apiKey?.id,
            type: config.id,
            provider: config.id,
            input_cost: actualCost,
            output_cost: String(0),
            markup: String(0),
            duration_ms: Date.now() - startTime,
            is_successful: isSuccessful,
            error_message: isSuccessful ? undefined : `Upstream returned ${result.response.status}`,
            metadata: { cached: false, ...(result.usageMetadata ?? {}) },
          });
        } catch (error) {
          logger.error("[Proxy Engine] Usage tracking failed", { error });
        }
      })();

      return result.response;
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            error: "Insufficient credits",
            required: error.required,
            available: error.available,
          },
          { status: 402 },
        );
      }

      if (error instanceof PricingNotFoundError) {
        logger.error("[Proxy Engine] Pricing configuration error", {
          serviceId: error.serviceId,
          method: error.method,
        });
        return NextResponse.json(
          { error: "Service temporarily unavailable" },
          { status: 500 },
        );
      }

      if (error instanceof Error) {
        if (
          error.message.includes("validation") ||
          error.message.includes("Invalid") ||
          error.message.includes("not supported")
        ) {
          return NextResponse.json(
            { error: error.message },
            { status: 400 },
          );
        }

        if (error.name === "TimeoutError" || error.message.includes("timeout")) {
          return NextResponse.json(
            { error: "Upstream service timeout" },
            { status: 504 },
          );
        }
      }

      logger.error("[Proxy Engine] Handler error", { error });
      return NextResponse.json(
        { error: "Upstream service error" },
        { status: 502 },
      );
    }
  };

  if (config.rateLimit) {
    return withRateLimit(handler, config.rateLimit);
  }

  return handler;
}

export async function executeWithBody(
  config: ServiceConfig,
  work: ServiceHandler,
  request: NextRequest,
  body: unknown,
): Promise<Response> {
  const handler = createHandler(config, work);
  const mockRequest = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(body),
  });
  return handler(mockRequest);
}
