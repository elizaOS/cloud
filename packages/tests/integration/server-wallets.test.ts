import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

const mockGetPrivyClient = mock();
const mockSelectLimit = mock().mockResolvedValue([]);
const mockSelectWhere = mock().mockReturnValue({
  limit: mockSelectLimit,
});
const mockSelectFrom = mock().mockReturnValue({
  where: mockSelectWhere,
});
const mockSelectChain = mock().mockReturnValue({
  from: mockSelectFrom,
});
const mockDbInsert = mock();
const mockFindFirst = mock();
const mockVerifyMessage = mock();
const mockCacheSetIfNotExists = mock().mockResolvedValue(true);

beforeAll(async () => {
  const actualViem = await import("viem");
  const actualDbClient = await import("@/db/client");
  const actualCacheModule = await import("@/lib/cache/client");

  mock.module("@/lib/auth/privy-client", () => ({
    getPrivyClient: mockGetPrivyClient,
    privyClient: mockGetPrivyClient,
    verifyAuthTokenCached: mock().mockResolvedValue(null),
    invalidatePrivyTokenCache: mock().mockResolvedValue(undefined),
    invalidateAllPrivyTokenCaches: mock().mockResolvedValue(undefined),
    getUserFromIdToken: mock().mockResolvedValue(null),
    getUserById: mock().mockResolvedValue(null),
  }));

  mock.module("@/db/client", () => ({
    ...actualDbClient,
    db: {
      select: mockSelectChain,
      insert: mockDbInsert,
      query: {
        agentServerWallets: {
          findFirst: mockFindFirst,
        },
      },
    },
  }));

  mock.module("viem", () => ({
    ...actualViem,
    verifyMessage: mockVerifyMessage,
  }));

  mock.module("@/lib/cache/client", () => ({
    ...actualCacheModule,
    cache: {
      get: actualCacheModule.cache.get.bind(actualCacheModule.cache),
      getWithSWR: actualCacheModule.cache.getWithSWR.bind(actualCacheModule.cache),
      set: actualCacheModule.cache.set.bind(actualCacheModule.cache),
      setIfNotExists: mockCacheSetIfNotExists,
      incr: actualCacheModule.cache.incr.bind(actualCacheModule.cache),
      expire: actualCacheModule.cache.expire.bind(actualCacheModule.cache),
      getAndDelete: actualCacheModule.cache.getAndDelete.bind(actualCacheModule.cache),
      del: actualCacheModule.cache.del.bind(actualCacheModule.cache),
      delPattern: actualCacheModule.cache.delPattern.bind(actualCacheModule.cache),
      mget: actualCacheModule.cache.mget.bind(actualCacheModule.cache),
      isAvailable: actualCacheModule.cache.isAvailable.bind(actualCacheModule.cache),
    },
  }));
});

describe("server-wallets service", () => {
  beforeEach(() => {
    mockGetPrivyClient.mockClear();
    mockSelectLimit.mockClear().mockResolvedValue([]);
    mockSelectWhere.mockClear().mockReturnValue({
      limit: mockSelectLimit,
    });
    mockSelectFrom.mockClear().mockReturnValue({
      where: mockSelectWhere,
    });
    mockSelectChain.mockClear().mockReturnValue({
      from: mockSelectFrom,
    });
    mockDbInsert.mockClear();
    mockFindFirst.mockClear();
    mockVerifyMessage.mockClear();
    mockCacheSetIfNotExists.mockClear().mockResolvedValue(true);
  });

  afterAll(() => {
    mock.restore();
  });

  describe("provisionServerWallet", () => {
    it("should call privy to create wallet and insert to db", async () => {
      const { provisionServerWallet } = await import("@/lib/services/server-wallets");

      const mockCreate = mock().mockResolvedValue({
        id: "pw_123",
        address: "0xabc",
      });
      const mockInsertValues = mock().mockReturnValue({
        returning: mock().mockResolvedValue([{ id: 1, address: "0xabc" }]),
      });

      mockGetPrivyClient.mockReturnValue({
        walletApi: { create: mockCreate },
      });

      mockDbInsert.mockReturnValue({ values: mockInsertValues });

      const result = await provisionServerWallet({
        organizationId: "org1",
        userId: "user1",
        characterId: "char1",
        clientAddress: "0xClient",
        chainType: "evm",
      });

      expect(mockCreate).toHaveBeenCalledWith({ chainType: "ethereum" });
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: "org1",
          privy_wallet_id: "pw_123",
          address: "0xabc",
          chain_type: "evm",
          client_address: "0xClient",
        }),
      );
      expect(result).toEqual({ id: 1, address: "0xabc" });
    });
  });

  describe("executeServerWalletRpc", () => {
    it("should verify signature, lookup wallet, and proxy rpc", async () => {
      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      mockVerifyMessage.mockResolvedValue(true);
      mockFindFirst.mockResolvedValue({
        privy_wallet_id: "pw_123",
      });

      const mockRpc = mock().mockResolvedValue({
        method: "eth_sendTransaction",
        data: "0xres",
      });
      mockGetPrivyClient.mockReturnValue({
        walletApi: { rpc: mockRpc },
      });

      const payload = {
        method: "eth_sendTransaction",
        params: [{ to: "0xBeef" }],
        timestamp: Date.now(),
        nonce: "test-nonce-1",
      };
      const result = await executeServerWalletRpc({
        clientAddress: "0xClient" as `0x${string}`,
        payload,
        signature: "0xSig" as `0x${string}`,
      });

      expect(mockVerifyMessage).toHaveBeenCalledWith({
        address: "0xClient",
        message: JSON.stringify(payload),
        signature: "0xSig",
      });
      expect(mockFindFirst).toHaveBeenCalled();

      expect(mockRpc).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: "pw_123",
          method: "eth_sendTransaction",
        }),
      );

      expect(result).toEqual({ method: "eth_sendTransaction", data: "0xres" });
    });

    it("should throw if signature invalid", async () => {
      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      mockVerifyMessage.mockResolvedValue(false);

      await expect(
        executeServerWalletRpc({
          clientAddress: "0xClient",
          payload: {
            method: "eth_sendTransaction",
            params: [],
            timestamp: Date.now(),
            nonce: "n1",
          },
          signature: "0xSig" as `0x${string}`,
        }),
      ).rejects.toThrow("Invalid RPC signature");
    });

    it("should throw if wallet not found", async () => {
      const { executeServerWalletRpc } = await import("@/lib/services/server-wallets");

      mockVerifyMessage.mockResolvedValue(true);
      mockFindFirst.mockResolvedValue(null);

      await expect(
        executeServerWalletRpc({
          clientAddress: "0xClient",
          payload: {
            method: "eth_sendTransaction",
            params: [],
            timestamp: Date.now(),
            nonce: "n2",
          },
          signature: "0xSig" as `0x${string}`,
        }),
      ).rejects.toThrow("Server wallet not found");
    });
  });
});
