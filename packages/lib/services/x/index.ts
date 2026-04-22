import { applyMarkup, type MarkupBreakdown } from "@elizaos/billing";
import {
  type SendTweetV2Params,
  type TTweetv2UserField,
  TwitterApi,
  type UserV2,
} from "twitter-api-v2";
import { servicePricingRepository } from "@/db/repositories/service-pricing";
import { creditsService } from "@/lib/services/credits";
import { twitterAutomationService } from "@/lib/services/twitter-automation";
import { logger } from "@/lib/utils/logger";

export type XOperation = "status" | "post" | "dm.send" | "dm.digest" | "dm.curate";

export interface XOperationCostMetadata extends MarkupBreakdown {
  operation: XOperation;
  service: "x";
}

export interface XAuthenticatedUser {
  id: string;
  username: string;
  name: string;
  description: string | null;
  profileImageUrl: string | null;
  verified: boolean | null;
  publicMetrics: UserV2["public_metrics"] | null;
}

export interface XDirectMessage {
  id: string;
  text: string;
  createdAt: string | null;
  senderId: string;
  recipientId: string;
  participantId: string;
  direction: "sent" | "received";
  entities: XDirectMessageEntities | null;
  hasAttachment: boolean;
}

export interface XDmCurationItem {
  message: XDirectMessage;
  curationScore: number;
  priority: "high" | "medium" | "low";
  recommendedAction: "reply" | "review" | "archive";
  reason: string;
}

export class XServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "XServiceError";
  }
}

interface XCloudCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
}

type XClient = InstanceType<typeof TwitterApi>;

type XDirectMessageEntities = {
  urls?: Array<Record<string, unknown>>;
  hashtags?: Array<Record<string, unknown>>;
  cashtags?: Array<Record<string, unknown>>;
  mentions?: Array<Record<string, unknown>>;
};

type XDirectMessageEventV2 = {
  id: string;
  event_type: "MessageCreate" | "ParticipantsJoin" | "ParticipantsLeave";
  text?: string;
  created_at?: string;
  sender_id?: string;
  dm_conversation_id?: string;
  attachments?: {
    media_keys?: string[];
    card_ids?: string[];
  };
  participant_ids?: string[];
  entities?: XDirectMessageEntities;
};

type XDirectMessageTimelineV2 = {
  events: XDirectMessageEventV2[];
};

type XApiErrorData = {
  detail?: string;
  title?: string;
  status?: number;
  errors?: Array<{
    detail?: string;
    message?: string;
    title?: string;
  }>;
};

type XApiError = Error & {
  code?: number;
  data?: XApiErrorData;
  rateLimit?: {
    remaining?: number;
    reset?: number;
  };
};

const X_USER_FIELDS: TTweetv2UserField[] = [
  "description",
  "profile_image_url",
  "public_metrics",
  "verified",
];

const MAX_TWEET_LENGTH = 280;
const MAX_DM_LENGTH = 10_000;
const DEFAULT_DM_LIMIT = 20;
const MAX_DM_LIMIT = 50;

function fail(status: number, message: string): never {
  throw new XServiceError(status, message);
}

