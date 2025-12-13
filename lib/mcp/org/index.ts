import { z } from "zod";
import { tasksService, TodoPriority, TodoStatus } from "@/lib/services/tasks";
import { checkinsService, CheckinType, CheckinFrequency } from "@/lib/services/checkins";
import { botsService } from "@/lib/services/bots";
import { seoService } from "@/lib/services/seo";
import {
  advertisingService,
  type AdPlatform,
  AdPlatformSchema,
  CampaignIdSchema,
  CampaignObjectiveSchema,
  BudgetTypeSchema,
  CreativeTypeSchema,
  GetAnalyticsSchema as AdGetAnalyticsSchema,
} from "@/lib/services/advertising";
import { analyticsService } from "@/lib/services/analytics";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import {
  SocialPlatformSchema,
  NotificationChannelSchema,
} from "@/lib/types/social-media";
import { communityModerationTools } from "./community-moderation-tools";

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: Record<string, unknown>, context: MCPContext) => Promise<unknown>;
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: (uri: string, context: MCPContext) => Promise<unknown>;
}

export interface MCPContext {
  organizationId: string;
  userId?: string;
  serverId?: string;
  platform?: "discord" | "telegram" | "web";
}

export interface MCPServerDefinition {
  name: string;
  version: string;
  description: string;
  tools: MCPToolDefinition[];
  resources: MCPResourceDefinition[];
}

// TOOL SCHEMAS

const CreateTodoSchema = z.object({
  title: z.string().min(1).max(500).describe("Title of the todo item"),
  description: z.string().max(5000).optional().describe("Detailed description"),
  priority: z
    .enum(["low", "medium", "high", "urgent"])
    .optional()
    .describe("Priority level"),
  dueDate: z.string().datetime().optional().describe("Due date in ISO format"),
  assigneePlatformId: z.string().optional().describe("Platform user ID to assign to"),
  assigneePlatform: z
    .enum(["discord", "telegram"])
    .optional()
    .describe("Platform of the assignee"),
  assigneeName: z.string().optional().describe("Display name of assignee"),
  tags: z.array(z.string()).optional().describe("Tags for categorization"),
  relatedProject: z.string().optional().describe("Related project name"),
});

