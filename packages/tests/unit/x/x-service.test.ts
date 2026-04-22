import { beforeEach, describe, expect, it, vi } from "vitest";

const twitterClient = {
  v2: {
    me: vi.fn(),
    tweet: vi.fn(),
    sendDmToParticipant: vi.fn(),
    listDmEvents: vi.fn(),
  },
};

const servicePricingFindMock = vi.fn();
const twitterConfiguredMock = vi.fn();
const twitterCredentialsMock = vi.fn();
const twitterApiConstructorMock = vi.fn(() => twitterClient);

vi.mock("@/db/repositories/service-pricing", () => ({
  servicePricingRepository: {
    findByServiceAndMethod: servicePricingFindMock,
  },
}));

vi.mock("@/lib/services/twitter-automation", () => ({
  twitterAutomationService: {
    isConfigured: twitterConfiguredMock,
    getCredentialsForAgent: twitterCredentialsMock,
  },
}));

vi.mock("twitter-api-v2", () => ({
  TwitterApi: twitterApiConstructorMock,
}));

import {
  createXPost,
  curateXDms,
  getXCloudStatus,
  getXDmDigest,
  resolveXOperationCost,
  sendXDm,
} from "@/lib/services/x";

function makeCredentials() {
  return {
    TWITTER_API_KEY: "api-key",
    TWITTER_API_SECRET_KEY: "api-secret",
    TWITTER_ACCESS_TOKEN: "access-token",
    TWITTER_ACCESS_TOKEN_SECRET: "access-secret",
  };
}

function makeDmEvent(args: {
  id: string;
  senderId: string;
  participantIds: string[];
  text: string;
  createdAt: string;
}) {
  return {
    id: args.id,
    event_type: "MessageCreate",
    created_at: args.createdAt,
    sender_id: args.senderId,
    participant_ids: args.participantIds,
    text: args.text,
    entities: {},
  };
}