function normalizeText(value: string, fieldName: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    fail(400, `${fieldName} is required`);
  }
  if (trimmed.length > maxLength) {
    fail(400, `${fieldName} must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function normalizeSnowflake(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    fail(400, `${fieldName} must be a numeric X user id`);
  }
  return trimmed;
}

function normalizeDmLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_DM_LIMIT;
  if (!Number.isInteger(value) || value <= 0) {
    fail(400, "maxResults must be a positive integer");
  }
  return Math.min(value, MAX_DM_LIMIT);
}

async function resolveXOperationCost(operation: XOperation): Promise<XOperationCostMetadata> {
  const pricing = await servicePricingRepository.findByServiceAndMethod("x", operation);
  if (!pricing) {
    throw new XServiceError(503, `X pricing is not configured for operation ${operation}`);
  }

  const rawCost = Number(pricing.cost);
  if (!Number.isFinite(rawCost) || rawCost < 0) {
    throw new XServiceError(503, `Invalid X pricing for operation ${operation}`);
  }

  const breakdown = applyMarkup(rawCost);
  return {
    operation,
    service: "x",
    ...breakdown,
  };
}

function formatUsd(amount: number): string {
  return amount < 0.01 ? amount.toFixed(6) : amount.toFixed(2);
}

function xBillingMetadata(cost: XOperationCostMetadata): Record<string, unknown> {
  return {
    type: `x_${cost.operation}`,
    service: cost.service,
    operation: cost.operation,
    rawCost: cost.rawCost,
    markup: cost.markup,
    billedCost: cost.billedCost,
    markupRate: cost.markupRate,
  };
}

async function chargeXOperation(
  organizationId: string,
  cost: XOperationCostMetadata,
): Promise<{
  refund: (reason: string) => Promise<void>;
}> {
  if (cost.billedCost <= 0) {
    return { refund: async () => {} };
  }

  const result = await creditsService.reserveAndDeductCredits({
    organizationId,
    amount: cost.billedCost,
    description: `X API ${cost.operation}`,
    metadata: xBillingMetadata(cost),
  });

  if (!result.success) {
    if (result.reason === "org_not_found") {
      fail(404, "Organization not found");
    }
    fail(
      402,
      `Insufficient credits for X ${cost.operation}. Required: $${formatUsd(cost.billedCost)}.`,
    );
  }

  return {
    refund: async (reason: string) => {
      await creditsService.refundCredits({
        organizationId,
        amount: cost.billedCost,
        description: `X API ${cost.operation} refund`,
        metadata: {
          ...xBillingMetadata(cost),
          type: `x_${cost.operation}_refund`,
          reason,
        },
      });
    },
  };
}

async function runChargedXOperation<T>(
  organizationId: string,
  cost: XOperationCostMetadata,
  run: () => Promise<T>,
): Promise<T> {
  const charge = await chargeXOperation(organizationId, cost);
  try {
    return await run();
  } catch (error) {
    try {
      await charge.refund("upstream_failure");
    } catch (refundError) {
      logger.error("[XService] Failed to refund X operation after upstream failure", {
        organizationId,
        operation: cost.operation,
        error: refundError instanceof Error ? refundError.message : String(refundError),
      });
    }
    throw error;
  }
}

function readCredential(credentials: Record<string, string>, key: string, status: number): string {
  const value = credentials[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(status, `X credential ${key} is missing`);
  }
  return value.trim();
}

function normalizeXCloudCredentials(credentials: Record<string, string>): XCloudCredentials {
  return {
    appKey: readCredential(credentials, "TWITTER_API_KEY", 503),
    appSecret: readCredential(credentials, "TWITTER_API_SECRET_KEY", 503),
    accessToken: readCredential(credentials, "TWITTER_ACCESS_TOKEN", 401),
    accessSecret: readCredential(credentials, "TWITTER_ACCESS_TOKEN_SECRET", 401),
  };
}

export async function requireXCloudCredentials(organizationId: string): Promise<XCloudCredentials> {
  if (!twitterAutomationService.isConfigured()) {
    throw new XServiceError(503, "X integration is not configured on this platform");
  }

  const credentials = await twitterAutomationService.getCredentialsForAgent(organizationId);
  if (!credentials) {
    throw new XServiceError(401, "X is not connected for this organization");
  }

  return normalizeXCloudCredentials(credentials);
}

function createXClientFromCredentials(credentials: XCloudCredentials): XClient {
  return new TwitterApi({
    appKey: credentials.appKey,
    appSecret: credentials.appSecret,
    accessToken: credentials.accessToken,
    accessSecret: credentials.accessSecret,
  });
}

async function createXClient(organizationId: string): Promise<XClient> {
  const credentials = await requireXCloudCredentials(organizationId);
  return createXClientFromCredentials(credentials);
}

function mapXApiStatus(error: unknown): number {
  if (!(error instanceof Error)) return 502;
  const xError = error as XApiError;
  const upstreamStatus = xError.data?.status ?? xError.code;
  if (upstreamStatus === 401) return 401;
  if (upstreamStatus === 403) return 403;
  if (upstreamStatus === 429) return 429;
  if (typeof upstreamStatus === "number" && upstreamStatus >= 400 && upstreamStatus < 500) {
    return upstreamStatus;
  }
  return 502;
}

function formatXApiError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const xError = error as XApiError;
  const parts = [error.message || fallback];
  if (xError.data?.detail) parts.push(xError.data.detail);
  if (xError.data?.title) parts.push(xError.data.title);
  for (const item of xError.data?.errors ?? []) {
    const detail = item.detail ?? item.message ?? item.title;
    if (detail) parts.push(detail);
  }
  if (xError.rateLimit?.remaining === 0 && xError.rateLimit.reset) {
    parts.push(`rate limit resets at ${new Date(xError.rateLimit.reset * 1000).toISOString()}`);
  }
  return [...new Set(parts)].join(" - ");
}

function throwXApiError(error: unknown, fallback: string): never {
  if (error instanceof XServiceError) throw error;
  throw new XServiceError(mapXApiStatus(error), formatXApiError(error, fallback));
}

function mapAuthenticatedUser(user: UserV2): XAuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    description: user.description ?? null,
    profileImageUrl: user.profile_image_url ?? null,
    verified: user.verified ?? null,
    publicMetrics: user.public_metrics ?? null,
  };
}

async function getAuthenticatedUser(client: XClient): Promise<XAuthenticatedUser> {
  const me = await client.v2.me({
    "user.fields": X_USER_FIELDS,
  });
  return mapAuthenticatedUser(me.data);
}

function mapDirectMessage(event: XDirectMessageEventV2, selfUserId: string): XDirectMessage | null {
  if (event.event_type !== "MessageCreate") {
    return null;
  }

  const senderId = event.sender_id;
  if (!senderId) {
    return null;
  }

  const otherParticipantId =
    event.participant_ids?.find((participantId) => participantId !== selfUserId) ??
    (senderId === selfUserId ? "" : senderId);
  if (!otherParticipantId) {
    return null;
  }

  const direction = senderId === selfUserId ? "sent" : "received";
  const recipientId = direction === "sent" ? otherParticipantId : selfUserId;

  return {
    id: event.id,
    text: event.text ?? "",
    createdAt: event.created_at ?? null,
    senderId,
    recipientId,
    participantId: otherParticipantId,
    direction,
    entities: event.entities ?? null,
    hasAttachment: Boolean(
      event.attachments?.media_keys?.length || event.attachments?.card_ids?.length,
    ),
  };
}

async function listDirectMessages(args: {
  client: XClient;
  selfUserId: string;
  maxResults?: number;
}): Promise<XDirectMessage[]> {
  const limit = normalizeDmLimit(args.maxResults);
  const timeline = (await args.client.v2.listDmEvents({
    max_results: limit,
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
  })) as XDirectMessageTimelineV2;

  return timeline.events
    .map((event) => mapDirectMessage(event, args.selfUserId))
    .filter((message): message is XDirectMessage => message !== null);
}

function scoreDirectMessage(message: XDirectMessage, now: number): XDmCurationItem {
  const text = message.text.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  if (message.direction === "received") {
    score += 30;
    reasons.push("incoming");
  }

  if (/\?/.test(message.text)) {
    score += 15;
    reasons.push("question");
  }

  if (/\b(urgent|asap|today|now|deadline|blocked|help|important)\b/i.test(message.text)) {
    score += 25;
    reasons.push("time-sensitive");
  }

  if (/\b(can you|could you|please|need|send|review|confirm|reply)\b/i.test(message.text)) {
    score += 15;
    reasons.push("action requested");
  }

  const createdAt = message.createdAt ? Date.parse(message.createdAt) : Number.NaN;
  if (Number.isFinite(createdAt)) {
    const ageHours = (now - createdAt) / 3_600_000;
    if (ageHours <= 24) {
      score += 20;
      reasons.push("recent");
    } else if (ageHours <= 72) {
      score += 10;
      reasons.push("this week");
    }
  }

  if (text.includes("thank")) {
    score -= 5;
  }

  const priority = score >= 70 ? "high" : score >= 45 ? "medium" : "low";
  const recommendedAction =
    message.direction === "received" && score >= 45
      ? "reply"
      : message.direction === "received"
        ? "review"
        : "archive";

  return {
    message,
    curationScore: Math.max(0, score),
    priority,
    recommendedAction,
    reason: reasons.length > 0 ? reasons.join(", ") : "low-signal",
  };
}

export async function getXCloudStatus(organizationId: string): Promise<{
  configured: boolean;
  connected: boolean;
  status: {
    connected: boolean;
    username?: string;
    userId?: string;
    avatarUrl?: string;
  };
  me: XAuthenticatedUser | null;
  cost: XOperationCostMetadata;
}> {
  if (!twitterAutomationService.isConfigured()) {
    throw new XServiceError(503, "X integration is not configured on this platform");
  }

  const cost = await resolveXOperationCost("status");
  const credentials = await twitterAutomationService.getCredentialsForAgent(organizationId);
  if (!credentials) {
    return {
      configured: true,
      connected: false,
      status: { connected: false },
      me: null,
      cost,
    };
  }

  try {
    const client = createXClientFromCredentials(normalizeXCloudCredentials(credentials));
    return await runChargedXOperation(organizationId, cost, async () => {
      const me = await getAuthenticatedUser(client);
      return {
        configured: true,
        connected: true,
        status: {
          connected: true,
          username: me.username,
          userId: me.id,
          avatarUrl: me.profileImageUrl ?? undefined,
        },
        me,
        cost,
      };
    });
  } catch (error) {
    throwXApiError(error, "Failed to fetch X account status");
  }
}

export async function createXPost(args: {
  organizationId: string;
  text: string;
  replyToTweetId?: string;
  quoteTweetId?: string;
}): Promise<{
  posted: boolean;
  operation: "post";
  tweet: {
    id: string;
    text: string;
    url: string;
  };
  cost: XOperationCostMetadata;
}> {
  const text = normalizeText(args.text, "text", MAX_TWEET_LENGTH);
  const replyToTweetId = args.replyToTweetId
    ? normalizeSnowflake(args.replyToTweetId, "replyToTweetId")
    : undefined;
  const quoteTweetId = args.quoteTweetId
    ? normalizeSnowflake(args.quoteTweetId, "quoteTweetId")
    : undefined;
  const cost = await resolveXOperationCost("post");
  const client = await createXClient(args.organizationId);
  const payload: Partial<SendTweetV2Params> = {};

  if (replyToTweetId) {
    payload.reply = { in_reply_to_tweet_id: replyToTweetId };
  }
  if (quoteTweetId) {
    payload.quote_tweet_id = quoteTweetId;
  }

  try {
    return await runChargedXOperation(args.organizationId, cost, async () => {
      const tweet = await client.v2.tweet(text, payload);
      return {
        posted: true,
        operation: "post",
        tweet: {
          id: tweet.data.id,
          text: tweet.data.text,
          url: `https://x.com/i/status/${tweet.data.id}`,
        },
        cost,
      };
    });
  } catch (error) {
    throwXApiError(error, "Failed to create X post");
  }
}

