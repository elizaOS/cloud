import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils/copy-to-clipboard", () => ({
  copyTextToClipboard: vi.fn(),
}));

import {
  copyApiKeyToClipboard,
  getClientApiKeySecret,
  listClientApiKeys,
} from "@/lib/client/api-keys";
import { copyTextToClipboard } from "@/lib/utils/copy-to-clipboard";

const copyTextToClipboardMock = vi.mocked(copyTextToClipboard);

describe("api key client utils", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    copyTextToClipboardMock.mockReset();
  });

  it("returns the full API key secret for an existing key id", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        keys: [
          {
            id: "key-1",
            key: "eliza_full_secret",
            key_prefix: "eliza_123",
          },
        ],
      }),
    }) as typeof fetch;

    await expect(listClientApiKeys()).resolves.toEqual([
      {
        id: "key-1",
        key: "eliza_full_secret",
        key_prefix: "eliza_123",
      },
    ]);
    await expect(getClientApiKeySecret("key-1")).resolves.toBe("eliza_full_secret");
  });

  it("copies the entire API key value", async () => {
    copyTextToClipboardMock.mockResolvedValue(true);

    await expect(copyApiKeyToClipboard("eliza_full_secret")).resolves.toBeUndefined();
    expect(copyTextToClipboardMock).toHaveBeenCalledWith("eliza_full_secret");
  });
});