const UpdateTodoSchema = z.object({
  todoId: z.string().uuid().describe("ID of the todo to update"),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

const ListTodosSchema = z.object({
  status: z
    .enum(["pending", "in_progress", "completed", "cancelled"])
    .optional()
    .describe("Filter by status"),
  priority: z
    .enum(["low", "medium", "high", "urgent"])
    .optional()
    .describe("Filter by priority"),
  assigneePlatformId: z.string().optional().describe("Filter by assignee"),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

const CreateCheckinScheduleSchema = z.object({
  serverId: z.string().uuid().describe("Server/group ID to create schedule for"),
  name: z.string().min(1).max(200).describe("Name of the check-in schedule"),
  checkinType: z
    .enum(["standup", "sprint", "mental_health", "project_status", "retrospective"])
    .optional()
    .default("standup")
    .describe("Type of check-in"),
  frequency: z
    .enum(["daily", "weekdays", "weekly", "bi_weekly", "monthly"])
    .optional()
    .default("weekdays")
    .describe("How often to run check-ins"),
  timeUtc: z.string().regex(/^\d{2}:\d{2}$/).describe("Time in HH:MM UTC format"),
  checkinChannelId: z.string().describe("Channel ID to post check-in prompts"),
  reportChannelId: z.string().optional().describe("Channel ID to post reports"),
  questions: z.array(z.string()).optional().describe("Custom questions to ask"),
});

const RecordCheckinResponseSchema = z.object({
  scheduleId: z.string().uuid().describe("Schedule ID to record response for"),
  responderPlatformId: z.string().describe("Platform user ID of responder"),
  responderPlatform: z.enum(["discord", "telegram"]).describe("Platform of responder"),
  responderName: z.string().optional().describe("Display name of responder"),
  answers: z.record(z.string(), z.string()).describe("Question-answer pairs"),
});

const GenerateReportSchema = z.object({
  scheduleId: z.string().uuid().describe("Schedule ID to generate report for"),
  startDate: z.string().datetime().describe("Start of date range"),
  endDate: z.string().datetime().describe("End of date range"),
});

const AddTeamMemberSchema = z.object({
  serverId: z.string().uuid().describe("Server ID to add member to"),
  platformUserId: z.string().describe("Platform-specific user ID"),
  platform: z.enum(["discord", "telegram"]).describe("Platform of the user"),
  displayName: z.string().optional().describe("Display name"),
  username: z.string().optional().describe("Username"),
  role: z.string().optional().describe("Role in the team"),
  isAdmin: z.boolean().optional().describe("Whether user is an admin"),
});

const GetPlatformStatusSchema = z.object({
  platform: z.enum(["discord", "telegram"]).optional().describe("Filter by platform"),
});

// TOOL HANDLERS

async function handleCreateTodo(
  params: z.infer<typeof CreateTodoSchema>,
  context: MCPContext
) {
  logger.info("[OrgMCP] Creating todo", { organizationId: context.organizationId });

  const todo = await tasksService.create({
    organizationId: context.organizationId,
    title: params.title,
    description: params.description,
    priority: params.priority as TodoPriority | undefined,
    dueDate: params.dueDate ? new Date(params.dueDate) : undefined,
    assigneePlatformId: params.assigneePlatformId,
    assigneePlatform: params.assigneePlatform,
    assigneeName: params.assigneeName,
    tags: params.tags,
    createdByUserId: context.userId,
    sourcePlatform: context.platform || "web",
    sourceServerId: context.serverId,
    relatedProject: params.relatedProject,
  });

  return {
    success: true,
    todo: {
      id: todo.id,
      title: todo.title,
      status: todo.status,
      priority: todo.priority,
      dueDate: todo.due_date,
      createdAt: todo.created_at,
    },
  };
}

async function handleUpdateTodo(
  params: z.infer<typeof UpdateTodoSchema>,
  context: MCPContext
) {
  const todo = await tasksService.update(params.todoId, context.organizationId, {
    title: params.title,
    description: params.description,
    status: params.status as TodoStatus | undefined,
    priority: params.priority as TodoPriority | undefined,
    dueDate: params.dueDate ? new Date(params.dueDate) : params.dueDate === null ? null : undefined,
    tags: params.tags,
  });

  return {
    success: true,
    todo: {
      id: todo.id,
      title: todo.title,
      status: todo.status,
      priority: todo.priority,
      updatedAt: todo.updated_at,
    },
  };
}

async function handleListTodos(
  params: z.infer<typeof ListTodosSchema>,
  context: MCPContext
) {
  const { todos, total } = await tasksService.list({
    organizationId: context.organizationId,
    status: params.status as TodoStatus | undefined,
    priority: params.priority as TodoPriority | undefined,
    assigneePlatformId: params.assigneePlatformId,
    limit: params.limit,
  });

  return {
    success: true,
    todos: todos.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.due_date,
      assignee: t.assignee_name,
    })),
    total,
  };
}

async function handleCompleteTodo(
  params: { todoId: string },
  context: MCPContext
) {
  const todo = await tasksService.complete(params.todoId, context.organizationId);

  return {
    success: true,
    todo: {
      id: todo.id,
      title: todo.title,
      status: todo.status,
      completedAt: todo.completed_at,
    },
  };
}

async function handleCreateCheckinSchedule(
  params: z.infer<typeof CreateCheckinScheduleSchema>,
  context: MCPContext
) {
  const schedule = await checkinsService.createSchedule({
    organizationId: context.organizationId,
    serverId: params.serverId,
    name: params.name,
    checkinType: params.checkinType as CheckinType,
    frequency: params.frequency as CheckinFrequency,
    timeUtc: params.timeUtc,
    checkinChannelId: params.checkinChannelId,
    reportChannelId: params.reportChannelId,
    questions: params.questions,
    createdBy: context.userId,
  });

  return {
    success: true,
    schedule: {
      id: schedule.id,
      name: schedule.name,
      checkinType: schedule.checkin_type,
      frequency: schedule.frequency,
      nextRunAt: schedule.next_run_at,
    },
  };
}

async function handleRecordCheckinResponse(
  params: z.infer<typeof RecordCheckinResponseSchema>,
  context: MCPContext
) {
  const response = await checkinsService.recordResponse({
    scheduleId: params.scheduleId,
    organizationId: context.organizationId,
    responderPlatformId: params.responderPlatformId,
    responderPlatform: params.responderPlatform,
    responderName: params.responderName,
    answers: params.answers,
  });

  return {
    success: true,
    response: {
      id: response.id,
      blockersDetected: response.blockers_detected,
      blockers: response.blockers,
      submittedAt: response.submitted_at,
    },
  };
}

async function handleListCheckinSchedules(
  params: { serverId?: string },
  context: MCPContext
) {
  const schedules = params.serverId
    ? await checkinsService.listServerSchedules(params.serverId)
    : await checkinsService.listSchedules(context.organizationId);

  return {
    success: true,
    schedules: schedules.map((s) => ({
      id: s.id,
      name: s.name,
      checkinType: s.checkin_type,
      frequency: s.frequency,
      timeUtc: s.time_utc,
      enabled: s.enabled,
      nextRunAt: s.next_run_at,
    })),
  };
}

async function handleGenerateReport(
  params: z.infer<typeof GenerateReportSchema>,
  context: MCPContext
) {
  const report = await checkinsService.generateReport(
    params.scheduleId,
    context.organizationId,
    {
      start: new Date(params.startDate),
      end: new Date(params.endDate),
    }
  );

  return {
    success: true,
    report: {
      scheduleName: report.scheduleName,
      checkinType: report.checkinType,
      totalResponses: report.totalResponses,
      participationRate: report.participationRate,
      members: report.members.map((m) => ({
        name: m.name,
        responseCount: m.responseCount,
        streak: m.streak,
        blockerCount: m.blockerCount,
      })),
      blockers: report.blockers.map((b) => ({
        memberName: b.memberName,
        blocker: b.blocker,
        date: b.date.toISOString(),
      })),
    },
  };
}

async function handleAddTeamMember(
  params: z.infer<typeof AddTeamMemberSchema>,
  context: MCPContext
) {
  const member = await checkinsService.upsertTeamMember({
    organizationId: context.organizationId,
    serverId: params.serverId,
    platformUserId: params.platformUserId,
    platform: params.platform,
    displayName: params.displayName,
    username: params.username,
    role: params.role,
    isAdmin: params.isAdmin,
  });

  return {
    success: true,
    member: {
      id: member.id,
      displayName: member.display_name,
      username: member.username,
      role: member.role,
    },
  };
}

async function handleListTeamMembers(
  params: { serverId: string },
  context: MCPContext
) {
  const members = await checkinsService.getTeamMembers(params.serverId);

  return {
    success: true,
    members: members.map((m) => ({
      id: m.id,
      platformUserId: m.platform_user_id,
      platform: m.platform,
      displayName: m.display_name,
      username: m.username,
      role: m.role,
      isAdmin: m.is_admin,
      stats: {
        totalCheckins: m.total_checkins,
        lastCheckinAt: m.last_checkin_at,
        streak: m.checkin_streak,
      },
    })),
  };
}

async function handleGetPlatformStatus(
  params: z.infer<typeof GetPlatformStatusSchema>,
  context: MCPContext
) {
  const connections = await botsService.getConnections(context.organizationId);

  const filtered = params.platform
    ? connections.filter((c) => c.platform === params.platform)
    : connections;

  return {
    success: true,
    platforms: await Promise.all(
      filtered.map(async (c) => {
        const servers = await botsService.getServers(c.id);
        return {
          id: c.id,
          platform: c.platform,
          botUsername: c.platform_bot_username,
          status: c.status,
          serverCount: servers.filter((s) => s.enabled).length,
        };
      })
    ),
  };
}

async function handleGetTodoStats(params: Record<string, never>, context: MCPContext) {
  const stats = await tasksService.getStats(context.organizationId);

  return {
    success: true,
    stats,
  };
}

// SOCIAL MEDIA TOOLS

const DraftSocialPostSchema = z.object({
  content: z.string().min(1).max(280).describe("Post content (max 280 chars for Twitter)"),
  platform: z.enum(["twitter", "discord", "telegram"]).describe("Target platform"),
  channelId: z.string().optional().describe("Channel ID for Discord/Telegram"),
  scheduledFor: z.string().datetime().optional().describe("ISO datetime to schedule post"),
  tags: z.array(z.string()).optional().describe("Tags for categorization"),
});

const ReviewPostSchema = z.object({
  content: z.string().describe("Draft post content to review"),
  platform: z.enum(["twitter", "discord", "telegram"]).describe("Target platform"),
  guidelines: z.array(z.string()).optional().describe("Brand guidelines to check against"),
});

async function handleDraftSocialPost(
  params: z.infer<typeof DraftSocialPostSchema>,
  context: MCPContext
) {
  logger.info("[OrgMCP] Drafting social post", { platform: params.platform });

  const todo = await tasksService.create({
    organizationId: context.organizationId,
    title: `Social post: ${params.platform}`,
    description: `Draft content:\n\n${params.content}\n\n${params.scheduledFor ? `Scheduled for: ${params.scheduledFor}` : "Immediate post"}`,
    priority: "medium",
    tags: ["social-media", params.platform, ...(params.tags || [])],
    createdByUserId: context.userId,
    sourcePlatform: context.platform || "web",
    relatedProject: "social-media-content",
  });

  return {
    success: true,
    draft: {
      id: todo.id,
      content: params.content,
      platform: params.platform,
      scheduledFor: params.scheduledFor,
      status: "draft",
      characterCount: params.content.length,
    },
  };
}

async function handleReviewPost(
  params: z.infer<typeof ReviewPostSchema>,
  _context: MCPContext
) {
  const issues: string[] = [];
  const suggestions: string[] = [];

  if (params.platform === "twitter" && params.content.length > 280) {
    issues.push(`Content exceeds Twitter's 280 character limit (${params.content.length} chars)`);
  }

  if (/moon|lambo|pump|100x|guaranteed/i.test(params.content)) {
    issues.push("Contains potentially problematic crypto-bro language");
    suggestions.push("Consider more professional, substance-focused messaging");
  }

  if (/\$\d+|price|profit|roi|returns/i.test(params.content)) {
    issues.push("Contains price/profit references that may require legal review");
  }

  if (params.content.split(/[!?]/).length > 3) {
    suggestions.push("Consider reducing exclamation points for a more professional tone");
  }

  const emojiCount = (params.content.match(/[\u{1F600}-\u{1F6FF}]/gu) || []).length;
  if (emojiCount > 2) {
    suggestions.push("Consider reducing emoji usage for cleaner messaging");
  }

  return {
    success: true,
    review: {
      content: params.content,
      platform: params.platform,
      characterCount: params.content.length,
      issues,
      suggestions,
      approved: issues.length === 0,
    },
  };
}

// COMMUNITY MANAGEMENT TOOLS

const LogCommunityEventSchema = z.object({
  eventType: z.enum(["new_member", "dispute", "moderation", "feedback", "highlight"]).describe("Type of community event"),
  description: z.string().describe("Description of the event"),
  involvedUsers: z.array(z.string()).optional().describe("User IDs involved"),
  platform: z.enum(["discord", "telegram", "web"]).describe("Platform where event occurred"),
  channelId: z.string().optional().describe("Channel/group ID"),
  severity: z.enum(["low", "medium", "high"]).optional().describe("Severity for moderation events"),
  resolution: z.string().optional().describe("How the event was resolved"),
});

const GetCommunityHealthSchema = z.object({
  platform: z.enum(["discord", "telegram"]).optional().describe("Filter by platform"),
  period: z.enum(["day", "week", "month"]).optional().default("week").describe("Time period for metrics"),
});

async function handleLogCommunityEvent(
  params: z.infer<typeof LogCommunityEventSchema>,
  context: MCPContext
) {
  logger.info("[OrgMCP] Logging community event", { eventType: params.eventType });

  const priority = params.severity === "high" ? "urgent" : params.severity === "medium" ? "high" : "medium";

  const todo = await tasksService.create({
    organizationId: context.organizationId,
    title: `Community: ${params.eventType}`,
    description: [
      params.description,
      params.involvedUsers?.length ? `Involved users: ${params.involvedUsers.join(", ")}` : null,
      params.resolution ? `Resolution: ${params.resolution}` : null,
    ].filter(Boolean).join("\n\n"),
    priority,
    tags: ["community", params.eventType, params.platform],
    createdByUserId: context.userId,
    sourcePlatform: params.platform,
    status: params.resolution ? "completed" : "pending",
  });

  return {
    success: true,
    event: {
      id: todo.id,
      eventType: params.eventType,
      platform: params.platform,
      severity: params.severity,
      resolved: !!params.resolution,
    },
  };
}

async function handleGetCommunityHealth(
  params: z.infer<typeof GetCommunityHealthSchema>,
  context: MCPContext
) {
  const { todos } = await tasksService.list({
    organizationId: context.organizationId,
    limit: 100,
  });

  const communityEvents = todos.filter((t) => t.tags?.includes("community"));
  const periodDays = params.period === "day" ? 1 : params.period === "week" ? 7 : 30;
  const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const recentEvents = communityEvents.filter(
    (t) => new Date(t.created_at) >= cutoff
  );

  const eventsByType = recentEvents.reduce(
    (acc, t) => {
      const type = t.tags?.find((tag) => 
        ["new_member", "dispute", "moderation", "feedback", "highlight"].includes(tag)
      ) || "other";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    success: true,
    health: {
      period: params.period,
      totalEvents: recentEvents.length,
      eventsByType,
      unresolvedIssues: recentEvents.filter((t) => t.status !== "completed").length,
      newMembers: eventsByType["new_member"] || 0,
      disputes: eventsByType["dispute"] || 0,
    },
  };
}

// SOCIAL FEED MANAGEMENT TOOLS

import {
  feedConfigService,
  engagementEventService,
  replyConfirmationService,
  type NotificationChannel,
  type SocialEngagementType,
} from "@/lib/services/social-feed";
import { feedPollingService } from "@/lib/services/social-feed/polling";
import { socialNotificationService } from "@/lib/services/social-feed/notifications";
import { replyRouterService } from "@/lib/services/social-feed/reply-router";

const CreateFeedConfigSchema = z.object({
  sourcePlatform: SocialPlatformSchema.describe("Platform to monitor"),
  sourceAccountId: z.string().describe("Account ID to monitor"),
  sourceUsername: z.string().optional().describe("Display username for reference"),
  monitorMentions: z.boolean().optional().default(true).describe("Monitor mentions"),
  monitorReplies: z.boolean().optional().default(true).describe("Monitor replies"),
  monitorQuoteTweets: z.boolean().optional().default(true).describe("Monitor quote tweets"),
  notificationChannels: z.array(NotificationChannelSchema).describe("Channels to notify on engagement"),
  pollingIntervalSeconds: z.number().optional().default(60).describe("Polling interval in seconds"),
  minFollowerCount: z.number().optional().describe("Minimum follower count to notify"),
});

const UpdateFeedConfigSchema = z.object({
  configId: z.string().uuid().describe("Feed config ID to update"),
  enabled: z.boolean().optional().describe("Enable/disable feed"),
  monitorMentions: z.boolean().optional(),
  monitorReplies: z.boolean().optional(),
  monitorQuoteTweets: z.boolean().optional(),
  notificationChannels: z.array(z.object({
    platform: z.enum(["discord", "telegram", "slack"]),
    channelId: z.string(),
    serverId: z.string().optional(),
  })).optional(),
  pollingIntervalSeconds: z.number().optional(),
  minFollowerCount: z.number().optional().nullable(),
});

const ListFeedConfigsSchema = z.object({
  sourcePlatform: z.string().optional().describe("Filter by platform"),
  enabled: z.boolean().optional().describe("Filter by enabled status"),
  limit: z.number().optional().default(20).describe("Max results"),
});

const ListEngagementsSchema = z.object({
  feedConfigId: z.string().uuid().optional().describe("Filter by feed config"),
  eventType: z.enum(["mention", "reply", "quote_tweet", "repost", "like", "comment", "follow"]).optional().describe("Filter by event type"),
  since: z.string().datetime().optional().describe("Start date filter"),
  limit: z.number().optional().default(50).describe("Max results"),
});

const ListPendingRepliesSchema = z.object({
  status: z.enum(["pending", "confirmed", "rejected", "expired", "sent", "failed"]).optional().describe("Filter by status"),
  limit: z.number().optional().default(20),
});

const ConfirmReplySchema = z.object({
  confirmationId: z.string().uuid().describe("Reply confirmation ID"),
});

const SendManualReplySchema = z.object({
  targetPlatform: SocialPlatformSchema.describe("Platform to post reply to"),
  targetPostId: z.string().describe("Post ID to reply to"),
  targetPostUrl: z.string().url().optional().describe("URL of post (for reference)"),
  replyContent: z.string().min(1).max(500).describe("Reply content"),
});

async function handleCreateFeedConfig(
  params: z.infer<typeof CreateFeedConfigSchema>,
  context: MCPContext
) {
  logger.info("[OrgMCP] Creating feed config", { organizationId: context.organizationId });

  const config = await feedConfigService.create({
    organizationId: context.organizationId,
    sourcePlatform: params.sourcePlatform,
    sourceAccountId: params.sourceAccountId,
    sourceUsername: params.sourceUsername,
    monitorMentions: params.monitorMentions,
    monitorReplies: params.monitorReplies,
    monitorQuoteTweets: params.monitorQuoteTweets,
    notificationChannels: params.notificationChannels as NotificationChannel[],
    pollingIntervalSeconds: params.pollingIntervalSeconds,
    minFollowerCount: params.minFollowerCount,
    createdBy: context.userId,
  });

  return {
    success: true,
    config: {
      id: config.id,
      sourcePlatform: config.source_platform,
      sourceAccountId: config.source_account_id,
      enabled: config.enabled,
      createdAt: config.created_at,
    },
  };
}

async function handleUpdateFeedConfig(
  params: z.infer<typeof UpdateFeedConfigSchema>,
  context: MCPContext
) {
  const config = await feedConfigService.update(params.configId, context.organizationId, {
    enabled: params.enabled,
    monitorMentions: params.monitorMentions,
    monitorReplies: params.monitorReplies,
    monitorQuoteTweets: params.monitorQuoteTweets,
    notificationChannels: params.notificationChannels as NotificationChannel[] | undefined,
    pollingIntervalSeconds: params.pollingIntervalSeconds,
    minFollowerCount: params.minFollowerCount,
  });

  return {
    success: true,
    config: {
      id: config.id,
      enabled: config.enabled,
      updatedAt: config.updated_at,
    },
  };
}

async function handleDeleteFeedConfig(
  params: { configId: string },
  context: MCPContext
) {
  await feedConfigService.delete(params.configId, context.organizationId);
  return { success: true };
}

async function handleListFeedConfigs(
  params: z.infer<typeof ListFeedConfigsSchema>,
  context: MCPContext
) {
  const { configs, total } = await feedConfigService.list({
    organizationId: context.organizationId,
    sourcePlatform: params.sourcePlatform,
    enabled: params.enabled,
    limit: params.limit,
  });

  return {
    success: true,
    configs: configs.map((c) => ({
      id: c.id,
      sourcePlatform: c.source_platform,
      sourceAccountId: c.source_account_id,
      sourceUsername: c.source_username,
      enabled: c.enabled,
      monitorMentions: c.monitor_mentions,
      monitorReplies: c.monitor_replies,
      monitorQuoteTweets: c.monitor_quote_tweets,
      notificationChannelCount: (c.notification_channels ?? []).length,
      lastPolledAt: c.last_polled_at,
    })),
    total,
  };
}

async function handleListEngagements(
  params: z.infer<typeof ListEngagementsSchema>,
  context: MCPContext
) {
  const { events, total } = await engagementEventService.list({
    organizationId: context.organizationId,
    feedConfigId: params.feedConfigId,
    eventType: params.eventType as SocialEngagementType | undefined,
    since: params.since ? new Date(params.since) : undefined,
    limit: params.limit,
  });

  return {
    success: true,
    engagements: events.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      sourcePlatform: e.source_platform,
      sourcePostUrl: e.source_post_url,
      authorUsername: e.author_username,
      authorDisplayName: e.author_display_name,
      authorFollowerCount: e.author_follower_count,
      content: e.content?.slice(0, 200),
      notificationSent: !!e.notification_sent_at,
      createdAt: e.created_at,
    })),
    total,
  };
}