export async function sendXDm(args: {
  organizationId: string;
  participantId: string;
  text: string;
}): Promise<{
  sent: boolean;
  operation: "dm.send";
  message: XDirectMessage;
  cost: XOperationCostMetadata;
}> {
  const participantId = normalizeSnowflake(args.participantId, "participantId");
  const text = normalizeText(args.text, "text", MAX_DM_LENGTH);
  const cost = await resolveXOperationCost("dm.send");
  const client = await createXClient(args.organizationId);

  try {
    return await runChargedXOperation(args.organizationId, cost, async () => {
      const me = await getAuthenticatedUser(client);
      const result = await client.v2.sendDmToParticipant(participantId, { text });
      return {
        sent: true,
        operation: "dm.send",
        message: {
          id: result.dm_event_id,
          text,
          createdAt: new Date().toISOString(),
          senderId: me.id,
          recipientId: participantId,
          participantId,
          direction: "sent",
          entities: null,
          hasAttachment: false,
        },
        cost,
      };
    });
  } catch (error) {
    throwXApiError(error, "Failed to send X direct message");
  }
}

export async function getXDmDigest(args: { organizationId: string; maxResults?: number }): Promise<{
  operation: "dm.digest";
  digest: {
    totalMessages: number;
    receivedCount: number;
    sentCount: number;
    participantIds: string[];
    latestMessageAt: string | null;
  };
  messages: XDirectMessage[];
  syncedAt: string;
  cost: XOperationCostMetadata;
}> {
  const maxResults = normalizeDmLimit(args.maxResults);
  const cost = await resolveXOperationCost("dm.digest");
  const client = await createXClient(args.organizationId);

  try {
    return await runChargedXOperation(args.organizationId, cost, async () => {
      const me = await getAuthenticatedUser(client);
      const messages = await listDirectMessages({
        client,
        selfUserId: me.id,
        maxResults,
      });
      const receivedCount = messages.filter((message) => message.direction === "received").length;
      const sentCount = messages.length - receivedCount;
      const participantIds = [...new Set(messages.map((message) => message.participantId))];
      const latestMessageAt = messages[0]?.createdAt ?? null;

      return {
        operation: "dm.digest",
        digest: {
          totalMessages: messages.length,
          receivedCount,
          sentCount,
          participantIds,
          latestMessageAt,
        },
        messages,
        syncedAt: new Date().toISOString(),
        cost,
      };
    });
  } catch (error) {
    throwXApiError(error, "Failed to fetch X direct message digest");
  }
}

