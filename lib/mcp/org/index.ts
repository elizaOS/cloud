/**
 * Organization MCP Server
 *
 * MCP server that exposes org management tools for team coordination,
 * check-ins, todos, and platform management. These tools can be used
 * by AI agents to manage organizational workflows.
 *
 * This is the MCP equivalent of the-org's agent actions, allowing any
 * AI agent to access org management capabilities via MCP protocol.
 */

import { z } from "zod";
import { tasksService, TodoPriority, TodoStatus } from "@/lib/services/tasks";
import { checkinsService, CheckinType, CheckinFrequency } from "@/lib/services/checkins";
import { botsService } from "@/lib/services/bots";
import { logger } from "@/lib/utils/logger";

// =============================================================================
// TYPES
// =============================================================================

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

// =============================================================================
// TOOL SCHEMAS
// =============================================================================

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

// =============================================================================
// TOOL HANDLERS
// =============================================================================

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

// =============================================================================
// SOCIAL MEDIA TOOLS
// =============================================================================

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

  // Create a todo item for the social post
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
  // Analyze content against guidelines
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check for common issues
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

// =============================================================================
// COMMUNITY MANAGEMENT TOOLS
// =============================================================================

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

  // Store as a todo for tracking
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
  // Get community event todos
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

// =============================================================================
// MCP SERVER DEFINITION
// =============================================================================

export const orgMcpServer: MCPServerDefinition = {
  name: "org-tools",
  version: "1.0.0",
  description:
    "Organization management tools for team coordination, check-ins, todos, and platform management. Enables AI agents to manage organizational workflows across Discord, Telegram, and web interfaces.",

  tools: [
    // Todo Management
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

    // Check-in Management
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

    // Team Management
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

    // Platform Management
    {
      name: "get_platform_status",
      description: "Get the connection status of platforms (Discord, Telegram) and their servers.",
      inputSchema: GetPlatformStatusSchema,
      handler: handleGetPlatformStatus as MCPToolDefinition["handler"],
    },

    // Social Media Tools
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

    // Community Management Tools
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
  ],
};

// =============================================================================
// EXPORTS
// =============================================================================

export default orgMcpServer;

