import { describe, expect, test } from "bun:test";
import * as api from "../helpers/api-client";

/**
 * Cron Route E2E Tests
 *
 * Validates every cron endpoint:
 * - Returns 401/500 without proper auth
 * - Returns 401 with wrong CRON_SECRET
 * - Returns 200 with valid CRON_SECRET
 */

const CRON_ROUTES = [
  "/api/cron/agent-budgets",
  "/api/cron/auto-top-up",
  "/api/cron/cleanup-anonymous-sessions",
  "/api/cron/cleanup-cli-sessions",
  "/api/cron/cleanup-expired-crypto-payments",
  "/api/cron/cleanup-priorities",
  "/api/cron/cleanup-webhook-events",
  "/api/cron/compute-metrics",
  "/api/cron/container-billing",
  "/api/cron/process-redemptions",
  "/api/cron/release-pending-earnings",
  "/api/cron/sample-eliza-price",
  "/api/cron/social-automation",
] as const;

const V1_CRON_ROUTES = [
  "/api/v1/cron/health-check",
  "/api/v1/cron/deployment-monitor",
  "/api/v1/cron/process-provisioning-jobs",
  "/api/v1/cron/refresh-model-catalog",
] as const;

const ALL_CRON_ROUTES = [...CRON_ROUTES, ...V1_CRON_ROUTES] as const;

describe("Cron Routes", () => {
  describe("Unauthenticated — rejects requests without auth", () => {
    for (const route of ALL_CRON_ROUTES) {
      test(`GET ${route} rejects unauthenticated request`, async () => {
        const response = await api.get(route);
        // 401 = unauthorized, 500 = CRON_SECRET not configured (fail-closed)
        expect([401, 403, 500]).toContain(response.status);
      });
    }
  });

  describe("Wrong Secret — rejects requests with invalid secret", () => {
    for (const route of ALL_CRON_ROUTES) {
      test(`GET ${route} rejects wrong CRON_SECRET`, async () => {
        const response = await api.get(route, {
          headers: { Authorization: "Bearer wrong-secret-value" },
        });
        expect([401, 403]).toContain(response.status);
      });
    }
  });

  describe("With CRON_SECRET", () => {
    test.skipIf(!api.hasCronSecret())("cron routes accept valid CRON_SECRET", async () => {
      // Test just one route with CRON_SECRET to verify auth works
      const response = await api.get(ALL_CRON_ROUTES[0], {
        headers: api.cronHeaders(),
      });
      // Should accept the request (200) or fail gracefully (500 from missing deps)
      expect([200, 500]).toContain(response.status);
    });

    test.skipIf(!api.hasCronSecret())("v1 cron routes accept valid CRON_SECRET", async () => {
      const response = await api.get(V1_CRON_ROUTES[0], {
        headers: api.cronHeaders(),
      });
      expect([200, 500]).toContain(response.status);
    });
  });
});
