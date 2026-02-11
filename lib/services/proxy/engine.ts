
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
  } catch {
    logger.warn("Failed to serialize body for cache key");
    // Fallback to a generic key without body content
    return `svc:${serviceId}:${orgId}:fallback`;
  }
}

export function createHandler(
  config: ServiceConfig,
  handler: ServiceHandler,
) {
  return async (request: NextRequest) => {
    try {
      const auth = await getAuthForLevel(request, config.auth);
      const user = "user" in auth ? auth.user : (auth as any).user;

      if (!user.organization_id) {
        return NextResponse.json(
          { error: "Organization membership required for billing" },
          { status: 403 },
        );
      }

      let body: ProxyRequestBody = null;
      if (request.method === "POST") {
        try {
          body = await request.json();
        } catch {
          return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
          );
        }
      }

      const searchParams = new URL(request.url).searchParams;

      // Get cost for this request
      const cost = await config.getCost(body, searchParams);

      // Reserve credits
      if (!user.organization_id) {
        return NextResponse.json(
          { error: "Organization membership required for billing" },
          { status: 403 },
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
              : "unknown";

          const cacheKey = buildCacheKey(
            config.id,
            user.organization_id,
            body,
            searchParams,
          );

          try {
            const cachedResponse = await cache.get(cacheKey);
            if (cachedResponse) {
              // Track usage for cache hits too
              void (async () => {
                try {
                  await usageService.create({
                    organization_id: user.organization_id,
                    user_id: user.id,
                    service_type: config.id,
                    method,
                    input_tokens: 0,
                    output_tokens: 0,
                    input_cost: String(cost),
                    output_cost: String(0),
            markup: String(0),
                    metadata: { cached: true },
                  });
                } catch (error) {
                  logger.error("[Proxy Engine] Usage tracking failed", { error });
                }
              })();

              return new Response(cachedResponse, {
                status: 200,
                headers: {
                  "content-type": "application/json",
                  "x-cache": "HIT",
                },
              });
            }
          } catch (error) {
            logger.warn("[Proxy Engine] Cache read failed", { error });
          }
        }
      }

      const context: HandlerContext = {
        user,
        body,
        searchParams,
        reservation,
      };

      const result = await handler(context);

      // Finalize reservation
      if (result.success) {
        await creditsService.commit(reservation);
      } else {
        await creditsService.release(reservation);
      }

      // Track usage
      const method =
        body && typeof body === "object" && "method" in body
          ? String(body.method)
          : "unknown";

      void (async () => {
        try {
          await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            service_type: config.id,
            method,
            input_tokens: result.inputTokens ?? 0,
            output_tokens: result.outputTokens ?? 0,
            input_cost: String(cost),
            output_cost: 0,
            markup: 0,
            metadata: result.metadata,
          });
        } catch (error) {
          logger.error("[Proxy Engine] Usage tracking failed", { error });
        }
      })();

      // Cache successful responses
      if (result.success && config.cache && body && !Array.isArray(body)) {
        const cacheKey = buildCacheKey(
          config.id,
          user.organization_id,
          body,
          searchParams,
        );
        try {
          const responseText = typeof result.response === "string"
            ? result.response
            : JSON.stringify(result.response);
          await cache.set(cacheKey, responseText, config.cache.ttl);
        } catch (error) {
          logger.warn("[Proxy Engine] Cache write failed", { error });
        }
      }

      return result.nextResponse ?? NextResponse.json(result.response);
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { error: "Insufficient credits" },
          { status: 402 },
        );
      }
      if (error instanceof PricingNotFoundError) {
        return NextResponse.json(
          { error: "Service method not supported" },
          { status: 400 },
        );
      }
      logger.error("[Proxy Engine] Unhandled error", { error });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 502 },
      );
    }
  };
}

export async function executeWithBody(
  config: ServiceConfig,
  handler: ServiceHandler,
  request: NextRequest,
  body: ProxyRequestBody,
) {
  const wrappedHandler = createHandler(config, handler);
  // Override request body for GET-with-body patterns
  const modifiedRequest = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(body),
  });
  return wrappedHandler(modifiedRequest);
}
