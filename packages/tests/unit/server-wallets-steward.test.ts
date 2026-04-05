/**
 * Unit tests for dual-provider wallet routing (Privy ↔ Steward).
 *
 * Tests cover:
 *  1. Provisioning routing — flag off → Privy, flag on → Steward
 *  2. RPC routing — wallet_provider column determines which backend handles the call
 *  3. Schema validation — correct fields set/absent per provider
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

const dbClientModuleUrl = new URL("../../db/client.ts", import.meta.url).href;
const cacheClientModuleUrl = new URL("../../lib/cache/client.ts", import.meta.url).href;

// ---------------------------------------------------------------------------
// Steward mock setup
// ---------------------------------------------------------------------------

const mockStewardCreateWallet = mock();
const mockStewardGetAgent = mock();
const mockStewardSignTransaction = mock();
const mockStewardSignMessage = mock();
const mockStewardSignTypedData = mock();
const mockGetStewardClient = mock();
const mockGetStewardAgent = mock();
const mockGetStewardWalletInfo = mock();
const mockIsStewardAvailable = mock();

const mockStewardClient = {
  createWallet: mockStewardCreateWallet,
  getAgent: mockStewardGetAgent,
  signTransaction: mockStewardSignTransaction,
  signMessage: mockStewardSignMessage,
  signTypedData: mockStewardSignTypedData,
};

// ---------------------------------------------------------------------------
// Privy mock setup
// ---------------------------------------------------------------------------

const mockPrivyWalletCreate = mock();
const mockPrivyWalletRpc = mock();
const mockGetPrivyClient = mock();

// ---------------------------------------------------------------------------
// DB mock setup
// ---------------------------------------------------------------------------

const mockInsertReturning = mock();
const mockInsertValues = mock();
const mockDbInsert = mock();
const mockFindFirst = mock();

// ---------------------------------------------------------------------------
// Cache + viem mocks
// ---------------------------------------------------------------------------

const mockCacheSetIfNotExists = mock().mockResolvedValue(true);
const mockCacheGet = mock().mockResolvedValue(null);
const mockCacheGetWithSWR = mock(
  async (_key: string, _staleTTL: number, revalidate: () => Promise<unknown>) => await revalidate(),
);
const mockCacheSet = mock().mockResolvedValue(undefined);
const mockCacheIncr = mock().mockResolvedValue(0);
const mockCacheExpire = mock().mockResolvedValue(undefined);
const mockCacheGetAndDelete = mock().mockResolvedValue(null);
const mockCacheDel = mock().mockResolvedValue(undefined);
const mockCacheDelPattern = mock().mockResolvedValue(undefined);
const mockCacheMget = mock(async (keys: string[]) => keys.map(() => null));
const mockCacheIsAvailable = mock().mockReturnValue(true);
const mockVerifyMessage = mock();

// ---------------------------------------------------------------------------
// Feature-flag object — mutated per test to control routing
// ---------------------------------------------------------------------------

const mockWalletProviderFlags = {
  USE_STEWARD_FOR_NEW_WALLETS: false,
  ALLOW_PRIVY_MIGRATION: false,
  DISABLE_PRIVY_WALLETS: false,
};

// ---------------------------------------------------------------------------
// Module wiring — must run before any import of server-wallets
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const actualViem = await import("viem");
  const actualDbClient = await import(`${dbClientModuleUrl}?server-wallets-steward`);
  const actualCacheModule = await import(`${cacheClientModuleUrl}?server-wallets-steward`);

  // Wallet-provider feature flags (mutable object so per-test mutations work)
  mock.module("@/lib/config/wallet-provider-flags", () => ({
    WALLET_PROVIDER_FLAGS: mockWalletProviderFlags,
  }));

  // Steward SDK client
  mock.module("@/lib/services/steward-client", () => ({
    getStewardClient: mockGetStewardClient,
    getStewardAgent: mockGetStewardAgent,
    getStewardWalletInfo: mockGetStewardWalletInfo,
    isStewardAvailable: mockIsStewardAvailable,
  }));

  // Privy client
  mock.module("@/lib/auth/privy-client", () => ({
    getPrivyClient: mockGetPrivyClient,
    privyClient: mockGetPrivyClient,
    verifyAuthTokenCached: mock().mockResolvedValue(null),
    invalidatePrivyTokenCache: mock().mockResolvedValue(undefined),
    invalidateAllPrivyTokenCaches: mock().mockResolvedValue(undefined),
    getUserFromIdToken: mock().mockResolvedValue(null),
    getUserById: mock().mockResolvedValue(null),
  }));

  // DB client
  mock.module("@/db/client", () => ({
    ...actualDbClient,
    db: {
      insert: mockDbInsert,
      query: {
        agentServerWallets: {
          findFirst: mockFindFirst,
        },
      },
    },
  }));

  // viem — only replace verifyMessage
  mock.module("viem", () => ({
    ...actualViem,
    verifyMessage: mockVerifyMessage,
  }));

  // Cache — only replace setIfNotExists (nonce guard)
  mock.module("@/lib/cache/client", () => ({
    ...actualCacheModule,
    cache: {
      get: mockCacheGet,
      getWithSWR: mockCacheGetWithSWR,
      set: mockCacheSet,
      setIfNotExists: mockCacheSetIfNotExists,
      incr: mockCacheIncr,
      expire: mockCacheExpire,
      getAndDelete: mockCacheGetAndDelete,
      del: mockCacheDel,
      delPattern: mockCacheDelPattern,
      mget: mockCacheMget,
      isAvailable: mockCacheIsAvailable,
    },
  }));
});

afterAll(() => {
  mock.restore();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal RPC payload with a fresh timestamp to avoid expiry errors. */