async function handleGetEngagement(
  params: { engagementId: string },
  context: MCPContext
) {
  const event = await engagementEventService.get(params.engagementId, context.organizationId);
  if (!event) {
    return { success: false, error: "Engagement not found" };
  }

  return {
    success: true,
    engagement: {
      id: event.id,
      eventType: event.event_type,
      sourcePlatform: event.source_platform,
      sourcePostId: event.source_post_id,
      sourcePostUrl: event.source_post_url,
      authorId: event.author_id,
      authorUsername: event.author_username,
      authorDisplayName: event.author_display_name,
      authorFollowerCount: event.author_follower_count,
      authorVerified: event.author_verified,
      originalPostId: event.original_post_id,
      originalPostUrl: event.original_post_url,
      originalPostContent: event.original_post_content,
      content: event.content,
      engagementMetrics: event.engagement_metrics,
      notificationSentAt: event.notification_sent_at,
      createdAt: event.created_at,
    },
  };
}

async function handleListPendingReplies(
  params: z.infer<typeof ListPendingRepliesSchema>,
  context: MCPContext
) {
  const { confirmations, total } = await replyConfirmationService.list({
    organizationId: context.organizationId,
    status: params.status as "pending" | "confirmed" | "rejected" | "expired" | "sent" | "failed" | undefined,
    limit: params.limit,
  });

  return {
    success: true,
    pendingReplies: confirmations.map((c) => ({
      id: c.id,
      status: c.status,
      targetPlatform: c.target_platform,
      targetPostId: c.target_post_id,
      replyContent: c.reply_content,
      sourceUsername: c.source_username,
      sourcePlatform: c.source_platform,
      expiresAt: c.expires_at,
      createdAt: c.created_at,
    })),
    total,
  };
}

