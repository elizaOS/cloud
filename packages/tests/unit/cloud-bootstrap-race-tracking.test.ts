import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockCacheGet = mock();
const mockCacheSet = mock();
const mockCacheDel = mock();

mock.module("@/lib/cache/client", () => ({
  cache: {
    get: mockCacheGet,
    set: mockCacheSet,
    del: mockCacheDel,
  },
}));

describe("cloud bootstrap race tracking", () => {
  let cleanupLatestResponseId: typeof import("@/lib/eliza/plugin-cloud-bootstrap/utils/race-tracking").cleanupLatestResponseId;
  let getLatestResponseId: typeof import("@/lib/eliza/plugin-cloud-bootstrap/utils/race-tracking").getLatestResponseId;
  let isLatestResponseId: typeof import("@/lib/eliza/plugin-cloud-bootstrap/utils/race-tracking").isLatestResponseId;
  let resetLatestResponseIdsForTests: typeof import("@/lib/eliza/plugin-cloud-bootstrap/utils/race-tracking").resetLatestResponseIdsForTests;
  let setLatestResponseId: typeof import("@/lib/eliza/plugin-cloud-bootstrap/utils/race-tracking").setLatestResponseId;

  beforeEach(async () => {
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockCacheDel.mockReset();

    const mod = await import(
      `@/lib/eliza/plugin-cloud-bootstrap/utils/race-tracking?t=${Date.now()}`
    );
    cleanupLatestResponseId = mod.cleanupLatestResponseId;
    getLatestResponseId = mod.getLatestResponseId;
    isLatestResponseId = mod.isLatestResponseId;
    resetLatestResponseIdsForTests = mod.resetLatestResponseIdsForTests;
    setLatestResponseId = mod.setLatestResponseId;
  });

  afterEach(() => {
    resetLatestResponseIdsForTests();
  });

  test("falls back to the local in-memory tracker when cache misses", async () => {
    mockCacheGet.mockResolvedValue(undefined);

    await setLatestResponseId("agent-1", "room-1", "resp-1");

    expect(mockCacheSet).toHaveBeenCalledWith(
      "cloud-bootstrap:latest-response:agent-1:room-1",
      "resp-1",
      3600,
    );
    expect(await getLatestResponseId("agent-1", "room-1")).toBe("resp-1");
    expect(await isLatestResponseId("agent-1", "room-1", "resp-1")).toBe(true);
  });

  test("does not delete a newer response id during cleanup", async () => {
    await setLatestResponseId("agent-1", "room-1", "resp-old");
    mockCacheGet.mockResolvedValue("resp-new");

    await cleanupLatestResponseId("agent-1", "room-1", "resp-old");

    expect(mockCacheDel).not.toHaveBeenCalled();
  });
});