function rpcPayload(method: string, params: unknown[], nonce: string) {
  return { method, params, timestamp: Date.now(), nonce };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dual-provider wallet routing", () => {
  beforeEach(() => {
    // Steward
    mockGetStewardClient.mockClear().mockReturnValue(mockStewardClient);
    mockStewardCreateWallet.mockClear();
    mockStewardGetAgent.mockClear();
    mockStewardSignTransaction.mockClear();
    mockStewardSignMessage.mockClear();
    mockStewardSignTypedData.mockClear();
    mockGetStewardAgent.mockClear().mockResolvedValue(null);
    mockGetStewardWalletInfo.mockClear().mockResolvedValue(null);
    mockIsStewardAvailable.mockClear().mockResolvedValue(true);

    // Privy
    mockGetPrivyClient.mockClear().mockReturnValue({
      walletApi: { create: mockPrivyWalletCreate, rpc: mockPrivyWalletRpc },
    });
    mockPrivyWalletCreate.mockClear();
    mockPrivyWalletRpc.mockClear();

    // DB
    mockInsertReturning.mockClear();
    mockInsertValues.mockClear().mockReturnValue({ returning: mockInsertReturning });
    mockDbInsert.mockClear().mockReturnValue({ values: mockInsertValues });
    mockFindFirst.mockClear();

    // Cache / viem
    mockCacheGet.mockClear().mockResolvedValue(null);
    mockCacheGetWithSWR
      .mockClear()
      .mockImplementation(
        async (_key: string, _staleTTL: number, revalidate: () => Promise<unknown>) =>
          await revalidate(),
      );
    mockCacheSet.mockClear().mockResolvedValue(undefined);
    mockCacheSetIfNotExists.mockClear().mockResolvedValue(true);
    mockCacheIncr.mockClear().mockResolvedValue(0);
    mockCacheExpire.mockClear().mockResolvedValue(undefined);
    mockCacheGetAndDelete.mockClear().mockResolvedValue(null);
    mockCacheDel.mockClear().mockResolvedValue(undefined);
    mockCacheDelPattern.mockClear().mockResolvedValue(undefined);
    mockCacheMget.mockClear().mockImplementation(async (keys: string[]) => keys.map(() => null));
    mockCacheIsAvailable.mockClear().mockReturnValue(true);
    mockVerifyMessage.mockClear();

    // Default: Privy mode
    mockWalletProviderFlags.USE_STEWARD_FOR_NEW_WALLETS = false;
    mockWalletProviderFlags.ALLOW_PRIVY_MIGRATION = false;
    mockWalletProviderFlags.DISABLE_PRIVY_WALLETS = false;
  });

  // =========================================================================
  // 1. Provisioning routing
  // =========================================================================

  describe("provisionServerWallet — routing", () => {
    it("calls Privy and never touches Steward when USE_STEWARD_FOR_NEW_WALLETS=false", async () => {
      mockWalletProviderFlags.USE_STEWARD_FOR_NEW_WALLETS = false;

      mockPrivyWalletCreate.mockResolvedValue({ id: "pw_privy1", address: "0xPrivy1" });
      mockInsertReturning.mockResolvedValue([
        {
          id: "rec-1",
          wallet_provider: "privy",
          privy_wallet_id: "pw_privy1",
          address: "0xPrivy1",
        },
      ]);

      const { provisionServerWallet } = await import("@/lib/services/server-wallets");

      await provisionServerWallet({
        organizationId: "org1",
        userId: "user1",
        characterId: "char1",
        clientAddress: "0xClient1",
        chainType: "evm",
      });

      expect(mockPrivyWalletCreate).toHaveBeenCalledWith({ chainType: "ethereum" });
      expect(mockStewardCreateWallet).not.toHaveBeenCalled();
      expect(mockGetStewardClient).not.toHaveBeenCalled();
    });

    it("calls Steward and never touches Privy when USE_STEWARD_FOR_NEW_WALLETS=true", async () => {
      mockWalletProviderFlags.USE_STEWARD_FOR_NEW_WALLETS = true;

      mockStewardCreateWallet.mockResolvedValue({
        id: "cloud-char2",
        walletAddress: "0xSteward2",
      });
      mockInsertReturning.mockResolvedValue([
        {
          id: "rec-2",
          wallet_provider: "steward",
          steward_agent_id: "cloud-char2",
          steward_tenant_id: "org-org2",
          address: "0xSteward2",
          privy_wallet_id: null,
        },
      ]);

      const { provisionServerWallet } = await import("@/lib/services/server-wallets");

      await provisionServerWallet({
        organizationId: "org2",
        userId: "user2",
        characterId: "char2",
        clientAddress: "0xClient2",
        chainType: "evm",
      });

      expect(mockGetStewardClient).toHaveBeenCalled();
      expect(mockStewardCreateWallet).toHaveBeenCalledWith(
        "cloud-char2",
        "Agent cloud-char2",
        "0xClient2",
      );
      expect(mockPrivyWalletCreate).not.toHaveBeenCalled();
      expect(mockGetPrivyClient).not.toHaveBeenCalled();
    });

    it("uses clientAddress as agent name when characterId is null (Steward mode)", async () => {
      mockWalletProviderFlags.USE_STEWARD_FOR_NEW_WALLETS = true;

      mockStewardCreateWallet.mockResolvedValue({
        id: "cloud-0xClient3",
        walletAddress: "0xSteward3",
      });
      mockInsertReturning.mockResolvedValue([
        {
          id: "rec-3",
          wallet_provider: "steward",
          steward_agent_id: "cloud-0xClient3",
          address: "0xSteward3",
          privy_wallet_id: null,
        },
      ]);

      const { provisionServerWallet } = await import("@/lib/services/server-wallets");

      await provisionServerWallet({
        organizationId: "org3",
        userId: "user3",
        characterId: null,
        clientAddress: "0xClient3",
        chainType: "evm",
      });

      expect(mockStewardCreateWallet).toHaveBeenCalledWith(
        "cloud-0xClient3",
        "Agent cloud-0xClient3",
        "0xClient3",
      );
    });

    it("throws if Steward returns no walletAddress", async () => {
      mockWalletProviderFlags.USE_STEWARD_FOR_NEW_WALLETS = true;

      mockStewardCreateWallet.mockResolvedValue({ id: "cloud-charX", walletAddress: null });

      const { provisionServerWallet } = await import("@/lib/services/server-wallets");

      await expect(
        provisionServerWallet({
          organizationId: "org4",
          userId: "user4",
          characterId: "charX",
          clientAddress: "0xClientX",
          chainType: "evm",
        }),
      ).rejects.toThrow("Steward did not return a wallet address");
    });

    it("reuses an existing Steward agent when createWallet returns a 409 conflict", async () => {
      mockWalletProviderFlags.USE_STEWARD_FOR_NEW_WALLETS = true;

      mockStewardCreateWallet.mockRejectedValue({
        name: "StewardApiError",
        status: 409,
        message: "Agent already exists",
      });
      mockStewardGetAgent.mockResolvedValue({
        id: "cloud-char-conflict",
        walletAddress: "0xExistingSteward",
      });
      mockInsertReturning.mockResolvedValue([
        {
          id: "rec-conflict",
          wallet_provider: "steward",
          steward_agent_id: "cloud-char-conflict",
          address: "0xExistingSteward",
          privy_wallet_id: null,
        },
      ]);

      const { provisionServerWallet } = await import("@/lib/services/server-wallets");

      const result = await provisionServerWallet({
        organizationId: "org-conflict",
        userId: "user-conflict",
        characterId: "char-conflict",
        clientAddress: "0xClientConflict",
        chainType: "evm",
      });

      expect(mockStewardGetAgent).toHaveBeenCalledWith("cloud-char-conflict");
      expect(result).toEqual(
        expect.objectContaining({
          id: "rec-conflict",
          steward_agent_id: "cloud-char-conflict",
          address: "0xExistingSteward",
        }),
      );
    });

    it("blocks new Privy wallet creation when DISABLE_PRIVY_WALLETS=true", async () => {
      mockWalletProviderFlags.USE_STEWARD_FOR_NEW_WALLETS = false;
      mockWalletProviderFlags.DISABLE_PRIVY_WALLETS = true;

      const { provisionServerWallet } = await import("@/lib/services/server-wallets");

      await expect(
        provisionServerWallet({
          organizationId: "org-disabled",
          userId: "user-disabled",
          characterId: "char-disabled",
          clientAddress: "0xClientDisabled",
          chainType: "evm",
        }),
      ).rejects.toThrow(/Privy wallet creation is disabled/);

      expect(mockPrivyWalletCreate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. Schema validation — correct fields per provider
  // =========================================================================

  describe("provisionServerWallet — schema validation", () => {
    it("Privy wallet insert: privy_wallet_id set, no steward_agent_id / steward_tenant_id", async () => {
      mockWalletProviderFlags.USE_STEWARD_FOR_NEW_WALLETS = false;

      mockPrivyWalletCreate.mockResolvedValue({ id: "pw_schema1", address: "0xAddr1" });
      mockInsertReturning.mockResolvedValue([{ id: "rec-s1" }]);

      const { provisionServerWallet } = await import("@/lib/services/server-wallets");

      await provisionServerWallet({
        organizationId: "org-s1",
        userId: "user-s1",
        characterId: "char-s1",
        clientAddress: "0xClientS1",
        chainType: "evm",
      });

      const insertedValues = mockInsertValues.mock.calls[0]?.[0] as Record<string, unknown>;

      expect(insertedValues).toBeDefined();
      expect(insertedValues.wallet_provider).toBe("privy");
      expect(insertedValues.privy_wallet_id).toBe("pw_schema1");
      // Steward fields must not be present
      expect(insertedValues.steward_agent_id).toBeUndefined();
      expect(insertedValues.steward_tenant_id).toBeUndefined();
    });

    it("Steward wallet insert: steward_agent_id + steward_tenant_id set, no privy_wallet_id", async () => {
      mockWalletProviderFlags.USE_STEWARD_FOR_NEW_WALLETS = true;

      mockStewardCreateWallet.mockResolvedValue({
        id: "cloud-char-s2",
        walletAddress: "0xAddrS2",
      });
      mockInsertReturning.mockResolvedValue([{ id: "rec-s2" }]);

      const { provisionServerWallet } = await import("@/lib/services/server-wallets");

      await provisionServerWallet({
        organizationId: "org-s2",
        userId: "user-s2",
        characterId: "char-s2",
        clientAddress: "0xClientS2",
        chainType: "evm",
      });

      const insertedValues = mockInsertValues.mock.calls[0]?.[0] as Record<string, unknown>;

      expect(insertedValues).toBeDefined();
      expect(insertedValues.wallet_provider).toBe("steward");
      expect(insertedValues.steward_agent_id).toBe("cloud-char-s2");
      expect(typeof insertedValues.steward_tenant_id).toBe("string");
      expect((insertedValues.steward_tenant_id as string).length).toBeGreaterThan(0);
      // Privy field must not be present
      expect(insertedValues.privy_wallet_id).toBeUndefined();
    });

    it("Steward wallet insert: steward_tenant_id falls back to org-<organizationId> when env var unset", async () => {
      mockWalletProviderFlags.USE_STEWARD_FOR_NEW_WALLETS = true;
      delete process.env.STEWARD_TENANT_ID;

      mockStewardCreateWallet.mockResolvedValue({
        id: "cloud-char-s3",
        walletAddress: "0xAddrS3",
      });
      mockInsertReturning.mockResolvedValue([{ id: "rec-s3" }]);

      const { provisionServerWallet } = await import("@/lib/services/server-wallets");

      await provisionServerWallet({
        organizationId: "org-s3",
        userId: "user-s3",
        characterId: "char-s3",
        clientAddress: "0xClientS3",
        chainType: "evm",
      });

      const insertedValues = mockInsertValues.mock.calls[0]?.[0] as Record<string, unknown>;

      expect(insertedValues.steward_tenant_id).toBe("org-org-s3");
    });
  });

  // =========================================================================
  // 3. RPC routing — wallet_provider drives dispatch
  // =========================================================================

  describe("executeServerWalletRpc — routing by wallet_provider", () => {
    it("routes to Privy RPC for a wallet record with wallet_provider='privy'", async () => {
      mockVerifyMessage.mockResolvedValue(true);
      mockFindFirst.mockResolvedValue({
        id: "rec-rpc-privy",
        wallet_provider: "privy",
        privy_wallet_id: "pw_rpc1",
        steward_agent_id: null,
      });
      mockPrivyWalletRpc.mockResolvedValue({ method: "eth_sendTransaction", data: "0xResult" });

      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      const payload = rpcPayload("eth_sendTransaction", [{ to: "0xDead" }], "nonce-rpc-privy-1");
      const result = await executeServerWalletRpc({
        clientAddress: "0xClientRpc1" as `0x${string}`,
        payload,
        signature: "0xSigRpc1" as `0x${string}`,
      });

      expect(mockPrivyWalletRpc).toHaveBeenCalledWith(
        expect.objectContaining({ walletId: "pw_rpc1", method: "eth_sendTransaction" }),
      );
      expect(mockStewardSignTransaction).not.toHaveBeenCalled();
      expect(result).toEqual({ method: "eth_sendTransaction", data: "0xResult" });
    });

    it("routes to Steward for a wallet record with wallet_provider='steward'", async () => {
      mockVerifyMessage.mockResolvedValue(true);
      mockFindFirst.mockResolvedValue({
        id: "rec-rpc-steward",
        wallet_provider: "steward",
        steward_agent_id: "cloud-char-rpc",
        privy_wallet_id: null,
      });
      mockStewardSignTransaction.mockResolvedValue({ txHash: "0xTxHash" });

      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      const payload = rpcPayload(
        "eth_sendTransaction",
        [{ to: "0xBeef", value: "0x1", data: "0x", chainId: 8453 }],
        "nonce-rpc-steward-1",
      );
      const result = await executeServerWalletRpc({
        clientAddress: "0xClientRpc2" as `0x${string}`,
        payload,
        signature: "0xSigRpc2" as `0x${string}`,
      });

      expect(mockStewardSignTransaction).toHaveBeenCalledWith(
        "cloud-char-rpc",
        expect.objectContaining({ to: "0xBeef", value: "0x1", data: "0x", chainId: 8453 }),
      );
      expect(mockPrivyWalletRpc).not.toHaveBeenCalled();
      expect(result).toEqual({ txHash: "0xTxHash" });
    });
  });

  // =========================================================================
  // 4. Steward RPC method dispatch
  // =========================================================================

  describe("executeServerWalletRpc — Steward method dispatch", () => {
    const stewardWalletRecord = {
      id: "rec-steward-rpc",
      wallet_provider: "steward",
      steward_agent_id: "cloud-agent-dispatch",
      privy_wallet_id: null,
    };

    beforeEach(() => {
      mockVerifyMessage.mockResolvedValue(true);
      mockFindFirst.mockResolvedValue(stewardWalletRecord);
    });

    it("dispatches eth_sendTransaction to steward.signTransaction", async () => {
      mockStewardSignTransaction.mockResolvedValue({ txHash: "0xTx1" });

      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      const payload = rpcPayload(
        "eth_sendTransaction",
        [{ to: "0xTo1", value: "0x64", data: "0xdata", chainId: 1 }],
        "nonce-dispatch-tx",
      );
      const result = await executeServerWalletRpc({
        clientAddress: "0xClientD1" as `0x${string}`,
        payload,
        signature: "0xSig" as `0x${string}`,
      });

      expect(mockStewardSignTransaction).toHaveBeenCalledWith("cloud-agent-dispatch", {
        to: "0xTo1",
        value: "0x64",
        data: "0xdata",
        chainId: 1,
      });
      expect(result).toEqual({ txHash: "0xTx1" });
    });

    it("dispatches eth_sendTransaction without forcing a hardcoded chainId", async () => {
      mockStewardSignTransaction.mockResolvedValue({ txHash: "0xTxBase" });

      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      const payload = rpcPayload(
        "eth_sendTransaction",
        [{ to: "0xTo2" }], // no chainId
        "nonce-dispatch-tx-base",
      );
      await executeServerWalletRpc({
        clientAddress: "0xClientD2" as `0x${string}`,
        payload,
        signature: "0xSig" as `0x${string}`,
      });

      const tx = mockStewardSignTransaction.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(tx).toEqual({
        to: "0xTo2",
        value: "0",
        data: undefined,
      });
      expect("chainId" in tx).toBe(false);
    });

    it("dispatches personal_sign to steward.signMessage", async () => {
      mockStewardSignMessage.mockResolvedValue({ signature: "0xPersonalSig" });

      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      const payload = rpcPayload("personal_sign", ["hello world"], "nonce-dispatch-sign");
      const result = await executeServerWalletRpc({
        clientAddress: "0xClientD3" as `0x${string}`,
        payload,
        signature: "0xSig" as `0x${string}`,
      });

      expect(mockStewardSignMessage).toHaveBeenCalledWith("cloud-agent-dispatch", "hello world");
      expect(result).toEqual({ signature: "0xPersonalSig" });
    });

    it("dispatches eth_signTypedData_v4 to steward.signTypedData", async () => {
      mockStewardSignTypedData.mockResolvedValue({ signature: "0xTypedSig" });

      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      const typedData = JSON.stringify({
        domain: { name: "TestDomain", chainId: 1 },
        types: { Mail: [{ name: "contents", type: "string" }] },
        primaryType: "Mail",
        message: { contents: "Hello" },
      });
      const payload = rpcPayload(
        "eth_signTypedData_v4",
        ["0xSignerAddr", typedData],
        "nonce-dispatch-typed",
      );
      const result = await executeServerWalletRpc({
        clientAddress: "0xClientD4" as `0x${string}`,
        payload,
        signature: "0xSig" as `0x${string}`,
      });

      expect(mockStewardSignTypedData).toHaveBeenCalledWith("cloud-agent-dispatch", {
        domain: { name: "TestDomain", chainId: 1 },
        types: { Mail: [{ name: "contents", type: "string" }] },
        primaryType: "Mail",
        value: { contents: "Hello" },
      });
      expect(result).toEqual({ signature: "0xTypedSig" });
    });

    it("accepts eth_signTypedData_v4 payloads that are already parsed objects", async () => {
      mockStewardSignTypedData.mockResolvedValue({ signature: "0xTypedSigObject" });

      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      const typedData = {
        domain: { name: "TestDomain", chainId: 8453 },
        types: { Permit: [{ name: "spender", type: "address" }] },
        primaryType: "Permit",
        message: { spender: "0xSpender" },
      };
      const payload = rpcPayload(
        "eth_signTypedData_v4",
        ["0xSignerAddr", typedData],
        "nonce-dispatch-typed-object",
      );
      const result = await executeServerWalletRpc({
        clientAddress: "0xClientD4Object" as `0x${string}`,
        payload,
        signature: "0xSig" as `0x${string}`,
      });

      expect(mockStewardSignTypedData).toHaveBeenCalledWith("cloud-agent-dispatch", {
        domain: { name: "TestDomain", chainId: 8453 },
        types: { Permit: [{ name: "spender", type: "address" }] },
        primaryType: "Permit",
        value: { spender: "0xSpender" },
      });
      expect(result).toEqual({ signature: "0xTypedSigObject" });
    });

    it("throws for unsupported RPC methods on Steward", async () => {
      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      const payload = rpcPayload("eth_getBalance", ["0xAddr", "latest"], "nonce-unsupported");
      await expect(
        executeServerWalletRpc({
          clientAddress: "0xClientD5" as `0x${string}`,
          payload,
          signature: "0xSig" as `0x${string}`,
        }),
      ).rejects.toThrow(/not supported via Steward/);
    });

    it("throws if steward wallet record has no steward_agent_id", async () => {
      mockFindFirst.mockResolvedValue({
        id: "rec-broken",
        wallet_provider: "steward",
        steward_agent_id: null,
        privy_wallet_id: null,
      });

      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      const payload = rpcPayload("personal_sign", ["msg"], "nonce-no-agent-id");
      await expect(
        executeServerWalletRpc({
          clientAddress: "0xClientBroken" as `0x${string}`,
          payload,
          signature: "0xSig" as `0x${string}`,
        }),
      ).rejects.toThrow(/steward_agent_id/);
    });
  });

  // =========================================================================
  // 5. Shared executeServerWalletRpc guards (signature / nonce / not-found)
  // =========================================================================

  describe("executeServerWalletRpc — guards", () => {
    it("throws InvalidRpcSignatureError when signature is invalid", async () => {
      mockVerifyMessage.mockResolvedValue(false);

      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      await expect(
        executeServerWalletRpc({
          clientAddress: "0xClientG1",
          payload: rpcPayload("eth_sendTransaction", [], "nonce-guard-sig"),
          signature: "0xBadSig" as `0x${string}`,
        }),
      ).rejects.toThrow("Invalid RPC signature");
    });

    it("throws ServerWalletNotFoundError when no wallet record exists", async () => {
      mockVerifyMessage.mockResolvedValue(true);
      mockFindFirst.mockResolvedValue(null);

      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      await expect(
        executeServerWalletRpc({
          clientAddress: "0xClientG2",
          payload: rpcPayload("eth_sendTransaction", [], "nonce-guard-notfound"),
          signature: "0xSig" as `0x${string}`,
        }),
      ).rejects.toThrow("Server wallet not found");
    });

    it("throws RpcReplayError when nonce has already been used", async () => {
      mockVerifyMessage.mockResolvedValue(true);
      mockCacheSetIfNotExists.mockResolvedValue(false); // nonce already set

      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      await expect(
        executeServerWalletRpc({
          clientAddress: "0xClientG3",
          payload: rpcPayload("eth_sendTransaction", [], "nonce-guard-replay"),
          signature: "0xSig" as `0x${string}`,
        }),
      ).rejects.toThrow("RPC nonce already used");
    });

    it("throws RpcRequestExpiredError when timestamp is too old", async () => {
      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      const stalePayload = {
        method: "eth_sendTransaction",
        params: [],
        timestamp: Date.now() - 6 * 60 * 1000, // 6 minutes ago
        nonce: "nonce-guard-expired",
      };

      await expect(
        executeServerWalletRpc({
          clientAddress: "0xClientG4",
          payload: stalePayload,
          signature: "0xSig" as `0x${string}`,
        }),
      ).rejects.toThrow("RPC request expired");
    });

    it("throws if privy wallet record has no privy_wallet_id", async () => {
      mockVerifyMessage.mockResolvedValue(true);
      mockFindFirst.mockResolvedValue({
        id: "rec-privy-broken",
        wallet_provider: "privy",
        privy_wallet_id: null,
        steward_agent_id: null,
      });

      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      await expect(
        executeServerWalletRpc({
          clientAddress: "0xClientG5",
          payload: rpcPayload("eth_sendTransaction", [], "nonce-privy-broken"),
          signature: "0xSig" as `0x${string}`,
        }),
      ).rejects.toThrow(/privy_wallet_id/);
    });
  });
});
