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
} from "./types";
import crypto from "crypto";

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
  body: unknown,
  searchParams: URLSearchParams,
): string {
  const contentHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(body) + searchParams.toString())
    .digest("hex")
    .substring(0, 16);
  return `svc:${serviceId}:${orgId}:${contentHash}`;
}

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

      const reservation = await creditsService.reserve({
        organizationId: user.organization_id,
        userId: user.id,
        amount: cost,
        description: config.name,
      });

      let cached = false;
      let cacheAge: number | undefined;

      if (config.cache && body && !Array.isArray(body)) {
        const cacheControl = request.headers.get("cache-control");
        const maxAgeMatch = cacheControl?.match(/max-age=(\d+)/);
        const clientMaxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]) : 0;

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
                cached = true;
                cacheAge = age;

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
        !cached &&
        result.response.ok
      ) {
        const cacheControl = request.headers.get("cache-control");
        const maxAgeMatch = cacheControl?.match(/max-age=(\d+)/);
        const clientMaxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]) : 0;

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

      (async () => {
        try {
          await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: apiKey?.id,
            type: config.id,
            provider: config.id,
            input_cost: actualCost,
            output_cost: 0,
            markup: 0,
            duration_ms: Date.now() - startTime,
            is_successful: true,
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
        if (error.message.includes("validation") || error.message.includes("Invalid")) {
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
