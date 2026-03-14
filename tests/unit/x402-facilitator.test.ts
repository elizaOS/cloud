import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { x402FacilitatorService } from "@/lib/services/x402-facilitator";

// Mock viem public client & logger
vi.mock("viem", () => {
  return {
    createPublicClient: vi.fn(),
    http: vi.fn(),
    formatGwei: vi.fn(),
    parseGwei: vi.fn(),
  };
});
vi.mock("@/lib/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("X402FacilitatorService (BSC Integration)", () => {
  const mockPrivateKey = generatePrivateKey();
  const mockAccount = privateKeyToAccount(mockPrivateKey);

  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate setting up the facilitator with a private key and BSC networks
    process.env.FACILITATOR_PRIVATE_KEY = mockPrivateKey;
    process.env.X402_NETWORKS = "bsc,bsc-testnet";

    // Reset singleton state
    (x402FacilitatorService as any).initialized = false;
    (x402FacilitatorService as any).account = null;
    (x402FacilitatorService as any).networks = {};
    (x402FacilitatorService as any).enabledNetworks = [];
    (x402FacilitatorService as any).clients.clear();
  });

  it("should initialize and expose bsc and bsc-testnet in its supported config", async () => {
    await x402FacilitatorService.initialize();
    expect(x402FacilitatorService.isReady()).toBe(true);

    const supported = x402FacilitatorService.getSupported();
    expect(supported.kinds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ network: "eip155:56", scheme: "exact" }),
        expect.objectContaining({ network: "eip155:97", scheme: "exact" }),
      ]),
    );
    expect(supported.signers["eip155:56"]).toContain(mockAccount.address);
  });

  it("should reject payments if the network is strictly not supported", async () => {
    // Override networks to only support base
    process.env.X402_NETWORKS = "base";
    await x402FacilitatorService.initialize();

    const payload: any = {
      x402Version: 1,
      accepted: {
        scheme: "exact",
        network: "eip155:56", // BSC
        amount: "1000000",
        payTo: "0xReceiver",
      },
      payload: {
        authorization: { from: "0xPayer", validBefore: "9999999999" },
        signature: "0xsig",
      },
    };

    const req: any = { amount: "1000000", payTo: "0xReceiver", network: "eip155:56" };

    const result = await x402FacilitatorService.verify(payload, req);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toContain("network_not_supported");
  });

  it("should reject expired payment payloads", async () => {
    await x402FacilitatorService.initialize();

    const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

    const payload: any = {
      x402Version: 1,
      accepted: {
        scheme: "exact",
        network: "eip155:56",
        amount: "1000000",
        payTo: "0xReceiver",
      },
      payload: {
        authorization: {
          from: "0xPayer",
          to: "0xReceiver",
          value: "1000000",
          nonce: "0xnonce",
          validBefore: expiredTimestamp.toString(),
        },
        signature: "0xsig",
      },
    };

    const req: any = {
      amount: "1000000",
      payTo: "0xReceiver",
      network: "eip155:56",
      scheme: "exact",
    };
    const result = await x402FacilitatorService.verify(payload, req);

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("payment_expired");
  });
});
