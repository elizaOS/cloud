import { beforeEach, describe, expect, it, vi } from "vitest";

const servicePricingFindMock = vi.fn();
const twitterConfiguredMock = vi.fn();
const twitterStatusMock = vi.fn();
const twitterCredentialsMock = vi.fn();

vi.mock("@/db/repositories/service-pricing", () => ({
  servicePricingRepository: {
    findByServiceAndMethod: servicePricingFindMock,
  },
}));

vi.mock("@/lib/services/twitter-automation", () => ({
  twitterAutomationService: {
    isConfigured: twitterConfiguredMock,
    getConnectionStatus: twitterStatusMock,
    getCredentialsForAgent: twitterCredentialsMock,
  },
}));

import {
  buildXPostSkeleton,
  getXCloudStatus,
  resolveXOperationCost,
} from "@/lib/services/x";

describe("cloud X service", () => {
  beforeEach(() => {
    servicePricingFindMock.mockReset();
    twitterConfiguredMock.mockReset();
    twitterStatusMock.mockReset();
    twitterCredentialsMock.mockReset();
  });

  it("returns the expected markup cost metadata shape", async () => {
    servicePricingFindMock.mockResolvedValue({
      cost: "0.25",
    });

    const metadata = await resolveXOperationCost("post");

    expect(metadata).toEqual({
      operation: "post",
      service: "x",
      rawCost: 0.25,
      markup: 0.05,
      billedCost: 0.3,
      markupRate: 0.2,
    });
  });

  it("returns 503 when X pricing is missing", async () => {
    servicePricingFindMock.mockResolvedValue(undefined);

    await expect(resolveXOperationCost("status")).rejects.toMatchObject({
      name: "XServiceError",
      status: 503,
    });
  });

  it("rejects cloud X access when the platform integration is not configured", async () => {
    twitterConfiguredMock.mockReturnValue(false);

    await expect(getXCloudStatus("org-1")).rejects.toMatchObject({
      name: "XServiceError",
      status: 503,
    });
  });

  it("rejects post skeleton requests when X credentials are missing", async () => {
    twitterCredentialsMock.mockResolvedValue(null);

    await expect(
      buildXPostSkeleton({
        organizationId: "org-1",
        text: "hello",
      }),
    ).rejects.toMatchObject({
      name: "XServiceError",
      status: 401,
    });
  });

  it("returns a connected status envelope with cost metadata", async () => {
    twitterConfiguredMock.mockReturnValue(true);
    twitterStatusMock.mockResolvedValue({
      connected: true,
      username: "milady",
      userId: "123",
    });
    servicePricingFindMock.mockResolvedValue({
      cost: "0.10",
    });

    const status = await getXCloudStatus("org-1");

    expect(status.connected).toBe(true);
    expect(status.status.username).toBe("milady");
    expect(status.cost).toMatchObject({
      operation: "status",
      service: "x",
      rawCost: 0.1,
      markup: 0.02,
      billedCost: 0.12,
      markupRate: 0.2,
    });
  });
});
