/**
 * OIDC Health Check Endpoint
 *
 * Provides proactive monitoring for Vercel AI Gateway OIDC availability.
 * Use this endpoint for:
 * - Health checks in monitoring systems
 * - Pre-flight checks before heavy operations
 * - Debugging OIDC token issues
 *
 * Returns detailed status about AI provider availability.
 */

import { NextRequest } from "next/server";
import { gateway } from "@ai-sdk/gateway";
import { logger } from "@/lib/utils/logger";
import {
    getGatewayHealth,
    type GatewayHealthStatus,
} from "@/lib/providers/ai-gateway-fallback";
import {
    getCircuitBreakerStats,
    classifyError,
} from "@/lib/utils/retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HealthCheckResponse {
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: string;
    gateway: {
        oidc: "available" | "unavailable" | "unknown";
        lastError?: string;
    };
    fallback: {
        available: boolean;
        providers: string[];
    };
    circuitBreakers: Record<
        string,
        { isOpen: boolean; failures: number }
    >;
    details: GatewayHealthStatus;
}

/**
 * GET /api/health/oidc
 *
 * Performs a lightweight health check of the AI Gateway and OIDC token.
 * Does not make actual model calls to avoid costs.
 */
export async function GET(req: NextRequest): Promise<Response> {
    const startTime = Date.now();

    try {
        const gatewayHealth = getGatewayHealth();
        const circuitStats = getCircuitBreakerStats();

        // Convert circuit breaker stats to plain object
        const circuitBreakers: Record<string, { isOpen: boolean; failures: number }> = {};
        for (const [name, stats] of circuitStats) {
            circuitBreakers[name] = {
                isOpen: stats.isOpen,
                failures: stats.failures,
            };
        }

        // Determine OIDC status
        let oidcStatus: "available" | "unavailable" | "unknown" = "unknown";
        let lastError: string | undefined;

        if (gatewayHealth.circuitBreakerOpen) {
            oidcStatus = "unavailable";
            lastError = "Circuit breaker is open due to repeated failures";
        } else if (gatewayHealth.oidcAvailable) {
            // Try a lightweight gateway check
            try {
                // Just create the model object - this validates OIDC without making API calls
                // The actual validation happens on first use, but model creation can still fail
                // if there are immediate configuration issues
                gateway.languageModel("openai/gpt-4o-mini");
                oidcStatus = "available";
            } catch (error) {
                const classified = classifyError(error);
                oidcStatus = classified.isOIDCError ? "unavailable" : "unknown";
                lastError = error instanceof Error ? error.message : String(error);

                logger.warn("[OIDC Health] Gateway check failed", {
                    error: lastError,
                    isOIDCError: classified.isOIDCError,
                });
            }
        } else {
            oidcStatus = "unavailable";
            lastError = "OIDC token not available in environment";
        }

        // Determine overall health status
        let status: "healthy" | "degraded" | "unhealthy";
        if (oidcStatus === "available") {
            status = "healthy";
        } else if (gatewayHealth.fallbackAvailable) {
            status = "degraded"; // OIDC unavailable but fallback works
        } else {
            status = "unhealthy"; // No AI providers available
        }

        const response: HealthCheckResponse = {
            status,
            timestamp: new Date().toISOString(),
            gateway: {
                oidc: oidcStatus,
                ...(lastError && { lastError }),
            },
            fallback: {
                available: gatewayHealth.fallbackAvailable,
                providers: gatewayHealth.availableProviders,
            },
            circuitBreakers,
            details: gatewayHealth,
        };

        logger.debug("[OIDC Health] Check completed", {
            status,
            durationMs: Date.now() - startTime,
        });

        // Return appropriate HTTP status
        const httpStatus = status === "unhealthy" ? 503 : 200;

        return Response.json(response, {
            status: httpStatus,
            headers: {
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "X-Health-Status": status,
            },
        });
    } catch (error) {
        logger.error("[OIDC Health] Health check failed", {
            error: error instanceof Error ? error.message : String(error),
        });

        return Response.json(
            {
                status: "unhealthy",
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : "Health check failed",
            },
            { status: 503 },
        );
    }
}
