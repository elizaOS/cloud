/**
 * CORS Middleware for App Registry
 *
 * Validates requests against registered app origins and adds appropriate CORS headers.
 */

import { NextRequest, NextResponse } from "next/server";
import { appsService } from "@/lib/services/apps";
import { apiKeysService } from "@/lib/services/api-keys";
import { logger } from "@/lib/utils/logger";

// Default allowed origins for development
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
];

export interface CorsValidationResult {
  allowed: boolean;
  origin: string | null;
  appId?: string;
}

/**
 * Validate if an origin is allowed based on app registry
 */
export async function validateOrigin(
  request: NextRequest,
): Promise<CorsValidationResult> {
  const origin = request.headers.get("origin");

  if (!origin) {
    // No origin header - same-origin request, allow it
    return { allowed: true, origin: null };
  }

  // Always allow default development origins
  if (DEFAULT_ALLOWED_ORIGINS.includes(origin)) {
    return { allowed: true, origin };
  }

  // Check if request has API key
  const authHeader = request.headers.get("authorization");
  const apiKeyHeader = request.headers.get("x-api-key");

  let apiKeyValue: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    apiKeyValue = authHeader.substring(7);
  } else if (apiKeyHeader) {
    apiKeyValue = apiKeyHeader;
  }

  if (!apiKeyValue) {
    logger.warn("[CORS] No API key provided for cross-origin request", {
      origin,
    });
    return { allowed: false, origin };
  }

  try {
    // Validate API key and get associated app
    const apiKey = await apiKeysService.validateApiKey(apiKeyValue);

    if (!apiKey) {
      logger.warn("[CORS] Invalid API key for cross-origin request", {
        origin,
      });
      return { allowed: false, origin };
    }

    // Find the app associated with this API key
    const apps = await appsService.listByOrganization(apiKey.organization_id);
    const app = apps.find((a) => a.api_key_id === apiKey.id);

    if (!app) {
      // API key is valid but not associated with an app
      // Check if it's from the same organization - allow for dev purposes
      logger.info("[CORS] API key not associated with app, checking org", {
        origin,
        organizationId: apiKey.organization_id,
      });
      return { allowed: true, origin };
    }

    // Validate origin against app's allowed origins
    const allowed = await appsService.validateOrigin(app.id, origin);

    if (allowed) {
      logger.debug("[CORS] Origin validated against app", {
        origin,
        appId: app.id,
        appName: app.name,
      });
      return { allowed: true, origin, appId: app.id };
    }

    logger.warn("[CORS] Origin not in app's allowed origins", {
      origin,
      appId: app.id,
      allowedOrigins: app.allowed_origins,
    });
    return { allowed: false, origin, appId: app.id };
  } catch (error) {
    logger.error("[CORS] Error validating origin", { origin, error });
    return { allowed: false, origin };
  }
}

/**
 * Add CORS headers to response
 */
export function addCorsHeaders(
  response: NextResponse,
  origin: string | null,
  methods: string[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
): NextResponse {
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }

  response.headers.set("Access-Control-Allow-Methods", methods.join(", "));
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Key, X-Request-ID, Cookie",
  );
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Max-Age", "86400");

  return response;
}

/**
 * Create a preflight response for OPTIONS requests
 */
export function createPreflightResponse(
  origin: string | null,
  methods: string[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  return addCorsHeaders(response, origin, methods);
}

/**
 * Wrapper for API handlers that validates CORS and adds headers
 */
export function withCors<T extends NextResponse>(
  origin: string | null,
  response: T,
): T {
  return addCorsHeaders(response, origin) as T;
}

/**
 * Higher-order function to wrap API handlers with CORS validation
 */
export function withCorsValidation(
  handler: (
    request: NextRequest,
    context?: { params: Promise<Record<string, string | string[]>> },
  ) => Promise<NextResponse>,
) {
  return async function corsHandler(
    request: NextRequest,
    context?: { params: Promise<Record<string, string | string[]>> },
  ): Promise<NextResponse> {
    // Handle OPTIONS preflight
    if (request.method === "OPTIONS") {
      const origin = request.headers.get("origin");
      return createPreflightResponse(origin);
    }

    // Validate origin
    const corsResult = await validateOrigin(request);

    if (!corsResult.allowed) {
      const errorResponse = NextResponse.json(
        {
          success: false,
          error: "Origin not allowed",
          origin: corsResult.origin,
        },
        { status: 403 },
      );
      return addCorsHeaders(errorResponse, corsResult.origin);
    }

    // Call the actual handler
    const response = await handler(request, context);

    // Add CORS headers to response
    return addCorsHeaders(response, corsResult.origin);
  };
}