async function handleConfirmReply(
  params: z.infer<typeof ConfirmReplySchema>,
  context: MCPContext
) {
  const result = await replyRouterService.handleConfirmation(
    params.confirmationId,
    context.organizationId,
    context.userId || "agent",
    "Agent"
  );

  return {
    success: result.success,
    postId: result.postId,
    postUrl: result.postUrl,
    error: result.error,
  };
}

async function handleRejectReply(
  params: { confirmationId: string; reason?: string },
  context: MCPContext
) {
  await replyRouterService.handleRejection(
    params.confirmationId,
    context.organizationId,
    context.userId || "agent",
    params.reason
  );

  return { success: true };
}

async function handleSendManualReply(
  params: z.infer<typeof SendManualReplySchema>,
  context: MCPContext
) {
  const confirmation = await replyConfirmationService.create({
    organizationId: context.organizationId,
    targetPlatform: params.targetPlatform,
    targetPostId: params.targetPostId,
    targetPostUrl: params.targetPostUrl,
    sourcePlatform: context.platform || "web",
    sourceChannelId: "mcp",
    sourceMessageId: `mcp-${Date.now()}`,
    sourceUserId: context.userId || "agent",
    sourceUsername: "Agent",
    replyContent: params.replyContent,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  });

  return {
    success: true,
    confirmationId: confirmation.id,
    message: "Reply confirmation created. Use confirm_reply to approve.",
    expiresAt: confirmation.expires_at,
  };
}

async function handlePollFeeds(
  _params: Record<string, never>,
  context: MCPContext
) {
  const { configs } = await feedConfigService.list({
    organizationId: context.organizationId,
    enabled: true,
    limit: 10,
  });

  let totalNew = 0;
  const errors: string[] = [];

  for (const config of configs) {
    const result = await feedPollingService.pollFeed(config);
    totalNew += result.newEngagements;
    errors.push(...result.errors);
  }

  return {
    success: true,
    feedsPolled: configs.length,
    newEngagements: totalNew,
    errors: errors.length > 0 ? errors : undefined,
  };
}

async function handleProcessNotifications(
  _params: Record<string, never>,
  _context: MCPContext
) {
  const result = await socialNotificationService.processUnnotifiedEvents();

  return {
    success: true,
    processed: result.processed,
    successful: result.successful,
    failed: result.failed,
  };
}

// SEO TOOLS

const KeywordResearchSchema = z.object({
  keywords: z.array(z.string()).min(1).max(50).describe("Keywords to research"),
  locale: z.string().optional().default("en-US").describe("Locale (e.g., en-US)"),
  locationCode: z.number().optional().describe("DataForSEO location code (default: 2840 for US)"),
});

const SerpSnapshotSchema = z.object({
  query: z.string().describe("Search query to snapshot"),
  locale: z.string().optional().default("en").describe("Search locale"),
  searchEngine: z.string().optional().default("google").describe("Search engine"),
  device: z.enum(["desktop", "mobile", "tablet"]).optional().default("desktop"),
});

const SeoPageSchema = z.object({
  pageUrl: z.string().url().describe("URL of the page"),
  keywords: z.array(z.string()).optional().describe("Target keywords"),
  context: z.string().optional().describe("Additional context about the page"),
  locale: z.string().optional().default("en-US"),
});

const IndexNowSchema = z.object({
  pageUrl: z.string().url().describe("URL to submit to IndexNow"),
});

const SeoHealthCheckSchema = z.object({
  pageUrl: z.string().url().describe("URL to check"),
});

const GetSeoRequestSchema = z.object({
  requestId: z.string().uuid().describe("SEO request ID"),
});

async function handleKeywordResearch(
  params: z.infer<typeof KeywordResearchSchema>,
  context: MCPContext
) {
  const result = await seoService.createRequest({
    organizationId: context.organizationId,
    userId: context.userId,
    type: "keyword_research",
    keywords: params.keywords,
    locale: params.locale,
    locationCode: params.locationCode,
  });

  return {
    success: true,
    requestId: result.request.id,
    status: result.request.status,
    keywords: result.artifacts.find(a => a.type === "keywords")?.data ?? null,
    cost: result.request.total_cost,
  };
}

async function handleSerpSnapshot(
  params: z.infer<typeof SerpSnapshotSchema>,
  context: MCPContext
) {
  const result = await seoService.createRequest({
    organizationId: context.organizationId,
    userId: context.userId,
    type: "serp_snapshot",
    query: params.query,
    locale: params.locale,
    searchEngine: params.searchEngine,
    device: params.device,
  });

  return {
    success: true,
    requestId: result.request.id,
    status: result.request.status,
    results: result.artifacts.find(a => a.type === "serp_snapshot")?.data ?? null,
    cost: result.request.total_cost,
  };
}

