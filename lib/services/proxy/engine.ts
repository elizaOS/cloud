import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  requireAuthWithOrg,
  requireAuthOrApiKey,
  requireAuthOrApiKeyWithOrg,
} from "@/lib/auth";
import {
  creditsService,
  InsufficientCreditsError,
} from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import { cache } from "@/lib/cache/client";
import { logger } from "@/lib/utils/logger";
import { PricingNotFoundError } from "./pricing";
import type {
  ServiceConfig,
  ServiceHandler,
  HandlerResult,
  AuthLevel,
} from "./types";
import crypto from "crypto";

type CachedProxyResponse = {
  body: string;
  status: number;
  headers: Record<string, string>;
  cachedAt: number;
  ttl?: number;
};

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

function getRequestedMaxAge(request: NextRequest): number {
  const cacheControl = request.headers.get("cache-control");
  const maxAgeMatch = cacheControl?.match(/max-age=(\d+)/);
  return maxAgeMatch ? Number.parseInt(maxAgeMatch[1], 10) : 0;
}

function getMethodFromBody(body: unknown): string {
  return body && typeof body === "object" && "method" in body
    ? String(body.method)
    : "_default";
}

function isCacheableResponseContentType(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase();
  if (!contentType || contentType.includes("text/event-stream")) {
    return false;
  }

  return (
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("javascript") ||
    contentType.includes("x-www-form-urlencoded")
  );
}

function withCacheHeaders(
  headersInit: HeadersInit,
  cacheStatus: "HIT" | "MISS",
  maxAge: number,
  age?: number,
): Headers {
  const headers = new Headers(headersInit);
  headers.set("Cache-Control", `private, max-age=${Math.max(0, maxAge)}`);
  headers.set("X-Cache", cacheStatus);

  if (age !== undefined) {
    headers.set("X-Cache-Age", String(age));
  } else {
    headers.delete("X-Cache-Age");
  }

  return headers;
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

      let body: unknown = null;
      if (request.method === "POST") {
        try {
          body = await request.json();
        } catch {
          return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }
      }

      const cost = await config.getCost(body, searchParams);

      const reservation = await creditsService.reserve({
        organizationId: user.organization_id,
        userId: user.id,
        amount: cost,
        description: config.name,
      });

      const cacheCandidate =
        config.cache && body && !Array.isArray(body)
          ? {
              clientMaxAge: getRequestedMaxAge(request),
              method: getMethodFromBody(body),
            }
          : null;

      const cacheKey =
        cacheCandidate &&
        cacheCandidate.clientMaxAge > 0 &&
        (config.cache.isMethodCacheable
          ? config.cache.isMethodCacheable(cacheCandidate.method)
          : true)
          ? buildCacheKey(config.id, user.organization_id, body, searchParams)
          : null;

      if (cacheKey && cacheCandidate) {
        const cachedResponse = await cache.get<CachedProxyResponse>(cacheKey);

        if (cachedResponse) {
          const age = Math.floor((Date.now() - cachedResponse.cachedAt) / 1000);
          const storedMaxAge = cachedResponse.ttl ?? config.cache.maxTTL;
          const effectiveMaxAge = Math.min(
            cacheCandidate.clientMaxAge,
            storedMaxAge,
          );

          if (age <= effectiveMaxAge) {
            const hitMultiplier = config.cache.hitCostMultiplier ?? 0.5;
            const remainingMaxAge = Math.max(effectiveMaxAge - age, 0);

            await reservation.reconcile(cost * hitMultiplier);

            const response = new Response(cachedResponse.body, {
              status: cachedResponse.status,
              headers: withCacheHeaders(
                cachedResponse.headers,
                "HIT",
                remainingMaxAge,
                age,
              ),
            });

            void (async () => {
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
                logger.error(
                  "[Proxy Engine] Usage tracking failed (cache hit)",
                  {
                    error,
                  },
                );
              }
            })();

            return response;
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
        cacheKey &&
        cacheCandidate &&
        config.cache &&
        result.response.ok &&
        isCacheableResponseContentType(result.response)
      ) {
        const clonedResponse = result.response.clone();
        const responseBody = await clonedResponse.text();
        const maxSize = config.cache.maxResponseSize ?? 65536;

        if (responseBody.length <= maxSize) {
          const ttl = Math.min(
            cacheCandidate.clientMaxAge,
            config.cache.maxTTL,
          );
          const responseHeaders = withCacheHeaders(
            result.response.headers,
            "MISS",
            ttl,
          );
          const headersObj: Record<string, string> = {};
          responseHeaders.forEach((value, key) => {
            headersObj[key] = value;
          });

          await cache.set(
            cacheKey,
            {
              body: responseBody,
              status: result.response.status,
              headers: headersObj,
              cachedAt: Date.now(),
              ttl,
            },
            ttl,
          );

          result.response = new Response(responseBody, {
            status: result.response.status,
            headers: responseHeaders,
          });
        }
      }

      void (async () => {
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
        if (
          error.message.includes("validation") ||
          error.message.includes("Invalid")
        ) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }

        if (
          error.name === "TimeoutError" ||
          error.message.includes("timeout")
        ) {
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