describe("cloud X service", () => {
  beforeEach(() => {
    servicePricingFindMock.mockReset();
    twitterConfiguredMock.mockReset();
    twitterCredentialsMock.mockReset();
    twitterApiConstructorMock.mockClear();
    twitterClient.v2.me.mockReset();
    twitterClient.v2.tweet.mockReset();
    twitterClient.v2.sendDmToParticipant.mockReset();
    twitterClient.v2.listDmEvents.mockReset();

    twitterConfiguredMock.mockReturnValue(true);
    twitterCredentialsMock.mockResolvedValue(makeCredentials());
    servicePricingFindMock.mockResolvedValue({
      cost: "0.10",
    });
    twitterClient.v2.me.mockResolvedValue({
      data: {
        id: "self-1",
        username: "milady",
        name: "Milady",
        description: "local-first operator",
        profile_image_url: "https://example.com/avatar.jpg",
        verified: true,
        public_metrics: {
          followers_count: 100,
          following_count: 20,
          tweet_count: 7,
        },
      },
    });
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

  it("returns disconnected status without calling upstream when credentials are missing", async () => {
    twitterCredentialsMock.mockResolvedValue(null);

    const status = await getXCloudStatus("org-1");

    expect(status).toMatchObject({
      configured: true,
      connected: false,
      status: { connected: false },
      me: null,
    });
    expect(twitterApiConstructorMock).not.toHaveBeenCalled();
  });

  it("returns connected status with the upstream authenticated X profile", async () => {
    const status = await getXCloudStatus("org-1");

    expect(twitterApiConstructorMock).toHaveBeenCalledWith({
      appKey: "api-key",
      appSecret: "api-secret",
      accessToken: "access-token",
      accessSecret: "access-secret",
    });
    expect(twitterClient.v2.me).toHaveBeenCalledWith({
      "user.fields": ["description", "profile_image_url", "public_metrics", "verified"],
    });
    expect(status).toMatchObject({
      connected: true,
      status: {
        connected: true,
        username: "milady",
        userId: "self-1",
      },
      me: {
        id: "self-1",
        username: "milady",
        profileImageUrl: "https://example.com/avatar.jpg",
      },
      cost: {
        operation: "status",
        service: "x",
      },
    });
  });

  it("creates a real upstream X post after resolving cost metadata", async () => {
    twitterClient.v2.tweet.mockResolvedValue({
      data: {
        id: "tweet-1",
        text: "hello X",
      },
    });

    const result = await createXPost({
      organizationId: "org-1",
      text: " hello X ",
      replyToTweetId: "123",
    });

    expect(servicePricingFindMock).toHaveBeenCalledWith("x", "post");
    expect(twitterClient.v2.tweet).toHaveBeenCalledWith("hello X", {
      reply: { in_reply_to_tweet_id: "123" },
    });
    expect(result).toMatchObject({
      posted: true,
      operation: "post",
      tweet: {
        id: "tweet-1",
        text: "hello X",
        url: "https://x.com/i/status/tweet-1",
      },
      cost: {
        operation: "post",
        service: "x",
      },
    });
  });

  it("does not post when X credentials are missing", async () => {
    twitterCredentialsMock.mockResolvedValue(null);

    await expect(
      createXPost({
        organizationId: "org-1",
        text: "hello",
      }),
    ).rejects.toMatchObject({
      name: "XServiceError",
      status: 401,
    });
    expect(twitterClient.v2.tweet).not.toHaveBeenCalled();
  });

  it("sends a real upstream X direct message", async () => {
    twitterClient.v2.sendDmToParticipant.mockResolvedValue({
      dm_conversation_id: "conversation-1",
      dm_event_id: "dm-1",
    });

    const result = await sendXDm({
      organizationId: "org-1",
      participantId: "123456",
      text: " hello in DM ",
    });

    expect(servicePricingFindMock).toHaveBeenCalledWith("x", "dm.send");
    expect(twitterClient.v2.sendDmToParticipant).toHaveBeenCalledWith("123456", {
      text: "hello in DM",
    });
    expect(result).toMatchObject({
      sent: true,
      operation: "dm.send",
      message: {
        id: "dm-1",
        direction: "sent",
        participantId: "123456",
        senderId: "self-1",
      },
      cost: {
        operation: "dm.send",
      },
    });
  });

  it("builds a direct-message digest from upstream DM events", async () => {
    twitterClient.v2.listDmEvents.mockResolvedValue({
      events: [
        makeDmEvent({
          id: "dm-in",
          senderId: "sender-1",
          participantIds: ["self-1", "sender-1"],
          text: "can you review this today?",
          createdAt: "2023-11-14T22:13:20.000Z",
        }),
        makeDmEvent({
          id: "dm-out",
          senderId: "self-1",
          participantIds: ["self-1", "sender-1"],
          text: "on it",
          createdAt: "2023-11-14T19:26:40.000Z",
        }),
      ],
    });

    const result = await getXDmDigest({
      organizationId: "org-1",
      maxResults: 10,
    });

    expect(twitterClient.v2.listDmEvents).toHaveBeenCalledWith({
      max_results: 10,
      "dm_event.fields": [
        "id",
        "text",
        "event_type",
        "created_at",
        "sender_id",
        "dm_conversation_id",
        "attachments",
        "participant_ids",
        "entities",
      ],
      event_types: ["MessageCreate"],
      expansions: ["sender_id", "participant_ids"],
    });
    expect(result.digest).toEqual({
      totalMessages: 2,
      receivedCount: 1,
      sentCount: 1,
      participantIds: ["sender-1"],
      latestMessageAt: "2023-11-14T22:13:20.000Z",
    });
    expect(result.messages[0]).toMatchObject({
      id: "dm-in",
      direction: "received",
      participantId: "sender-1",
    });
  });

  it("curates actionable inbound direct messages from upstream events", async () => {
    twitterClient.v2.listDmEvents.mockResolvedValue({
      events: [
        makeDmEvent({
          id: "low",
          senderId: "sender-2",
          participantIds: ["self-1", "sender-2"],
          text: "thanks",
          createdAt: "2023-11-14T19:26:40.000Z",
        }),
        makeDmEvent({
          id: "high",
          senderId: "sender-1",
          participantIds: ["self-1", "sender-1"],
          text: "urgent: can you review this today?",
          createdAt: new Date().toISOString(),
        }),
        makeDmEvent({
          id: "sent",
          senderId: "self-1",
          participantIds: ["self-1", "sender-1"],
          text: "I replied",
          createdAt: new Date().toISOString(),
        }),
      ],
    });

    const result = await curateXDms({
      organizationId: "org-1",
      maxResults: 5,
    });

    expect(result.operation).toBe("dm.curate");
    expect(result.items.map((item) => item.message.id)).toEqual(["high", "low"]);
    expect(result.items[0]).toMatchObject({
      priority: "high",
      recommendedAction: "reply",
    });
  });

  it("maps upstream X authorization errors to service errors", async () => {
    twitterClient.v2.tweet.mockRejectedValue(
      Object.assign(new Error("Forbidden"), {
        code: 403,
        data: {
          detail: "Missing required permission",
        },
      }),
    );

    await expect(
      createXPost({
        organizationId: "org-1",
        text: "hello",
      }),
    ).rejects.toMatchObject({
      name: "XServiceError",
      status: 403,
      message: "Forbidden - Missing required permission",
    });
  });
});