async function handleGenerateSeoMeta(
  params: z.infer<typeof SeoPageSchema>,
  context: MCPContext
) {
  const result = await seoService.createRequest({
    organizationId: context.organizationId,
    userId: context.userId,
    type: "meta_generate",
    pageUrl: params.pageUrl,
    keywords: params.keywords,
    promptContext: params.context,
    locale: params.locale,
  });

  return {
    success: true,
    requestId: result.request.id,
    status: result.request.status,
    meta: result.artifacts.find(a => a.type === "meta")?.data ?? null,
    cost: result.request.total_cost,
  };
}

async function handleGenerateSeoSchema(
  params: z.infer<typeof SeoPageSchema>,
  context: MCPContext
) {
  const result = await seoService.createRequest({
    organizationId: context.organizationId,
    userId: context.userId,
    type: "schema_generate",
    pageUrl: params.pageUrl,
    keywords: params.keywords,
    promptContext: params.context,
    locale: params.locale,
  });

  return {
    success: true,
    requestId: result.request.id,
    status: result.request.status,
    schema: result.artifacts.find(a => a.type === "schema")?.data ?? null,
    cost: result.request.total_cost,
  };
}

async function handlePublishSeoBundle(
  params: z.infer<typeof SeoPageSchema>,
  context: MCPContext
) {
  const result = await seoService.createRequest({
    organizationId: context.organizationId,
    userId: context.userId,
    type: "publish_bundle",
    pageUrl: params.pageUrl,
    keywords: params.keywords,
    promptContext: params.context,
    locale: params.locale,
  });

  return {
    success: true,
    requestId: result.request.id,
    status: result.request.status,
    artifacts: result.artifacts.map(a => ({ type: a.type, provider: a.provider })),
    cost: result.request.total_cost,
  };
}

async function handleIndexNow(
  params: z.infer<typeof IndexNowSchema>,
  context: MCPContext
) {
  const result = await seoService.createRequest({
    organizationId: context.organizationId,
    userId: context.userId,
    type: "index_now",
    pageUrl: params.pageUrl,
  });

  return {
    success: true,
    requestId: result.request.id,
    status: result.request.status,
    submitted: result.artifacts.find(a => a.type === "indexnow_submission")?.data ?? null,
  };
}

async function handleSeoHealthCheck(
  params: z.infer<typeof SeoHealthCheckSchema>,
  context: MCPContext
) {
  const result = await seoService.createRequest({
    organizationId: context.organizationId,
    userId: context.userId,
    type: "health_check",
    pageUrl: params.pageUrl,
  });

  return {
    success: true,
    requestId: result.request.id,
    status: result.request.status,
    health: result.artifacts.find(a => a.type === "health_report")?.data ?? null,
  };
}

async function handleGetSeoRequest(
  params: z.infer<typeof GetSeoRequestSchema>,
  context: MCPContext
) {
  const { seoRequestsRepository, seoArtifactsRepository } = await import("@/db/repositories");

  const request = await seoRequestsRepository.findById(params.requestId);
  if (!request || request.organization_id !== context.organizationId) {
    return { success: false, error: "SEO request not found" };
  }

  const artifacts = await seoArtifactsRepository.listByRequest(request.id);

  return {
    success: true,
    request: {
      id: request.id,
      type: request.type,
      status: request.status,
      pageUrl: request.page_url,
      keywords: request.keywords,
      cost: request.total_cost,
      error: request.error,
      createdAt: request.created_at,
      completedAt: request.completed_at,
    },
    artifacts: artifacts.map(a => ({
      type: a.type,
      provider: a.provider,
      data: a.data,
    })),
  };
}

// ADVERTISING TOOLS (uses shared schemas from @/lib/services/advertising/schemas)

const OrgListAdAccountsSchema = z.object({
  platform: AdPlatformSchema.optional().describe("Filter by platform"),
});

const OrgListCampaignsSchema = z.object({
  adAccountId: z.string().uuid().optional().describe("Filter by ad account"),
  platform: AdPlatformSchema.optional().describe("Filter by platform"),
  status: z.enum(["pending", "active", "paused", "ended", "archived"]).optional(),
});

const OrgCreateCampaignSchema = z.object({
  adAccountId: z.string().uuid().describe("Ad account to create campaign in"),
  name: z.string().min(1).max(200).describe("Campaign name"),
  objective: CampaignObjectiveSchema.describe("Campaign objective"),
  budgetType: BudgetTypeSchema.describe("Budget type"),
  budgetAmount: z.number().positive().describe("Budget amount in USD"),
  startDate: z.string().datetime().optional().describe("Campaign start date"),
  endDate: z.string().datetime().optional().describe("Campaign end date"),
  targeting: z.record(z.unknown()).optional().describe("Targeting settings"),
});

const OrgCampaignActionSchema = CampaignIdSchema;

const OrgGetCampaignAnalyticsSchema = AdGetAnalyticsSchema;

const OrgCreateCreativeSchema = z.object({
  campaignId: z.string().uuid().describe("Campaign to add creative to"),
  name: z.string().describe("Creative name"),
  type: CreativeTypeSchema.describe("Creative type"),
  headline: z.string().max(100).optional().describe("Ad headline"),
  primaryText: z.string().max(500).optional().describe("Primary ad text"),
  description: z.string().max(200).optional().describe("Ad description"),
  callToAction: z.string().optional().describe("CTA button text"),
  destinationUrl: z.string().url().describe("Landing page URL"),
  media: z.record(z.unknown()).optional().describe("Media assets"),
});

async function handleListAdAccounts(
  params: z.infer<typeof OrgListAdAccountsSchema>,
  context: MCPContext
) {
  const accounts = await advertisingService.listAccounts(
    context.organizationId,
    { platform: params.platform as AdPlatform | undefined }
  );

  return {
    success: true,
    accounts: accounts.map(a => ({
      id: a.id,
      platform: a.platform,
      externalAccountId: a.external_account_id,
      accountName: a.account_name,
      status: a.status,
      createdAt: a.created_at,
    })),
  };
}

async function handleListCampaigns(
  params: z.infer<typeof OrgListCampaignsSchema>,
  context: MCPContext
) {
  const campaigns = await advertisingService.listCampaigns(
    context.organizationId,
    {
      adAccountId: params.adAccountId,
      platform: params.platform as AdPlatform | undefined,
      status: params.status,
    }
  );

  return {
    success: true,
    campaigns: campaigns.map(c => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      objective: c.objective,
      status: c.status,
      budgetType: c.budget_type,
      budgetAmount: c.budget_amount,
      creditsAllocated: c.credits_allocated,
      creditsSpent: c.credits_spent,
      totalSpend: c.total_spend,
      totalImpressions: c.total_impressions,
      totalClicks: c.total_clicks,
      startDate: c.start_date,
      endDate: c.end_date,
    })),
  };
}

async function handleCreateCampaign(
  params: z.infer<typeof OrgCreateCampaignSchema>,
  context: MCPContext
) {
  const campaign = await advertisingService.createCampaign({
    organizationId: context.organizationId,
    userId: context.userId || "",
    adAccountId: params.adAccountId,
    name: params.name,
    objective: params.objective,
    budgetType: params.budgetType,
    budgetAmount: params.budgetAmount,
    startDate: params.startDate ? new Date(params.startDate) : undefined,
    endDate: params.endDate ? new Date(params.endDate) : undefined,
    targeting: params.targeting,
  });

  return {
    success: true,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      creditsAllocated: campaign.credits_allocated,
    },
  };
}

async function handleStartCampaign(
  params: z.infer<typeof OrgCampaignActionSchema>,
  context: MCPContext
) {
  const campaign = await advertisingService.startCampaign(
    params.campaignId,
    context.organizationId
  );

  return {
    success: true,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
    },
  };
}