export async function curateXDms(args: { organizationId: string; maxResults?: number }): Promise<{
  operation: "dm.curate";
  items: XDmCurationItem[];
  syncedAt: string;
  cost: XOperationCostMetadata;
}> {
  const maxResults = normalizeDmLimit(args.maxResults);
  const cost = await resolveXOperationCost("dm.curate");
  const client = await createXClient(args.organizationId);

  try {
    return await runChargedXOperation(args.organizationId, cost, async () => {
      const me = await getAuthenticatedUser(client);
      const messages = await listDirectMessages({
        client,
        selfUserId: me.id,
        maxResults,
      });
      const now = Date.now();
      const items = messages
        .filter((message) => message.direction === "received")
        .map((message) => scoreDirectMessage(message, now))
        .sort((left, right) => {
          const scoreDelta = right.curationScore - left.curationScore;
          if (scoreDelta !== 0) return scoreDelta;
          return (
            Date.parse(right.message.createdAt ?? "1970-01-01T00:00:00.000Z") -
            Date.parse(left.message.createdAt ?? "1970-01-01T00:00:00.000Z")
          );
        });

      return {
        operation: "dm.curate",
        items,
        syncedAt: new Date().toISOString(),
        cost,
      };
    });
  } catch (error) {
    throwXApiError(error, "Failed to curate X direct messages");
  }
}

export { resolveXOperationCost };
