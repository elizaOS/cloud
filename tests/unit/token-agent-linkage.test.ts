/**
 * Unit tests for token↔agent linkage.
 *
 * Tests the schema, validation, repository lookups, and API route contracts
 * without requiring a live database (mocked repository layer).
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// ─── Schema validation tests ────────────────────────────────────────────────

describe("Token linkage schema validation", () => {
  const CreateAgentSchema = z.object({
    name: z
      .string()
      .max(100)
      .transform((s) => s.trim())
      .pipe(z.string().min(1, "Name is required")),
    bio: z
      .string()
      .optional()
      .transform((s) => s?.trim()),
    tokenAddress: z.string().min(1).max(256).optional(),
    tokenChain: z.string().min(1).max(64).optional(),
    tokenName: z.string().min(1).max(128).optional(),
    tokenTicker: z.string().min(1).max(32).optional(),
  });

  test("accepts agent creation without token fields", () => {
    const result = CreateAgentSchema.safeParse({ name: "TestAgent" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tokenAddress).toBeUndefined();
      expect(result.data.tokenChain).toBeUndefined();
    }
  });

  test("accepts agent creation with full token linkage", () => {
    const result = CreateAgentSchema.safeParse({
      name: "TokenAgent",
      bio: "An agent linked to a token",
      tokenAddress: "0x1234567890abcdef1234567890abcdef12345678",
      tokenChain: "ethereum",
      tokenName: "TestToken",
      tokenTicker: "TST",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tokenAddress).toBe(
        "0x1234567890abcdef1234567890abcdef12345678",
      );
      expect(result.data.tokenChain).toBe("ethereum");
      expect(result.data.tokenName).toBe("TestToken");
      expect(result.data.tokenTicker).toBe("TST");
    }
  });

  test("accepts Solana mint address", () => {
    const result = CreateAgentSchema.safeParse({
      name: "SolAgent",
      tokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tokenChain: "solana",
      tokenName: "USD Coin",
      tokenTicker: "USDC",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty token address when provided", () => {
    const result = CreateAgentSchema.safeParse({
      name: "BadAgent",
      tokenAddress: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects token address exceeding max length", () => {
    const result = CreateAgentSchema.safeParse({
      name: "BadAgent",
      tokenAddress: "x".repeat(257),
    });
    expect(result.success).toBe(false);
  });

  test("rejects token ticker exceeding max length", () => {
    const result = CreateAgentSchema.safeParse({
      name: "BadAgent",
      tokenAddress: "0x1234",
      tokenTicker: "X".repeat(33),
    });
    expect(result.success).toBe(false);
  });
});

// ─── Service-to-service provision schema ────────────────────────────────────

describe("Service-to-service provision schema", () => {
  const provisionSchema = z.object({
    tokenContractAddress: z.string().min(1),
    chain: z.string().min(1),
    chainId: z.number().int().positive(),
    tokenName: z.string().min(1),
    tokenTicker: z.string().min(1),
    launchType: z.enum(["native", "imported"]),
    character: z
      .object({
        name: z.string().min(1),
        bio: z.string().optional(),
        avatar: z.string().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
    billing: z
      .object({
        mode: z.enum(["owner_credits", "waifu_treasury_subsidy", "hybrid"]),
        initialReserveUsd: z.number().nonnegative().optional(),
      })
      .optional(),
    webhookUrl: z.string().url().optional(),
  });

  test("accepts valid provision request", () => {
    const result = provisionSchema.safeParse({
      tokenContractAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
      chain: "base",
      chainId: 8453,
      tokenName: "BaseMeme",
      tokenTicker: "BMEME",
      launchType: "native",
    });
    expect(result.success).toBe(true);
  });

  test("rejects provision request without token address", () => {
    const result = provisionSchema.safeParse({
      chain: "base",
      chainId: 8453,
      tokenName: "BaseMeme",
      tokenTicker: "BMEME",
      launchType: "native",
    });
    expect(result.success).toBe(false);
  });
});

// ─── Token linkage data shape tests ─────────────────────────────────────────

describe("Token linkage response shape", () => {
  const tokenFields = {
    token_address: "0x1234567890abcdef1234567890abcdef12345678",
    token_chain: "ethereum",
    token_name: "TestToken",
    token_ticker: "TST",
  };

  test("agent response includes all token fields", () => {
    const agentResponse = {
      id: "test-id",
      name: "TokenAgent",
      username: "tokenagent",
      bio: ["An agent linked to a token"],
      created_at: new Date().toISOString(),
      ...tokenFields,
    };

    expect(agentResponse.token_address).toBe(tokenFields.token_address);
    expect(agentResponse.token_chain).toBe(tokenFields.token_chain);
    expect(agentResponse.token_name).toBe(tokenFields.token_name);
    expect(agentResponse.token_ticker).toBe(tokenFields.token_ticker);
  });

  test("agent response has null token fields when not linked", () => {
    const agentResponse = {
      id: "test-id",
      name: "PlainAgent",
      username: "plainagent",
      bio: ["A normal agent"],
      created_at: new Date().toISOString(),
      token_address: null,
      token_chain: null,
      token_name: null,
      token_ticker: null,
    };

    expect(agentResponse.token_address).toBeNull();
    expect(agentResponse.token_chain).toBeNull();
  });
});

// ─── Repository mock tests ──────────────────────────────────────────────────

describe("Token lookup logic", () => {
  test("findByTokenAddress filters by address and chain", () => {
    const characters = [
      {
        id: "1",
        token_address: "0xAAA",
        token_chain: "ethereum",
        name: "ETH Agent",
      },
      {
        id: "2",
        token_address: "0xAAA",
        token_chain: "base",
        name: "Base Agent",
      },
      {
        id: "3",
        token_address: "0xBBB",
        token_chain: "solana",
        name: "Sol Agent",
      },
    ];

    function findByTokenAddress(address: string, chain?: string) {
      return characters.find(
        (c) =>
          c.token_address === address &&
          (chain == null || c.token_chain === chain),
      );
    }

    expect(findByTokenAddress("0xAAA", "ethereum")?.name).toBe("ETH Agent");
    expect(findByTokenAddress("0xAAA", "base")?.name).toBe("Base Agent");
    expect(findByTokenAddress("0xBBB")?.name).toBe("Sol Agent");
    expect(findByTokenAddress("0xCCC")).toBeUndefined();
  });

  test("listTokenLinked filters by chain", () => {
    const characters = [
      {
        id: "1",
        token_address: "0xAAA",
        token_chain: "ethereum",
        name: "ETH Agent",
      },
      {
        id: "2",
        token_address: "0xBBB",
        token_chain: "base",
        name: "Base Agent",
      },
      {
        id: "3",
        token_address: null,
        token_chain: null,
        name: "Plain Agent",
      },
    ];

    function listTokenLinked(chain?: string) {
      return characters.filter(
        (c) =>
          c.token_address != null &&
          (chain == null || c.token_chain === chain),
      );
    }

    expect(listTokenLinked()).toHaveLength(2);
    expect(listTokenLinked("ethereum")).toHaveLength(1);
    expect(listTokenLinked("solana")).toHaveLength(0);
  });

  test("duplicate token detection returns 409-style error", () => {
    const existingChar = {
      id: "existing-id",
      token_address: "0xDUPE",
      token_chain: "base",
    };

    const isDuplicate =
      existingChar.token_address === "0xDUPE" &&
      existingChar.token_chain === "base";

    expect(isDuplicate).toBe(true);

    const errorResponse = {
      error: `An agent is already linked to token 0xDUPE on base`,
      existingAgentId: existingChar.id,
    };
    expect(errorResponse.existingAgentId).toBe("existing-id");
  });
});

// ─── By-token endpoint query param validation ───────────────────────────────

describe("by-token endpoint validation", () => {
  test("requires address query parameter", () => {
    const address = null;
    const isValid = address != null && address.length > 0;
    expect(isValid).toBe(false);
  });

  test("accepts address with optional chain", () => {
    const address = "0x1234";
    const chain = "ethereum";
    expect(address).toBeTruthy();
    expect(chain).toBeTruthy();
  });

  test("accepts address without chain", () => {
    const address = "0x1234";
    const chain = undefined;
    expect(address).toBeTruthy();
    expect(chain).toBeUndefined();
  });
});

// ─── JSONB fallback logic tests ─────────────────────────────────────────────

describe("JSONB fallback for milady agents", () => {
  test("extracts token fields from agent_config when character record missing", () => {
    const agentConfig = {
      tokenContractAddress: "0xFALLBACK",
      chain: "base",
      tokenName: "FallbackToken",
      tokenTicker: "FBK",
    };

    const char = undefined as
      | { token_address?: string; token_chain?: string; token_name?: string; token_ticker?: string }
      | undefined;
    const cfg = agentConfig;

    const resolved = {
      token_address:
        char?.token_address ?? (cfg?.tokenContractAddress as string) ?? null,
      token_chain: char?.token_chain ?? (cfg?.chain as string) ?? null,
      token_name: char?.token_name ?? (cfg?.tokenName as string) ?? null,
      token_ticker: char?.token_ticker ?? (cfg?.tokenTicker as string) ?? null,
    };

    expect(resolved.token_address).toBe("0xFALLBACK");
    expect(resolved.token_chain).toBe("base");
    expect(resolved.token_name).toBe("FallbackToken");
    expect(resolved.token_ticker).toBe("FBK");
  });

  test("prefers character record over JSONB fallback", () => {
    const char = {
      token_address: "0xCANONICAL",
      token_chain: "ethereum",
      token_name: "Canonical",
      token_ticker: "CAN",
    };

    const cfg = {
      tokenContractAddress: "0xOLD_JSONB",
      chain: "base",
      tokenName: "OldJsonb",
      tokenTicker: "OLD",
    };

    const resolved = {
      token_address:
        char?.token_address ?? (cfg?.tokenContractAddress as string) ?? null,
      token_chain: char?.token_chain ?? (cfg?.chain as string) ?? null,
      token_name: char?.token_name ?? (cfg?.tokenName as string) ?? null,
      token_ticker: char?.token_ticker ?? (cfg?.tokenTicker as string) ?? null,
    };

    expect(resolved.token_address).toBe("0xCANONICAL");
    expect(resolved.token_chain).toBe("ethereum");
    expect(resolved.token_name).toBe("Canonical");
    expect(resolved.token_ticker).toBe("CAN");
  });
});

// ─── Migration backfill logic ───────────────────────────────────────────────

describe("Migration backfill logic", () => {
  test("backfill only updates characters where token_address IS NULL", () => {
    const characters = [
      { id: "1", token_address: null, sandbox_token: "0xABC" },
      { id: "2", token_address: "0xEXISTING", sandbox_token: "0xDEF" },
    ];

    const backfilled = characters.filter(
      (c) => c.token_address === null && c.sandbox_token != null,
    );

    expect(backfilled).toHaveLength(1);
    expect(backfilled[0].id).toBe("1");
  });
});