async function handlePauseCampaign(
  params: z.infer<typeof OrgCampaignActionSchema>,
  context: MCPContext
) {
  const campaign = await advertisingService.pauseCampaign(
    params.campaignId,
    context.organizationId
  );

  return {
    success: true,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
    },
  };
}

async function handleDeleteCampaign(
  params: z.infer<typeof OrgCampaignActionSchema>,
  context: MCPContext
) {
  await advertisingService.deleteCampaign(
    params.campaignId,
    context.organizationId
  );

  return { success: true };
}

async function handleGetCampaignAnalytics(
  params: z.infer<typeof OrgGetCampaignAnalyticsSchema>,
  context: MCPContext
) {
  const metrics = await advertisingService.getCampaignMetrics(
    params.campaignId,
    context.organizationId,
    params.startDate && params.endDate
      ? { start: new Date(params.startDate), end: new Date(params.endDate) }
      : undefined
  );

  return {
    success: true,
    metrics: {
      spend: metrics.spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      conversions: metrics.conversions,
      ctr: metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0,
      cpc: metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0,
      cpm: metrics.impressions > 0 ? (metrics.spend / metrics.impressions) * 1000 : 0,
    },
  };
}

async function handleGetAdStats(
  params: { platform?: string },
  context: MCPContext
) {
  const stats = await advertisingService.getStats(
    context.organizationId,
    { platform: params.platform as AdPlatform | undefined }
  );

  return {
    success: true,
    stats: {
      totalCampaigns: stats.totalCampaigns,
      activeCampaigns: stats.activeCampaigns,
      totalSpend: stats.totalSpend,
      totalImpressions: stats.totalImpressions,
      totalClicks: stats.totalClicks,
      totalConversions: stats.totalConversions,
      overallCtr: stats.totalImpressions > 0 
        ? (stats.totalClicks / stats.totalImpressions) * 100 
        : 0,
    },
  };
}

async function handleCreateCreative(
  params: z.infer<typeof OrgCreateCreativeSchema>,
  context: MCPContext
) {
  const creative = await advertisingService.createCreative(
    context.organizationId,
    {
      campaignId: params.campaignId,
      name: params.name,
      type: params.type,
      headline: params.headline,
      primaryText: params.primaryText,
      description: params.description,
      callToAction: params.callToAction,
      destinationUrl: params.destinationUrl,
      media: params.media,
    }
  );

  return {
    success: true,
    creative: {
      id: creative.id,
      name: creative.name,
      type: creative.type,
      status: creative.status,
    },
  };
}

// ANALYTICS TOOLS

const UsageOverviewSchema = z.object({
  timeRange: z.enum(["daily", "weekly", "monthly"]).optional().default("weekly"),
});

const CostBreakdownSchema = z.object({
  dimension: z.enum(["model", "provider", "user", "apiKey"]).describe("Breakdown dimension"),
  startDate: z.string().datetime().optional().describe("Start date filter"),
  endDate: z.string().datetime().optional().describe("End date filter"),
  sortBy: z.enum(["cost", "requests", "tokens"]).optional().default("cost"),
  limit: z.number().optional().default(20),
});

const UsageTrendsSchema = z.object({
  startDate: z.string().datetime().describe("Trend start date"),
  endDate: z.string().datetime().describe("Trend end date"),
  granularity: z.enum(["hour", "day", "week", "month"]).optional().default("day"),
});

async function handleGetUsageOverview(
  params: z.infer<typeof UsageOverviewSchema>,
  context: MCPContext
) {
  const overview = await analyticsService.getOverview(
    context.organizationId,
    params.timeRange
  );

  return {
    success: true,
    overview: {
      summary: overview.summary,
      trends: overview.trends,
      topProviders: overview.providerBreakdown.slice(0, 5),
      topModels: overview.modelBreakdown.slice(0, 5),
    },
  };
}

async function handleGetCostBreakdown(
  params: z.infer<typeof CostBreakdownSchema>,
  context: MCPContext
) {
  const breakdown = await analyticsService.getCostBreakdown(
    context.organizationId,
    params.dimension,
    {
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
      sortBy: params.sortBy,
      limit: params.limit,
    }
  );

  return {
    success: true,
    dimension: params.dimension,
    breakdown: breakdown.map(item => ({
      name: item.name,
      cost: item.cost,
      requests: item.requests,
      tokens: item.tokens,
      percentage: item.percentage,
    })),
  };
}

async function handleGetUsageTrends(
  params: z.infer<typeof UsageTrendsSchema>,
  context: MCPContext
) {
  const timeSeries = await analyticsService.getUsageTimeSeries(
    context.organizationId,
    {
      startDate: new Date(params.startDate),
      endDate: new Date(params.endDate),
      granularity: params.granularity,
    }
  );

  return {
    success: true,
    granularity: params.granularity,
    data: timeSeries.map(point => ({
      timestamp: point.timestamp,
      requests: point.totalRequests,
      cost: point.totalCost,
      inputTokens: point.inputTokens,
      outputTokens: point.outputTokens,
    })),
  };
}

async function handleGetProviderStats(
  params: { startDate?: string; endDate?: string },
  context: MCPContext
) {
  const breakdown = await analyticsService.getProviderBreakdown(
    context.organizationId,
    {
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
    }
  );

  return {
    success: true,
    providers: breakdown.map(p => ({
      provider: p.provider,
      requests: p.totalRequests,
      cost: p.totalCost,
      tokens: p.totalTokens,
      percentage: p.percentage,
    })),
  };
}

// SECRETS MANAGEMENT TOOLS

const StoreSecretSchema = z.object({
  name: z.string().min(1).max(100).describe("Secret name (e.g., TWITTER_API_KEY)"),
  value: z.string().min(1).describe("Secret value"),
  description: z.string().optional().describe("Description of the secret"),
  environment: z.enum(["development", "preview", "production"]).optional().describe("Environment scope"),
});

async function handleListSecrets(
  _params: Record<string, never>,
  context: MCPContext
) {
  const secrets = await secretsService.list(context.organizationId);

  return {
    success: true,
    secrets: secrets.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      scope: s.scope,
      environment: s.environment,
      version: s.version,
      lastAccessedAt: s.lastAccessedAt,
      createdAt: s.createdAt,
    })),
  };
}

async function handleStoreSecret(
  params: z.infer<typeof StoreSecretSchema>,
  context: MCPContext
) {
  const secret = await secretsService.create(
    {
      organizationId: context.organizationId,
      name: params.name,
      value: params.value,
      description: params.description,
      environment: params.environment,
      createdBy: context.userId || "agent",
    },
    {
      actorType: "user",
      actorId: context.userId || "agent",
      source: "org-mcp",
    }
  );

  return {
    success: true,
    secret: {
      id: secret.id,
      name: secret.name,
      version: secret.version,
      createdAt: secret.createdAt,
    },
  };
}

async function handleListOAuthConnections(
  _params: Record<string, never>,
  context: MCPContext
) {
  const connections = await secretsService.listOAuthConnections(context.organizationId);

  return {
    success: true,
    connections: connections.map(c => ({
      id: c.id,
      provider: c.provider,
      providerAccountId: c.providerAccountId,
      scopes: c.scopes,
      isValid: c.isValid,
      expiresAt: c.expiresAt,
      lastUsedAt: c.lastUsedAt,
    })),
  };
}

// MCP SERVER DEFINITION

