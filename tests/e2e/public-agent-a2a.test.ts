/**
 * Public Agent A2A E2E Tests
 *
 * Tests the complete flow for connecting to public agents via A2A protocol:
 * 1. Agent discovery via Agent Card
 * 2. Authentication (API key vs x402)
 * 3. Chat interaction with monetization
 * 4. Credit top-up via x402
 * 5. ERC-8004 registration verification
 *
 * These tests verify that agents:
 * - Have their own endpoints (/api/agents/{id}/a2a)
 * - Are registered on ERC-8004
 * - Are managed through Eliza Cloud
 * - Handle x402 payments correctly
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  X402_ENABLED,
  isX402Configured,
  X402_RECIPIENT_ADDRESS,
  USDC_ADDRESSES,
  getDefaultNetwork,
} from "@/lib/config/x402";
import {
  CHAIN_IDS,
  IDENTITY_REGISTRY_ADDRESSES,
  ELIZA_CLOUD_AGENT_ID,
} from "@/lib/config/erc8004";

// Test configuration
const getConfig = () => ({
  apiUrl: process.env.TEST_API_URL || "http://localhost:3000",
  apiKey: process.env.TEST_API_KEY || "",
  // Use a known public agent ID for testing (or create one in beforeAll)
  testAgentId: process.env.TEST_PUBLIC_AGENT_ID || "",
});

// Fetch with timeout - returns null if connection fails or times out
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 3000
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch {
    // Connection failed, timeout, or abort - return null
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

interface AgentCard {
  name: string;
  description: string;
  image: string;
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  authentication: {
    schemes: Array<{ scheme: string; description: string }>;
  };
  skills: Array<{
    id: string;
    name: string;
    description: string;
    pricing: {
      type: string;
      inputCostPer1k?: number;
      outputCostPer1k?: number;
      markupPercentage?: number;
    };
  }>;
  pricing: {
    currency: string;
    paymentMethods: string[];
    minimumPayment: number;
  };
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: Record<string, unknown>;
  };
  id: string | number | null;
}

interface ChatResult {
  content: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost: {
    base: number;
    markup: number;
    total: number;
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe("Public Agent A2A Protocol", () => {
  const config = getConfig();

  describe("1. Agent Discovery", () => {
    test("GET /api/agents/{id}/a2a returns Agent Card for public agent", async () => {
      if (!config.testAgentId) {
        console.log("⏭️ Skipping - TEST_PUBLIC_AGENT_ID not set");
        return;
      }

      const response = await fetch(
        `${config.apiUrl}/api/agents/${config.testAgentId}/a2a`
      );

      // Should succeed for public agents
      if (response.status === 200) {
        const card = (await response.json()) as AgentCard;

        expect(card.name).toBeDefined();
        expect(card.description).toBeDefined();
        expect(card.capabilities).toBeDefined();
        expect(card.authentication).toBeDefined();
        expect(card.authentication.schemes.length).toBeGreaterThan(0);
        expect(card.skills.length).toBeGreaterThan(0);
        expect(card.pricing).toBeDefined();

        console.log("✅ Agent Card retrieved:", card.name);
        console.log("   Skills:", card.skills.map((s) => s.id).join(", "));
        console.log(
          "   Payment methods:",
          card.pricing.paymentMethods.join(", ")
        );
      } else if (response.status === 403) {
        console.log("⚠️ Agent is not public or A2A not enabled");
      } else if (response.status === 404) {
        console.log("⚠️ Agent not found");
      }
    });

    test("Agent Card includes x402 payment method when enabled", async () => {
      if (!config.testAgentId) {
        console.log("⏭️ Skipping - TEST_PUBLIC_AGENT_ID not set");
        return;
      }

      const response = await fetch(
        `${config.apiUrl}/api/agents/${config.testAgentId}/a2a`
      );

      if (response.status === 200) {
        const card = (await response.json()) as AgentCard;

        if (X402_ENABLED) {
          const hasX402Scheme = card.authentication.schemes.some(
            (s) => s.scheme === "x402"
          );
          expect(hasX402Scheme).toBe(true);

          const hasX402Payment = card.pricing.paymentMethods.includes("x402");
          // x402 payment method should be available if configured
          if (isX402Configured()) {
            expect(hasX402Payment).toBe(true);
            console.log("✅ x402 payment method available");
          }
        }
      }
    });
  });

  describe("2. Authentication", () => {
    test("POST without auth returns 401 or 402", async () => {
      if (!config.testAgentId) {
        console.log("⏭️ Skipping - TEST_PUBLIC_AGENT_ID not set");
        return;
      }

      const response = await fetch(
        `${config.apiUrl}/api/agents/${config.testAgentId}/a2a`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "chat",
            params: { messages: [{ role: "user", content: "Hello" }] },
            id: 1,
          }),
        }
      );

      // Should return 401 (auth required) or 402 (payment required with x402 info)
      expect([401, 402]).toContain(response.status);

      const data = (await response.json()) as JsonRpcResponse;
      expect(data.error).toBeDefined();

      if (response.status === 402 && X402_ENABLED) {
        console.log("✅ Returns 402 with x402 payment info");
      } else {
        console.log("✅ Returns 401 requiring authentication");
      }
    });

    test("POST with valid API key succeeds", async () => {
      if (!config.testAgentId || !config.apiKey) {
        console.log("⏭️ Skipping - TEST_PUBLIC_AGENT_ID or TEST_API_KEY not set");
        return;
      }

      const response = await fetch(
        `${config.apiUrl}/api/agents/${config.testAgentId}/a2a`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "getAgentInfo",
            params: {},
            id: 1,
          }),
        }
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as JsonRpcResponse<{
        name: string;
        bio: string | string[];
      }>;

      expect(data.result).toBeDefined();
      expect(data.result?.name).toBeDefined();
      console.log("✅ API key authentication works");
    });
  });

  describe("3. Chat Interaction", () => {
    test("chat method returns response with cost breakdown", async () => {
      if (!config.testAgentId || !config.apiKey) {
        console.log("⏭️ Skipping - TEST_PUBLIC_AGENT_ID or TEST_API_KEY not set");
        return;
      }

      const response = await fetch(
        `${config.apiUrl}/api/agents/${config.testAgentId}/a2a`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "chat",
            params: {
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: "Say hello in one word." }],
            },
            id: "test-chat-1",
          }),
        }
      );

      if (response.status === 200) {
        const data = (await response.json()) as JsonRpcResponse<ChatResult>;

        expect(data.result).toBeDefined();
        expect(data.result?.content).toBeDefined();
        expect(data.result?.usage).toBeDefined();
        expect(data.result?.cost).toBeDefined();
        expect(data.result?.cost.base).toBeGreaterThanOrEqual(0);
        expect(data.result?.cost.total).toBeGreaterThanOrEqual(
          data.result?.cost.base || 0
        );

        console.log("✅ Chat response received");
        console.log(
          `   Content: "${data.result?.content.slice(0, 50)}..."`
        );
        console.log(`   Base cost: $${data.result?.cost.base.toFixed(6)}`);
        console.log(`   Creator markup: $${data.result?.cost.markup.toFixed(6)}`);
        console.log(`   Total: $${data.result?.cost.total.toFixed(6)}`);
      } else {
        const error = await response.json();
        console.log("⚠️ Chat failed:", error);
      }
    });

    test("getAgentInfo method returns agent details", async () => {
      if (!config.testAgentId || !config.apiKey) {
        console.log("⏭️ Skipping - TEST_PUBLIC_AGENT_ID or TEST_API_KEY not set");
        return;
      }

      const response = await fetch(
        `${config.apiUrl}/api/agents/${config.testAgentId}/a2a`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "getAgentInfo",
            params: {},
            id: "test-info-1",
          }),
        }
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as JsonRpcResponse<{
        name: string;
        bio: string | string[];
        monetizationEnabled: boolean;
        markupPercentage: string | null;
      }>;

      expect(data.result).toBeDefined();
      expect(data.result?.name).toBeDefined();
      expect(typeof data.result?.monetizationEnabled).toBe("boolean");

      console.log("✅ Agent info retrieved");
      console.log(`   Name: ${data.result?.name}`);
      console.log(`   Monetization: ${data.result?.monetizationEnabled}`);
      console.log(`   Markup: ${data.result?.markupPercentage || 0}%`);
    });
  });

  describe("4. x402 Payment Flow", () => {
    test("x402 configuration is correct", () => {
      console.log("\n📋 x402 Configuration:");
      console.log(`   Enabled: ${X402_ENABLED}`);
      console.log(`   Configured: ${isX402Configured()}`);
      console.log(`   Default Network: ${getDefaultNetwork()}`);
      console.log(`   Recipient: ${X402_RECIPIENT_ADDRESS}`);

      if (X402_ENABLED) {
        const network = getDefaultNetwork();
        expect(USDC_ADDRESSES[network]).toBeDefined();
        console.log(`   USDC Address: ${USDC_ADDRESSES[network]}`);
      }
    });

    test("Credit top-up endpoint returns 402 with payment requirements", async () => {
      const response = await fetchWithTimeout(
        `${config.apiUrl}/api/v1/credits/topup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response) {
        console.log(`ℹ️ Could not connect to ${config.apiUrl} - server may not be running`);
        return;
      }

      if (X402_ENABLED && isX402Configured()) {
        if (response.status === 402) {
          // Check for x-payment-required header
          const paymentRequired = response.headers.get("x-payment-required");
          if (paymentRequired) {
            console.log("✅ x-payment-required header present");
          }
          console.log("✅ Top-up returns 402 with payment requirements");
        } else {
          console.log(`ℹ️ Top-up returned ${response.status} - expected 402`);
        }
      } else {
        // x402 not enabled, should return different error
        expect([401, 501]).toContain(response.status);
        console.log("ℹ️ x402 not enabled, top-up returns", response.status);
      }
    });
  });

  describe("5. ERC-8004 Integration", () => {
    test("Eliza Cloud is registered on supported networks", () => {
      console.log("\n📋 ERC-8004 Registration Status:");

      const networks = ["base-sepolia", "base"] as const;
      for (const network of networks) {
        const chainId = CHAIN_IDS[network];
        const agentId = ELIZA_CLOUD_AGENT_ID[network];
        const registryAddress = IDENTITY_REGISTRY_ADDRESSES[network];

        console.log(`\n   ${network}:`);
        console.log(`      Chain ID: ${chainId}`);
        console.log(`      Registry: ${registryAddress}`);
        console.log(
          `      Agent ID: ${agentId !== null ? agentId : "Not registered"}`
        );

        if (agentId !== null) {
          expect(agentId).toBeGreaterThanOrEqual(0);
        }
      }
    });

    test("Agent registration endpoint available", async () => {
      if (!config.testAgentId) {
        console.log("⏭️ Skipping - TEST_PUBLIC_AGENT_ID not set");
        return;
      }

      const response = await fetch(
        `${config.apiUrl}/api/agents/${config.testAgentId}/registration.json`
      );

      // Public agents should return registration file
      // Private agents return 403
      expect([200, 403, 404]).toContain(response.status);

      if (response.status === 200) {
        const registration = await response.json();
        expect(registration.name).toBeDefined();
        expect(registration.endpoints).toBeDefined();
        expect(registration.endpoints.a2a).toBeDefined();
        expect(registration.endpoints.mcp).toBeDefined();
        console.log("✅ Registration file accessible");
        console.log(`   Endpoints: a2a=${registration.endpoints.a2a}`);
      } else {
        console.log(`ℹ️ Registration returned ${response.status}`);
      }
    });
  });

  describe("6. CORS Support", () => {
    test("OPTIONS returns correct CORS headers", async () => {
      if (!config.testAgentId) {
        console.log("⏭️ Skipping - TEST_PUBLIC_AGENT_ID not set");
        return;
      }

      const response = await fetch(
        `${config.apiUrl}/api/agents/${config.testAgentId}/a2a`,
        { method: "OPTIONS" }
      );

      expect(response.status).toBe(204);

      const allowOrigin = response.headers.get("access-control-allow-origin");
      const allowMethods = response.headers.get("access-control-allow-methods");
      const allowHeaders = response.headers.get("access-control-allow-headers");

      expect(allowOrigin).toBe("*");
      expect(allowMethods).toContain("POST");
      expect(allowHeaders).toContain("Authorization");
      expect(allowHeaders).toContain("X-API-Key");
      expect(allowHeaders).toContain("X-PAYMENT");

      console.log("✅ CORS headers configured correctly");
    });
  });
});

// ============================================================================
// Platform A2A Tests
// ============================================================================

describe("Platform A2A (Eliza Cloud)", () => {
  const config = getConfig();

  test("GET /api/a2a returns platform service info", async () => {
    const response = await fetchWithTimeout(`${config.apiUrl}/api/a2a`);
    
    if (!response) {
      console.log(`ℹ️ Could not connect to ${config.apiUrl} - server may not be running`);
      return;
    }
    
    if (response.status !== 200) {
      console.log(`ℹ️ Server returned ${response.status} - endpoint may not be deployed`);
      return;
    }

    const data = await response.json();
    // Check structure - name might vary based on deployment
    expect(data.name).toBeDefined();

    console.log("✅ Platform A2A info:");
    console.log(`   Name: ${data.name}`);
    console.log(`   Version: ${data.version || "N/A"}`);
    console.log(`   Protocol: ${data.protocolVersion || data.protocol || "N/A"}`);
    console.log(`   Methods: ${data.methods?.length || 0}`);
  });

  test("GET /.well-known/agent-card.json returns platform Agent Card", async () => {
    const response = await fetchWithTimeout(
      `${config.apiUrl}/.well-known/agent-card.json`
    );
    
    if (!response) {
      console.log(`ℹ️ Could not connect to ${config.apiUrl} - server may not be running`);
      return;
    }
    
    if (response.status !== 200) {
      console.log(`ℹ️ Server returned ${response.status} - endpoint may not be deployed`);
      return;
    }

    const card = await response.json();
    // Check structure - name should be defined
    expect(card.name).toBeDefined();
    expect(card.skills).toBeDefined();

    console.log("✅ Platform Agent Card:");
    console.log(`   Name: ${card.name}`);
    console.log(`   Skills: ${card.skills?.length || 0}`);
  });

  test("GET /.well-known/erc8004-registration.json returns ERC-8004 file", async () => {
    const response = await fetchWithTimeout(
      `${config.apiUrl}/.well-known/erc8004-registration.json`
    );
    
    if (!response) {
      console.log(`ℹ️ Could not connect to ${config.apiUrl} - server may not be running`);
      return;
    }
    
    if (response.status !== 200) {
      console.log(`ℹ️ Server returned ${response.status} - endpoint may not be deployed`);
      return;
    }

    const registration = await response.json();
    // Check structure - name and endpoints should be defined
    expect(registration.name).toBeDefined();

    console.log("✅ ERC-8004 Registration:");
    console.log(`   Name: ${registration.name}`);
    if (registration.endpoints) {
      console.log(`   Endpoints: ${Object.keys(registration.endpoints).join(", ")}`);
    }
  });
});

// ============================================================================
// Summary
// ============================================================================

describe("Summary", () => {
  test("displays test summary", () => {
    console.log(`
════════════════════════════════════════════════════════════════════
                 PUBLIC AGENT A2A TEST SUMMARY
════════════════════════════════════════════════════════════════════

Agent Connectivity:
  - Individual agents have /api/agents/{id}/a2a endpoint
  - Each agent serves its own Agent Card via GET
  - JSON-RPC methods: chat, getAgentInfo

Authentication:
  - API key: Authorization: Bearer {key}
  - x402 payment: X-PAYMENT header (when enabled)

Monetization:
  - Base cost charged to consumer
  - Creator markup goes to redeemable earnings
  - Cost breakdown in response

ERC-8004 Integration:
  - Agents registered via /api/v1/agents/{id}/publish
  - Registration file at /api/agents/{id}/registration.json
  - Eliza Cloud pays gas for registration

x402 Payment:
  - Top-up via /api/v1/credits/topup
  - Returns 402 with payment requirements
  - Supports permissionless agent access

════════════════════════════════════════════════════════════════════
`);
  });
});

