import { beforeEach, describe, expect, mock, test } from "bun:test";

const lookupMock = mock<
  (hostname: string, options: { all: boolean; verbatim: boolean }) => Promise<
    Array<{ address: string; family: 4 | 6 }>
  >
>();

mock.module("node:dns/promises", () => ({
  lookup: lookupMock,
}));

describe("outbound URL safety", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  test("rejects localhost and link-local destinations", async () => {
    const { assertSafeOutboundUrl } = await import("@/lib/security/outbound-url");

    await expect(
      assertSafeOutboundUrl("http://127.0.0.1:3000/mcp"),
    ).rejects.toThrow(/private|reserved|localhost/i);
    await expect(
      assertSafeOutboundUrl("http://169.254.169.254/latest/meta-data"),
    ).rejects.toThrow(/private|reserved/i);
  });

  test("rejects public hostnames that resolve to private addresses", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "10.0.0.7", family: 4 }]);
    const { assertSafeOutboundUrl } = await import("@/lib/security/outbound-url");

    await expect(
      assertSafeOutboundUrl("https://mcp.example.com"),
    ).rejects.toThrow(/private|reserved/i);
  });

  test("accepts public https endpoints", async () => {
    lookupMock.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    const { assertSafeOutboundUrl } = await import("@/lib/security/outbound-url");

    const url = await assertSafeOutboundUrl("https://example.com/mcp");
    expect(url.toString()).toBe("https://example.com/mcp");
  });

  test("rejects URLs that embed credentials", async () => {
    const { assertSafeOutboundUrl } = await import("@/lib/security/outbound-url");

    await expect(
      assertSafeOutboundUrl("https://user:pass@example.com/mcp"),
    ).rejects.toThrow(/credentials/i);
  });
});