export const orgMcpServer: MCPServerDefinition = {
  name: "org-tools",
  version: "1.0.0",
  description:
    "Organization management tools for team coordination, check-ins, todos, and platform management. Enables AI agents to manage organizational workflows across Discord, Telegram, and web interfaces.",

  tools: [
    {
      name: "create_todo",
      description:
        "Create a new todo item. Can be assigned to team members and tagged for organization.",
      inputSchema: CreateTodoSchema,
      handler: handleCreateTodo as MCPToolDefinition["handler"],
    },
    {
      name: "update_todo",
      description: "Update an existing todo item's properties including status, priority, and due date.",
      inputSchema: UpdateTodoSchema,
      handler: handleUpdateTodo as MCPToolDefinition["handler"],
    },
    {
      name: "list_todos",
      description: "List todos with optional filtering by status, priority, or assignee.",
      inputSchema: ListTodosSchema,
      handler: handleListTodos as MCPToolDefinition["handler"],
    },
    {
      name: "complete_todo",
      description: "Mark a todo as completed.",
      inputSchema: z.object({ todoId: z.string().uuid() }),
      handler: handleCompleteTodo as MCPToolDefinition["handler"],
    },
    {
      name: "get_todo_stats",
      description: "Get statistics about todos including counts by status and overdue items.",
      inputSchema: z.object({}),
      handler: handleGetTodoStats as MCPToolDefinition["handler"],
    },
    {
      name: "create_checkin_schedule",
      description:
        "Create a new check-in schedule for a server/group. Supports standups, sprints, mental health check-ins, and more.",
      inputSchema: CreateCheckinScheduleSchema,
      handler: handleCreateCheckinSchedule as MCPToolDefinition["handler"],
    },
    {
      name: "record_checkin_response",
      description: "Record a team member's check-in response with their answers to the check-in questions.",
      inputSchema: RecordCheckinResponseSchema,
      handler: handleRecordCheckinResponse as MCPToolDefinition["handler"],
    },
    {
      name: "list_checkin_schedules",
      description: "List all check-in schedules, optionally filtered by server.",
      inputSchema: z.object({ serverId: z.string().uuid().optional() }),
      handler: handleListCheckinSchedules as MCPToolDefinition["handler"],
    },
    {
      name: "generate_report",
      description:
        "Generate a team report based on check-in data for a date range. Includes participation rates and blocker analysis.",
      inputSchema: GenerateReportSchema,
      handler: handleGenerateReport as MCPToolDefinition["handler"],
    },
    {
      name: "add_team_member",
      description: "Add or update a team member in a server/group.",
      inputSchema: AddTeamMemberSchema,
      handler: handleAddTeamMember as MCPToolDefinition["handler"],
    },
    {
      name: "list_team_members",
      description: "List all team members in a server/group with their check-in stats.",
      inputSchema: z.object({ serverId: z.string().uuid() }),
      handler: handleListTeamMembers as MCPToolDefinition["handler"],
    },
    {
      name: "get_platform_status",
      description: "Get the connection status of platforms (Discord, Telegram) and their servers.",
      inputSchema: GetPlatformStatusSchema,
      handler: handleGetPlatformStatus as MCPToolDefinition["handler"],
    },
    {
      name: "draft_social_post",
      description: "Create a draft social media post for review before publishing.",
      inputSchema: DraftSocialPostSchema,
      handler: handleDraftSocialPost as MCPToolDefinition["handler"],
    },
    {
      name: "review_post",
      description: "Review a draft post against brand guidelines and platform best practices.",
      inputSchema: ReviewPostSchema,
      handler: handleReviewPost as MCPToolDefinition["handler"],
    },
    {
      name: "log_community_event",
      description: "Log a community event such as new member joins, disputes, moderation actions, or highlights.",
      inputSchema: LogCommunityEventSchema,
      handler: handleLogCommunityEvent as MCPToolDefinition["handler"],
    },
    {
      name: "get_community_health",
      description: "Get community health metrics including event counts, unresolved issues, and trends.",
      inputSchema: GetCommunityHealthSchema,
      handler: handleGetCommunityHealth as MCPToolDefinition["handler"],
    },
    {
      name: "create_feed_config",
      description: "Create a feed configuration to monitor a social media account for engagement (mentions, replies, quote tweets). Notifications are sent to configured Discord/Telegram/Slack channels.",
      inputSchema: CreateFeedConfigSchema,
      handler: handleCreateFeedConfig as MCPToolDefinition["handler"],
    },
    {
      name: "update_feed_config",
      description: "Update a feed configuration's settings including enabled status and notification channels.",
      inputSchema: UpdateFeedConfigSchema,
      handler: handleUpdateFeedConfig as MCPToolDefinition["handler"],
    },
    {
      name: "delete_feed_config",
      description: "Delete a feed configuration and stop monitoring.",
      inputSchema: z.object({ configId: z.string().uuid() }),
      handler: handleDeleteFeedConfig as MCPToolDefinition["handler"],
    },
    {
      name: "list_feed_configs",
      description: "List all feed configurations for monitoring social accounts.",
      inputSchema: ListFeedConfigsSchema,
      handler: handleListFeedConfigs as MCPToolDefinition["handler"],
    },
    {
      name: "list_engagements",
      description: "List engagement events (mentions, replies, quote tweets) from monitored feeds.",
      inputSchema: ListEngagementsSchema,
      handler: handleListEngagements as MCPToolDefinition["handler"],
    },
    {
      name: "get_engagement",
      description: "Get detailed information about a specific engagement event.",
      inputSchema: z.object({ engagementId: z.string().uuid() }),
      handler: handleGetEngagement as MCPToolDefinition["handler"],
    },
    {
      name: "list_pending_replies",
      description: "List pending reply confirmations waiting for approval.",
      inputSchema: ListPendingRepliesSchema,
      handler: handleListPendingReplies as MCPToolDefinition["handler"],
    },
    {
      name: "confirm_reply",
      description: "Confirm and send a pending reply to an external platform.",
      inputSchema: ConfirmReplySchema,
      handler: handleConfirmReply as MCPToolDefinition["handler"],
    },
    {
      name: "reject_reply",
      description: "Reject a pending reply - it will not be sent.",
      inputSchema: z.object({ 
        confirmationId: z.string().uuid(),
        reason: z.string().optional().describe("Reason for rejection"),
      }),
      handler: handleRejectReply as MCPToolDefinition["handler"],
    },
    {
      name: "send_manual_reply",
      description: "Create a manual reply to a post on an external platform. Requires confirmation before sending.",
      inputSchema: SendManualReplySchema,
      handler: handleSendManualReply as MCPToolDefinition["handler"],
    },
    {
      name: "poll_feeds",
      description: "Manually trigger polling of all enabled feed configurations for new engagements.",
      inputSchema: z.object({}),
      handler: handlePollFeeds as MCPToolDefinition["handler"],
    },
    {
      name: "process_notifications",
      description: "Process and send notifications for unnotified engagement events.",
      inputSchema: z.object({}),
      handler: handleProcessNotifications as MCPToolDefinition["handler"],
    },
    // SEO Tools
    {
      name: "keyword_research",
      description: "Research keywords using DataForSEO to get search volume, CPC, and competition data.",
      inputSchema: KeywordResearchSchema,
      handler: handleKeywordResearch as MCPToolDefinition["handler"],
    },
    {
      name: "serp_snapshot",
      description: "Take a snapshot of search engine results for a query using SerpApi.",
      inputSchema: SerpSnapshotSchema,
      handler: handleSerpSnapshot as MCPToolDefinition["handler"],
    },
    {
      name: "generate_seo_meta",
      description: "Generate SEO meta tags (title, description, keywords) for a page using Claude.",
      inputSchema: SeoPageSchema,
      handler: handleGenerateSeoMeta as MCPToolDefinition["handler"],
    },
    {
      name: "generate_seo_schema",
      description: "Generate JSON-LD structured data schema for a page using Claude.",
      inputSchema: SeoPageSchema,
      handler: handleGenerateSeoSchema as MCPToolDefinition["handler"],
    },
    {
      name: "publish_seo_bundle",
      description: "Generate complete SEO bundle (meta + schema) and submit to IndexNow for indexing.",
      inputSchema: SeoPageSchema,
      handler: handlePublishSeoBundle as MCPToolDefinition["handler"],
    },
    {
      name: "submit_to_index",
      description: "Submit a URL to IndexNow for immediate search engine indexing.",
      inputSchema: IndexNowSchema,
      handler: handleIndexNow as MCPToolDefinition["handler"],
    },
    {
      name: "seo_health_check",
      description: "Check SEO health of a page (status, robots, canonical).",
      inputSchema: SeoHealthCheckSchema,
      handler: handleSeoHealthCheck as MCPToolDefinition["handler"],
    },
    {
      name: "get_seo_request",
      description: "Get the status and artifacts of an SEO request.",
      inputSchema: GetSeoRequestSchema,
      handler: handleGetSeoRequest as MCPToolDefinition["handler"],
    },
    // Advertising Tools
    {
      name: "list_ad_accounts",
      description: "List connected advertising accounts (Meta, Google, TikTok).",
      inputSchema: OrgListAdAccountsSchema,
      handler: handleListAdAccounts as MCPToolDefinition["handler"],
    },
    {
      name: "list_campaigns",
      description: "List advertising campaigns with optional filters.",
      inputSchema: OrgListCampaignsSchema,
      handler: handleListCampaigns as MCPToolDefinition["handler"],
    },
    {
      name: "create_campaign",
      description: "Create a new advertising campaign. Requires an ad account and allocates budget from credits.",
      inputSchema: OrgCreateCampaignSchema,
      handler: handleCreateCampaign as MCPToolDefinition["handler"],
    },
    {
      name: "start_campaign",
      description: "Start/activate a paused or pending advertising campaign.",
      inputSchema: OrgCampaignActionSchema,
      handler: handleStartCampaign as MCPToolDefinition["handler"],
    },
    {
      name: "pause_campaign",
      description: "Pause an active advertising campaign.",
      inputSchema: OrgCampaignActionSchema,
      handler: handlePauseCampaign as MCPToolDefinition["handler"],
    },
    {
      name: "delete_campaign",
      description: "Delete an advertising campaign. Unused budget is refunded to credits.",
      inputSchema: OrgCampaignActionSchema,
      handler: handleDeleteCampaign as MCPToolDefinition["handler"],
    },
    {
      name: "get_campaign_analytics",
      description: "Get performance metrics for an advertising campaign (spend, impressions, clicks, conversions).",
      inputSchema: OrgGetCampaignAnalyticsSchema,
      handler: handleGetCampaignAnalytics as MCPToolDefinition["handler"],
    },
    {
      name: "get_ad_stats",
      description: "Get overall advertising statistics across all campaigns.",
      inputSchema: z.object({ platform: AdPlatformSchema.optional() }),
      handler: handleGetAdStats as MCPToolDefinition["handler"],
    },
    {
      name: "create_creative",
      description: "Create an ad creative (image, video, carousel) for a campaign.",
      inputSchema: OrgCreateCreativeSchema,
      handler: handleCreateCreative as MCPToolDefinition["handler"],
    },
    // Analytics Tools
    {
      name: "get_usage_overview",
      description: "Get usage analytics overview with summary, trends, and top providers/models.",
      inputSchema: UsageOverviewSchema,
      handler: handleGetUsageOverview as MCPToolDefinition["handler"],
    },
    {
      name: "get_cost_breakdown",
      description: "Get cost breakdown by model, provider, user, or API key.",
      inputSchema: CostBreakdownSchema,
      handler: handleGetCostBreakdown as MCPToolDefinition["handler"],
    },
    {
      name: "get_usage_trends",
      description: "Get usage trends over time with configurable granularity.",
      inputSchema: UsageTrendsSchema,
      handler: handleGetUsageTrends as MCPToolDefinition["handler"],
    },
    {
      name: "get_provider_stats",
      description: "Get usage statistics broken down by AI provider.",
      inputSchema: z.object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      }),
      handler: handleGetProviderStats as MCPToolDefinition["handler"],
    },
    // Secrets Management Tools
    {
      name: "list_secrets",
      description: "List all stored secrets (names only, not values) for the organization.",
      inputSchema: z.object({}),
      handler: handleListSecrets as MCPToolDefinition["handler"],
    },
    {
      name: "store_secret",
      description: "Store a new secret (API key, token, etc.) securely encrypted.",
      inputSchema: StoreSecretSchema,
      handler: handleStoreSecret as MCPToolDefinition["handler"],
    },
    {
      name: "list_oauth_connections",
      description: "List OAuth connections (social platforms, ad platforms, etc.).",
      inputSchema: z.object({}),
      handler: handleListOAuthConnections as MCPToolDefinition["handler"],
    },
    // Community Moderation Tools
    ...communityModerationTools,
  ],

  resources: [
    {
      uri: "org://todos",
      name: "Organization Todos",
      description: "All todos for the organization",
      mimeType: "application/json",
      handler: async (uri, context) => {
        const { todos } = await tasksService.list({
          organizationId: context.organizationId,
          limit: 100,
        });
        return { todos };
      },
    },
    {
      uri: "org://checkins",
      name: "Check-in Schedules",
      description: "All check-in schedules for the organization",
      mimeType: "application/json",
      handler: async (uri, context) => {
        const schedules = await checkinsService.listSchedules(
          context.organizationId
        );
        return { schedules };
      },
    },
    {
      uri: "org://platforms",
      name: "Platform Connections",
      description: "Connected platforms (Discord, Telegram) for the organization",
      mimeType: "application/json",
      handler: async (uri, context) => {
        const connections = await botsService.getConnections(
          context.organizationId
        );
        return { platforms: connections };
      },
    },
    {
      uri: "org://feeds",
      name: "Social Feed Configs",
      description: "Feed configurations for monitoring social media accounts",
      mimeType: "application/json",
      handler: async (uri, context) => {
        const { configs } = await feedConfigService.list({
          organizationId: context.organizationId,
          limit: 100,
        });
        return { feeds: configs };
      },
    },
    {
      uri: "org://engagements",
      name: "Recent Engagements",
      description: "Recent engagement events from monitored social accounts",
      mimeType: "application/json",
      handler: async (uri, context) => {
        const { events } = await engagementEventService.list({
          organizationId: context.organizationId,
          limit: 100,
        });
        return { engagements: events };
      },
    },
    {
      uri: "org://pending-replies",
      name: "Pending Reply Confirmations",
      description: "Replies waiting for approval before being sent",
      mimeType: "application/json",
      handler: async (uri, context) => {
        const { confirmations } = await replyConfirmationService.list({
          organizationId: context.organizationId,
          status: "pending",
          limit: 100,
        });
        return { pendingReplies: confirmations };
      },
    },
    {
      uri: "org://ad-accounts",
      name: "Ad Accounts",
      description: "Connected advertising platform accounts",
      mimeType: "application/json",
      handler: async (uri, context) => {
        const accounts = await advertisingService.listAccounts(context.organizationId);
        return { accounts };
      },
    },
    {
      uri: "org://campaigns",
      name: "Ad Campaigns",
      description: "Advertising campaigns across all platforms",
      mimeType: "application/json",
      handler: async (uri, context) => {
        const campaigns = await advertisingService.listCampaigns(context.organizationId);
        return { campaigns };
      },
    },
    {
      uri: "org://analytics",
      name: "Usage Analytics",
      description: "Organization usage analytics overview",
      mimeType: "application/json",
      handler: async (uri, context) => {
        const overview = await analyticsService.getOverview(context.organizationId, "weekly");
        return { analytics: overview };
      },
    },
    {
      uri: "org://secrets",
      name: "Secrets",
      description: "Organization secrets (metadata only)",
      mimeType: "application/json",
      handler: async (uri, context) => {
        const secrets = await secretsService.list(context.organizationId);
        return { secrets: secrets.map(s => ({ id: s.id, name: s.name, scope: s.scope })) };
      },
    },
  ],
};


export default orgMcpServer;

