import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const mockCreateClient = mock();
const mockUpstashRedis = mock();

mock.module("redis", () => ({
  createClient: mockCreateClient,
}));

mock.module("@upstash/redis", () => ({
  Redis: mockUpstashRedis,
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

describe("CacheClient native Redis support", () => {
  const mockConnect = mock();
  const mockOn = mock();
  const mockGet = mock();
  const mockSetEx = mock();
  const mockSet = mock();
  const mockDel = mock();
  const mockIncr = mock();
  const mockExpire = mock();
  const mockGetDel = mock();
  const mockScan = mock();
  const mockMGet = mock();

  beforeEach(() => {
    process.env.CACHE_ENABLED = "true";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.KV_URL = "redis://localhost:6379";
    process.env.KV_REST_API_URL = "https://your-redis.upstash.io";
    process.env.KV_REST_API_TOKEN = "your_upstash_token_here";

    mockCreateClient.mockReset();
    mockUpstashRedis.mockReset();
    mockConnect.mockReset().mockResolvedValue(undefined);
    mockOn.mockReset();
    mockGet.mockReset().mockResolvedValue('{"ok":true}');
    mockSetEx.mockReset().mockResolvedValue("OK");
    mockSet.mockReset().mockResolvedValue("OK");
    mockDel.mockReset().mockResolvedValue(1);
    mockIncr.mockReset().mockResolvedValue(1);
    mockExpire.mockReset().mockResolvedValue(1);
    mockGetDel.mockReset().mockResolvedValue(null);
    mockScan.mockReset().mockResolvedValue({ cursor: 0, keys: [] });
    mockMGet.mockReset().mockResolvedValue([]);

    mockCreateClient.mockReturnValue({
      on: mockOn,
      connect: mockConnect,
      get: mockGet,
      setEx: mockSetEx,
      set: mockSet,
      del: mockDel,
      incr: mockIncr,
      expire: mockExpire,
      getDel: mockGetDel,
      scan: mockScan,
      mGet: mockMGet,
    });
  });

  afterAll(() => {
    delete process.env.CACHE_ENABLED;
    delete process.env.REDIS_URL;
    delete process.env.KV_URL;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    mock.restore();
  });

  test("prefers native REDIS_URL over placeholder Upstash REST vars", async () => {
    const { CacheClient } = await import("@/lib/cache/client");
    const client = new CacheClient();

    expect(client.isAvailable()).toBe(true);

    await client.set("cache:test:key", { ok: true }, 60);
    const value = await client.get<{ ok: boolean }>("cache:test:key");

    expect(mockCreateClient).toHaveBeenCalledWith({
      url: "redis://localhost:6379",
    });
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockSetEx).toHaveBeenCalledWith("cache:test:key", 60, '{"ok":true}');
    expect(value).toEqual({ ok: true });
    expect(mockUpstashRedis).not.toHaveBeenCalled();
  });
});
