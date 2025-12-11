/**
 * Org MCP SSE Endpoint
 * 
 * Exposes organization management tools via Streamable HTTP MCP protocol.
 * This allows AI agents to manage todos, check-ins, team members, and reports.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { tasksService } from "@/lib/services/tasks";
import { checkinsService } from "@/lib/services/checkins";
import { botsService } from "@/lib/services/bots";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

// =============================================================================
// TOOL SCHEMAS
// =============================================================================

const CreateTodoSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().datetime().optional(),
  assigneePlatformId: z.string().optional(),
  assigneePlatform: z.enum(["discord", "telegram"]).optional(),
  assigneeName: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const UpdateTodoSchema = z.object({
  todoId: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

const ListTodosSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const CreateCheckinScheduleSchema = z.object({
  serverId: z.string().uuid(),
  name: z.string().min(1).max(200),
  checkinType: z.enum(["standup", "sprint", "mental_health", "project_status", "retrospective"]).optional(),
  frequency: z.enum(["daily", "weekdays", "weekly", "bi_weekly", "monthly"]).optional(),
  timeUtc: z.string().regex(/^\d{2}:\d{2}$/),
  checkinChannelId: z.string().min(1),
  questions: z.array(z.string()).optional(),
});

const RecordCheckinSchema = z.object({
  scheduleId: z.string().uuid(),
  responderPlatformId: z.string().min(1),
  responderPlatform: z.enum(["discord", "telegram"]),
  responderName: z.string().optional(),
  answers: z.record(z.string(), z.string()),
});

const GenerateReportSchema = z.object({
  scheduleId: z.string().uuid(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const TOOLS = [
  {
    name: "create_todo",
    description: "Creates a new todo item or task for the organization.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The title of the todo" },
        description: { type: "string", description: "Detailed description of the task" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priority level" },
        dueDate: { type: "string", description: "Due date in ISO format" },
        assigneePlatformId: { type: "string", description: "Platform user ID of assignee" },
        assigneePlatform: { type: "string", enum: ["discord", "telegram"], description: "Platform of assignee" },
        assigneeName: { type: "string", description: "Display name of assignee" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_todo",
    description: "Updates an existing todo item's details such as status, title, or priority.",
    inputSchema: {
      type: "object",
      properties: {
        todoId: { type: "string", description: "UUID of the todo to update" },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New description" },
        status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"], description: "New status" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "New priority" },
      },
      required: ["todoId"],
    },
  },
  {
    name: "list_todos",
    description: "Lists all todo items with optional filters for status and priority.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"], description: "Filter by status" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Filter by priority" },
        limit: { type: "number", description: "Maximum number of todos to return (default 20)" },
      },
    },
  },
  {
    name: "complete_todo",
    description: "Marks a todo as completed.",
    inputSchema: {
      type: "object",
      properties: {
        todoId: { type: "string", description: "UUID of the todo to complete" },
      },
      required: ["todoId"],
    },
  },
  {
    name: "get_todo_stats",
    description: "Gets statistics about todos including counts by status and overdue items.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_checkin_schedule",
    description: "Creates a new automated check-in schedule for a team or server.",
    inputSchema: {
      type: "object",
      properties: {
        serverId: { type: "string", description: "UUID of the server/group" },
        name: { type: "string", description: "Name of the schedule (e.g., 'Morning Standup')" },
        checkinType: { type: "string", enum: ["standup", "sprint", "mental_health", "project_status", "retrospective"] },
        frequency: { type: "string", enum: ["daily", "weekdays", "weekly", "bi_weekly", "monthly"] },
        timeUtc: { type: "string", description: "Time in HH:MM format (UTC)" },
        checkinChannelId: { type: "string", description: "Channel ID where check-ins will be posted" },
        questions: { type: "array", items: { type: "string" }, description: "Custom questions for the check-in" },
      },
      required: ["serverId", "name", "timeUtc", "checkinChannelId"],
    },
  },
  {
    name: "record_checkin_response",
    description: "Records a team member's check-in response.",
    inputSchema: {
      type: "object",
      properties: {
        scheduleId: { type: "string", description: "UUID of the check-in schedule" },
        responderPlatformId: { type: "string", description: "Platform user ID of responder" },
        responderPlatform: { type: "string", enum: ["discord", "telegram"] },
        responderName: { type: "string", description: "Display name of responder" },
        answers: { type: "object", description: "Answers keyed by question" },
      },
      required: ["scheduleId", "responderPlatformId", "responderPlatform", "answers"],
    },
  },
  {
    name: "list_checkin_schedules",
    description: "Lists all active check-in schedules.",
    inputSchema: {
      type: "object",
      properties: {
        serverId: { type: "string", description: "Optional: filter by server ID" },
      },
    },
  },
  {
    name: "generate_report",
    description: "Generates a comprehensive team productivity report based on check-in data.",
    inputSchema: {
      type: "object",
      properties: {
        scheduleId: { type: "string", description: "UUID of the check-in schedule" },
        startDate: { type: "string", description: "Start date in ISO format" },
        endDate: { type: "string", description: "End date in ISO format" },
      },
      required: ["scheduleId", "startDate", "endDate"],
    },
  },
  {
    name: "add_team_member",
    description: "Adds or updates a team member in the organization.",
    inputSchema: {
      type: "object",
      properties: {
        serverId: { type: "string", description: "UUID of the server" },
        platformUserId: { type: "string", description: "User ID on the platform" },
        platform: { type: "string", enum: ["discord", "telegram"] },
        displayName: { type: "string", description: "Display name" },
        role: { type: "string", description: "Role in the team" },
        isAdmin: { type: "boolean", description: "Whether user is an admin" },
      },
      required: ["serverId", "platformUserId", "platform"],
    },
  },
  {
    name: "list_team_members",
    description: "Lists all team members for a server.",
    inputSchema: {
      type: "object",
      properties: {
        serverId: { type: "string", description: "UUID of the server" },
      },
      required: ["serverId"],
    },
  },
  {
    name: "get_platform_status",
    description: "Gets the status of connected platforms (Discord, Telegram).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// =============================================================================
// HANDLERS
// =============================================================================

async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  organizationId: string,
  userId: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (toolName) {
    case "create_todo": {
      const validated = CreateTodoSchema.parse(args);
      const todo = await tasksService.create({
        organizationId,
        createdByUserId: userId,
        ...validated,
        sourcePlatform: "web",
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, todo }) }],
      };
    }

    case "update_todo": {
      const validated = UpdateTodoSchema.parse(args);
      const { todoId, ...updates } = validated;
      const todo = await tasksService.update(todoId, organizationId, updates);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, todo }) }],
      };
    }

    case "list_todos": {
      const validated = ListTodosSchema.parse(args);
      const { todos, total } = await tasksService.list({
        organizationId,
        ...validated,
        limit: validated.limit || 20,
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, todos, total }) }],
      };
    }

    case "complete_todo": {
      const { todoId } = z.object({ todoId: z.string().uuid() }).parse(args);
      const todo = await tasksService.update(todoId, organizationId, {
        status: "completed",
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, todo }) }],
      };
    }

    case "get_todo_stats": {
      const stats = await tasksService.getStats(organizationId);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, stats }) }],
      };
    }

    case "create_checkin_schedule": {
      const validated = CreateCheckinScheduleSchema.parse(args);
      const schedule = await checkinsService.createSchedule({
        organizationId,
        createdBy: userId,
        ...validated,
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, schedule }) }],
      };
    }

    case "record_checkin_response": {
      const validated = RecordCheckinSchema.parse(args);
      const response = await checkinsService.recordResponse({
        organizationId,
        ...validated,
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, response }) }],
      };
    }

    case "list_checkin_schedules": {
      const { serverId } = z.object({ serverId: z.string().optional() }).parse(args);
      const schedules = serverId
        ? await checkinsService.listServerSchedules(serverId)
        : await checkinsService.listSchedules(organizationId);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, schedules }) }],
      };
    }

    case "generate_report": {
      const validated = GenerateReportSchema.parse(args);
      const report = await checkinsService.generateReport(
        validated.scheduleId,
        organizationId,
        {
          start: new Date(validated.startDate),
          end: new Date(validated.endDate),
        }
      );
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, report }) }],
      };
    }

    case "add_team_member": {
      const validated = z.object({
        serverId: z.string().uuid(),
        platformUserId: z.string().min(1),
        platform: z.enum(["discord", "telegram"]),
        displayName: z.string().optional(),
        role: z.string().optional(),
        isAdmin: z.boolean().optional(),
      }).parse(args);

      const member = await checkinsService.upsertTeamMember({
        organizationId,
        ...validated,
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, member }) }],
      };
    }

    case "list_team_members": {
      const { serverId } = z.object({ serverId: z.string().uuid() }).parse(args);
      const members = await checkinsService.getTeamMembers(serverId);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, members }) }],
      };
    }

    case "get_platform_status": {
      const connections = await botsService.getConnections(organizationId);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            platforms: connections.map((c) => ({
              platform: c.platform,
              status: c.status,
              botUsername: c.platform_bot_username,
              serverCount: 0, // Would need to count from servers
            })),
          }),
        }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// =============================================================================
// MCP PROTOCOL HANDLERS
// =============================================================================

export async function GET(request: NextRequest) {
  // Return server info for discovery
  return NextResponse.json({
    protocolVersion: "2024-11-05",
    serverInfo: {
      name: "org-tools",
      version: "1.0.0",
    },
    capabilities: {
      tools: {},
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(request);

    if (!user.organization_id) {
      return NextResponse.json(
        { error: "Organization required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { method, params, id } = body;

    switch (method) {
      case "initialize":
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "org-tools",
              version: "1.0.0",
            },
            capabilities: {
              tools: {},
            },
          },
        });

      case "tools/list":
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: { tools: TOOLS },
        });

      case "tools/call":
        const { name, arguments: args } = params;
        const result = await handleToolCall(
          name,
          args || {},
          user.organization_id,
          user.id
        );
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result,
        });

      default:
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        });
    }
  } catch (error) {
    logger.error("[Org MCP] Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32602,
          message: "Invalid params",
          data: error.errors,
        },
      });
    }

    return NextResponse.json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error",
      },
    });
  }
}

