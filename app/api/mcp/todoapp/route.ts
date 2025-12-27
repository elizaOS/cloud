/**
 * Todo App MCP Endpoint
 *
 * Provides task management tools via MCP (Model Context Protocol).
 * Uses the app storage API for persistence.
 *
 * Tools:
 * - create_task: Create a new task
 * - list_tasks: List tasks with filters
 * - complete_task: Mark a task as complete
 * - update_task: Update task properties
 * - delete_task: Delete a task
 * - get_points: Get user points and level
 *
 * GET /api/mcp/todoapp - Returns MCP server metadata
 * POST /api/mcp/todoapp - MCP JSON-RPC handler
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { appStorageService } from "@/lib/services/app-storage";
import { appsService } from "@/lib/services/apps";
import { twilioService } from "@/lib/services/twilio";
import { googleCalendarService } from "@/lib/services/google-calendar";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 30;

const TASKS_COLLECTION = "tasks";
const POINTS_COLLECTION = "user_points";

const LEVELS = [
  { level: 1, name: "Beginner", threshold: 0 },
  { level: 2, name: "Apprentice", threshold: 100 },
  { level: 3, name: "Journeyman", threshold: 300 },
  { level: 4, name: "Expert", threshold: 600 },
  { level: 5, name: "Master", threshold: 1000 },
  { level: 6, name: "Grandmaster", threshold: 1500 },
  { level: 7, name: "Legend", threshold: 2200 },
  { level: 8, name: "Mythic", threshold: 3000 },
  { level: 9, name: "Immortal", threshold: 4000 },
  { level: 10, name: "Transcendent", threshold: 5500 },
];

interface Task {
  id: string;
  name: string;
  type: "daily" | "one-off" | "aspirational";
  priority?: 1 | 2 | 3 | 4;
  urgent?: boolean;
  completed: boolean;
  metadata: {
    description?: string;
    dueDate?: string;
    streak?: number;
    completedAt?: string;
    pointsAwarded?: number;
  };
}

// ============================================
// Schemas
// ============================================

const MCPRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
  id: z.union([z.string(), z.number()]),
});

// ============================================
// Helpers
// ============================================

function calculateLevel(points: number): { level: number; name: string } {
  let currentLevel = LEVELS[0];
  for (const level of LEVELS) {
    if (points >= level.threshold) {
      currentLevel = level;
    }
  }
  return {
    level: currentLevel?.level ?? 1,
    name: currentLevel?.name ?? "Beginner",
  };
}

function calculatePoints(task: Task): number {
  if (task.type === "daily") {
    const streak = Math.max(0, task.metadata.streak ?? 0);
    return 10 + Math.min(streak * 5, 50);
  }
  if (task.type === "one-off") {
    const priorityPoints = task.priority ? (5 - task.priority) * 10 : 10;
    return priorityPoints + (task.urgent ? 10 : 0);
  }
  if (task.type === "aspirational") {
    return 50;
  }
  return 0;
}

interface StorageDocument {
  id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function documentToTask(doc: StorageDocument): Task {
  return {
    id: doc.id,
    name: doc.data.name as string,
    type: doc.data.type as Task["type"],
    priority: doc.data.priority as Task["priority"],
    urgent: doc.data.urgent as boolean | undefined,
    completed: doc.data.completed as boolean,
    metadata: (doc.data.metadata as Task["metadata"]) ?? {},
  };
}

function formatTaskList(tasks: Task[]): string {
  if (tasks.length === 0) {
    return "No tasks found.";
  }

  return tasks
    .map((task) => {
      let details = `- ${task.name}`;
      if (task.type === "daily") {
        details += ` (Daily, Streak: ${task.metadata.streak ?? 0})`;
      } else if (task.type === "one-off") {
        details += ` (P${task.priority ?? 4}${task.urgent ? ", Urgent" : ""})`;
        if (task.metadata.dueDate) {
          details += ` Due: ${new Date(task.metadata.dueDate).toLocaleDateString()}`;
        }
      } else if (task.type === "aspirational") {
        details += " (Goal)";
      }
      if (task.completed) {
        details += " ✓";
      }
      return details;
    })
    .join("\n");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Api-Key, X-App-Token",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return NextResponse.json(
    {
      name: "Todo App MCP",
      description:
        "Task management with gamification - create tasks, track points, level up!",
      version: "1.0.0",
      protocol: "2024-11-05",
      capabilities: {
        tools: {},
      },
      endpoints: {
        mcp: `${baseUrl}/api/mcp/todoapp`,
      },
      tools: [
        {
          name: "create_task",
          description:
            "Create a new task (daily habit, one-off, or aspirational goal)",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Task name" },
              type: {
                type: "string",
                enum: ["daily", "one-off", "aspirational"],
                description: "Task type",
              },
              description: { type: "string", description: "Task description" },
              priority: {
                type: "number",
                minimum: 1,
                maximum: 4,
                description: "Priority (1-4)",
              },
              urgent: { type: "boolean", description: "Is urgent" },
              dueDate: { type: "string", description: "Due date (ISO format)" },
            },
            required: ["name", "type"],
          },
        },
        {
          name: "list_tasks",
          description: "List tasks with optional filters",
          inputSchema: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["daily", "one-off", "aspirational", "all"],
                description: "Filter by type",
              },
              completed: {
                type: "boolean",
                description: "Filter by completion",
              },
            },
          },
        },
        {
          name: "complete_task",
          description: "Mark a task as complete and earn points",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Task ID" },
            },
            required: ["id"],
          },
        },
        {
          name: "update_task",
          description: "Update task properties",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Task ID" },
              name: { type: "string" },
              description: { type: "string" },
              priority: { type: "number" },
              urgent: { type: "boolean" },
              dueDate: { type: "string" },
            },
            required: ["id"],
          },
        },
        {
          name: "delete_task",
          description: "Delete a task",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Task ID" },
            },
            required: ["id"],
          },
        },
        {
          name: "get_points",
          description: "Get user points, level, and streak",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "send_sms_reminder",
          description:
            "Send an SMS reminder for a task (requires Twilio setup)",
          inputSchema: {
            type: "object",
            properties: {
              taskId: {
                type: "string",
                description: "Task ID to remind about",
              },
              phoneNumber: {
                type: "string",
                description: "Phone number in E.164 format (+1234567890)",
              },
              message: {
                type: "string",
                description: "Custom message (optional)",
              },
            },
            required: ["taskId", "phoneNumber"],
          },
        },
        {
          name: "add_to_calendar",
          description:
            "Add a task to Google Calendar (requires Google Calendar connection)",
          inputSchema: {
            type: "object",
            properties: {
              taskId: {
                type: "string",
                description: "Task ID to add to calendar",
              },
              startTime: {
                type: "string",
                description: "Start time (ISO format)",
              },
              durationMinutes: {
                type: "number",
                description: "Duration in minutes (default: 60)",
              },
              reminderMinutes: {
                type: "number",
                description: "Reminder before event in minutes (default: 30)",
              },
            },
            required: ["taskId"],
          },
        },
        {
          name: "set_reminder",
          description: "Set an in-app reminder for a task",
          inputSchema: {
            type: "object",
            properties: {
              taskId: { type: "string", description: "Task ID" },
              reminderTime: {
                type: "string",
                description: "When to remind (ISO format)",
              },
              repeatDaily: {
                type: "boolean",
                description: "Repeat reminder daily",
              },
            },
            required: ["taskId", "reminderTime"],
          },
        },
      ],
    },
    { headers: corsHeaders },
  );
}

// ============================================
// POST - MCP JSON-RPC Handler
// ============================================

export async function POST(request: NextRequest) {
  // Authenticate - supports both app tokens and API keys
  let user;
  try {
    const result = await requireAuthOrApiKeyWithOrg(request);
    user = result.user;
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32002, message: "Authentication required" },
        id: null,
      },
      { status: 401, headers: corsHeaders },
    );
  }

  // Get app for user
  const apps = await appsService.listByOrganization(user.organization_id);
  const app = apps[0];
  if (!app) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: "No app found" },
        id: null,
      },
      { status: 404, headers: corsHeaders },
    );
  }

  // Parse request
  const body = await request.json();
  const validation = MCPRequestSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      },
      { status: 400, headers: corsHeaders },
    );
  }

  const { method, params, id: rpcId } = validation.data;

  // Handle MCP methods
  switch (method) {
    case "initialize":
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "todo-app-mcp",
              version: "1.0.0",
            },
            capabilities: {
              tools: {},
            },
          },
          id: rpcId,
        },
        { headers: corsHeaders },
      );

    case "tools/list":
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          result: {
            tools: [
              {
                name: "create_task",
                description: "Create a new task",
                inputSchema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    type: {
                      type: "string",
                      enum: ["daily", "one-off", "aspirational"],
                    },
                    description: { type: "string" },
                    priority: { type: "number" },
                    urgent: { type: "boolean" },
                    dueDate: { type: "string" },
                  },
                  required: ["name", "type"],
                },
              },
              {
                name: "list_tasks",
                description: "List tasks",
                inputSchema: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    completed: { type: "boolean" },
                  },
                },
              },
              {
                name: "complete_task",
                description: "Complete a task",
                inputSchema: {
                  type: "object",
                  properties: { id: { type: "string" } },
                  required: ["id"],
                },
              },
              {
                name: "update_task",
                description: "Update a task",
                inputSchema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    description: { type: "string" },
                    priority: { type: "number" },
                    urgent: { type: "boolean" },
                    dueDate: { type: "string" },
                  },
                  required: ["id"],
                },
              },
              {
                name: "delete_task",
                description: "Delete a task",
                inputSchema: {
                  type: "object",
                  properties: { id: { type: "string" } },
                  required: ["id"],
                },
              },
              {
                name: "get_points",
                description: "Get points and level",
                inputSchema: { type: "object", properties: {} },
              },
              {
                name: "send_sms_reminder",
                description: "Send an SMS reminder for a task",
                inputSchema: {
                  type: "object",
                  properties: {
                    taskId: { type: "string" },
                    phoneNumber: { type: "string" },
                    message: { type: "string" },
                  },
                  required: ["taskId", "phoneNumber"],
                },
              },
              {
                name: "add_to_calendar",
                description: "Add task to Google Calendar",
                inputSchema: {
                  type: "object",
                  properties: {
                    taskId: { type: "string" },
                    startTime: { type: "string" },
                    durationMinutes: { type: "number" },
                    reminderMinutes: { type: "number" },
                  },
                  required: ["taskId"],
                },
              },
              {
                name: "set_reminder",
                description: "Set an in-app reminder",
                inputSchema: {
                  type: "object",
                  properties: {
                    taskId: { type: "string" },
                    reminderTime: { type: "string" },
                    repeatDaily: { type: "boolean" },
                  },
                  required: ["taskId", "reminderTime"],
                },
              },
            ],
          },
          id: rpcId,
        },
        { headers: corsHeaders },
      );

    case "tools/call":
      return handleToolCall(
        app.id,
        user.id,
        user.organization_id,
        params ?? {},
        rpcId,
      );

    case "ping":
      return NextResponse.json(
        { jsonrpc: "2.0", result: {}, id: rpcId },
        { headers: corsHeaders },
      );

    default:
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32601, message: "Method not found" },
          id: rpcId,
        },
        { status: 400, headers: corsHeaders },
      );
  }
}

// ============================================
// Tool Call Handler
// ============================================

async function handleToolCall(
  appId: string,
  userId: string,
  organizationId: string,
  params: Record<string, unknown>,
  rpcId: string | number,
) {
  const { name, arguments: args } = params as {
    name: string;
    arguments: Record<string, unknown>;
  };

  switch (name) {
    case "create_task": {
      const {
        name: taskName,
        type,
        description,
        priority,
        urgent,
        dueDate,
      } = args as {
        name: string;
        type: "daily" | "one-off" | "aspirational";
        description?: string;
        priority?: number;
        urgent?: boolean;
        dueDate?: string;
      };

      const taskData = {
        name: taskName,
        type,
        priority,
        urgent,
        completed: false,
        metadata: {
          description,
          dueDate,
          streak: type === "daily" ? 0 : undefined,
          createdAt: new Date().toISOString(),
        },
      };

      const doc = await appStorageService.insertDocument(
        appId,
        TASKS_COLLECTION,
        taskData,
        userId,
      );

      logger.info("[Todo MCP] Created task", {
        appId,
        taskId: doc.id,
        taskName,
      });

      return NextResponse.json(
        {
          jsonrpc: "2.0",
          result: {
            content: [
              {
                type: "text",
                text: `Created ${type} task: "${taskName}" (ID: ${doc.id})`,
              },
            ],
          },
          id: rpcId,
        },
        { headers: corsHeaders },
      );
    }

    case "list_tasks": {
      const { type, completed } = args as {
        type?: "daily" | "one-off" | "aspirational" | "all";
        completed?: boolean;
      };

      const filter: Record<string, unknown> = {};
      if (type && type !== "all") {
        filter.type = type;
      }
      if (completed !== undefined) {
        filter.completed = completed;
      }

      const { documents } = await appStorageService.queryDocuments(
        appId,
        TASKS_COLLECTION,
        { filter, limit: 100 },
      );

      const tasks = documents.map(documentToTask);
      const formattedList = formatTaskList(tasks);

      return NextResponse.json(
        {
          jsonrpc: "2.0",
          result: {
            content: [{ type: "text", text: formattedList }],
          },
          id: rpcId,
        },
        { headers: corsHeaders },
      );
    }

    case "complete_task": {
      const { id: taskId } = args as { id: string };

      const doc = await appStorageService.getDocument(appId, taskId);
      if (!doc) {
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            error: { code: -32001, message: `Task not found: ${taskId}` },
            id: rpcId,
          },
          { status: 404, headers: corsHeaders },
        );
      }

      const task = documentToTask(doc);

      if (task.completed) {
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            result: {
              content: [
                {
                  type: "text",
                  text: `Task "${task.name}" is already completed`,
                },
              ],
            },
            id: rpcId,
          },
          { headers: corsHeaders },
        );
      }

      // Calculate points
      if (task.type === "daily") {
        task.metadata.streak = (task.metadata.streak ?? 0) + 1;
      }
      const points = calculatePoints(task);

      // Update task
      await appStorageService.updateDocument(
        appId,
        taskId,
        {
          completed: true,
          metadata: {
            ...task.metadata,
            completedAt: new Date().toISOString(),
            pointsAwarded: points,
          },
        },
        userId,
      );

      // Update points
      const { documents: pointsDocs } = await appStorageService.queryDocuments(
        appId,
        POINTS_COLLECTION,
        { limit: 1 },
      );

      let currentPoints = 0;
      let totalEarned = 0;
      let pointsDocId: string | undefined;

      if (pointsDocs[0]) {
        pointsDocId = pointsDocs[0].id;
        currentPoints = (pointsDocs[0].data.currentPoints as number) ?? 0;
        totalEarned = (pointsDocs[0].data.totalEarned as number) ?? 0;
      }

      currentPoints += points;
      totalEarned += points;
      const levelInfo = calculateLevel(currentPoints);

      if (pointsDocId) {
        await appStorageService.updateDocument(
          appId,
          pointsDocId,
          {
            currentPoints,
            totalEarned,
            lastCompletionDate: new Date().toISOString(),
          },
          userId,
        );
      } else {
        await appStorageService.insertDocument(
          appId,
          POINTS_COLLECTION,
          { currentPoints, totalEarned, streak: 0, history: [] },
          userId,
        );
      }

      logger.info("[Todo MCP] Completed task", { appId, taskId, points });

      return NextResponse.json(
        {
          jsonrpc: "2.0",
          result: {
            content: [
              {
                type: "text",
                text: `Completed "${task.name}"! Earned ${points} points. Total: ${currentPoints} (Level ${levelInfo.level}: ${levelInfo.name})`,
              },
            ],
          },
          id: rpcId,
        },
        { headers: corsHeaders },
      );
    }

    case "update_task": {
      const { id: taskId, ...updates } = args as {
        id: string;
        name?: string;
        description?: string;
        priority?: number;
        urgent?: boolean;
        dueDate?: string;
      };

      const doc = await appStorageService.getDocument(appId, taskId);
      if (!doc) {
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            error: { code: -32001, message: `Task not found: ${taskId}` },
            id: rpcId,
          },
          { status: 404, headers: corsHeaders },
        );
      }

      const task = documentToTask(doc);
      const updateData: Record<string, unknown> = {};

      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.priority !== undefined)
        updateData.priority = updates.priority;
      if (updates.urgent !== undefined) updateData.urgent = updates.urgent;
      if (updates.description !== undefined || updates.dueDate !== undefined) {
        updateData.metadata = {
          ...task.metadata,
          ...(updates.description !== undefined && {
            description: updates.description,
          }),
          ...(updates.dueDate !== undefined && { dueDate: updates.dueDate }),
        };
      }

      await appStorageService.updateDocument(appId, taskId, updateData, userId);

      logger.info("[Todo MCP] Updated task", { appId, taskId });

      return NextResponse.json(
        {
          jsonrpc: "2.0",
          result: {
            content: [{ type: "text", text: `Updated task "${task.name}"` }],
          },
          id: rpcId,
        },
        { headers: corsHeaders },
      );
    }

    case "delete_task": {
      const { id: taskId } = args as { id: string };

      const doc = await appStorageService.getDocument(appId, taskId);
      if (!doc) {
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            error: { code: -32001, message: `Task not found: ${taskId}` },
            id: rpcId,
          },
          { status: 404, headers: corsHeaders },
        );
      }

      const task = documentToTask(doc);
      await appStorageService.deleteDocument(appId, taskId, userId);

      logger.info("[Todo MCP] Deleted task", { appId, taskId });

      return NextResponse.json(
        {
          jsonrpc: "2.0",
          result: {
            content: [{ type: "text", text: `Deleted task "${task.name}"` }],
          },
          id: rpcId,
        },
        { headers: corsHeaders },
      );
    }

    case "get_points": {
      const { documents: pointsDocs } = await appStorageService.queryDocuments(
        appId,
        POINTS_COLLECTION,
        { limit: 1 },
      );

      let currentPoints = 0;
      let totalEarned = 0;
      let streak = 0;

      if (pointsDocs[0]) {
        currentPoints = (pointsDocs[0].data.currentPoints as number) ?? 0;
        totalEarned = (pointsDocs[0].data.totalEarned as number) ?? 0;
        streak = (pointsDocs[0].data.streak as number) ?? 0;
      }

      const levelInfo = calculateLevel(currentPoints);

      return NextResponse.json(
        {
          jsonrpc: "2.0",
          result: {
            content: [
              {
                type: "text",
                text: `Points: ${currentPoints}\nLevel: ${levelInfo.level} (${levelInfo.name})\nTotal Earned: ${totalEarned}\nStreak: ${streak} days`,
              },
            ],
          },
          id: rpcId,
        },
        { headers: corsHeaders },
      );
    }

    case "send_sms_reminder": {
      const { taskId, phoneNumber, message } = args as {
        taskId: string;
        phoneNumber: string;
        message?: string;
      };

      const doc = await appStorageService.getDocument(appId, taskId);
      if (!doc) {
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            error: { code: -32001, message: `Task not found: ${taskId}` },
            id: rpcId,
          },
          { status: 404, headers: corsHeaders },
        );
      }

      const task = documentToTask(doc);
      const smsBody =
        message ??
        `Reminder: ${task.name}${task.metadata.dueDate ? ` (Due: ${new Date(task.metadata.dueDate).toLocaleDateString()})` : ""}`;

      const result = await twilioService.sendSms({
        to: phoneNumber,
        body: smsBody,
        organizationId,
      });

      if (!result.success) {
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            error: {
              code: -32002,
              message: result.error ?? "Failed to send SMS",
            },
            id: rpcId,
          },
          { status: 400, headers: corsHeaders },
        );
      }

      logger.info("[Todo MCP] SMS reminder sent", {
        appId,
        taskId,
        phoneNumber,
      });

      return NextResponse.json(
        {
          jsonrpc: "2.0",
          result: {
            content: [
              { type: "text", text: `SMS reminder sent for "${task.name}"` },
            ],
          },
          id: rpcId,
        },
        { headers: corsHeaders },
      );
    }

    case "add_to_calendar": {
      const {
        taskId,
        startTime,
        durationMinutes = 60,
        reminderMinutes = 30,
      } = args as {
        taskId: string;
        startTime?: string;
        durationMinutes?: number;
        reminderMinutes?: number;
      };

      const doc = await appStorageService.getDocument(appId, taskId);
      if (!doc) {
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            error: { code: -32001, message: `Task not found: ${taskId}` },
            id: rpcId,
          },
          { status: 404, headers: corsHeaders },
        );
      }

      const task = documentToTask(doc);
      const eventStart = startTime
        ? new Date(startTime)
        : task.metadata.dueDate
          ? new Date(task.metadata.dueDate)
          : new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow if no date

      const result = await googleCalendarService.createEvent({
        organizationId,
        userId,
        summary: task.name,
        description: task.metadata.description,
        startTime: eventStart,
        endTime: new Date(eventStart.getTime() + durationMinutes * 60 * 1000),
        reminders: [{ minutes: reminderMinutes }],
      });

      if (!result.success) {
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            error: {
              code: -32002,
              message: result.error ?? "Failed to create calendar event",
            },
            id: rpcId,
          },
          { status: 400, headers: corsHeaders },
        );
      }

      logger.info("[Todo MCP] Calendar event created", {
        appId,
        taskId,
        eventId: result.event?.id,
      });

      return NextResponse.json(
        {
          jsonrpc: "2.0",
          result: {
            content: [
              {
                type: "text",
                text: `Added "${task.name}" to Google Calendar on ${eventStart.toLocaleDateString()} at ${eventStart.toLocaleTimeString()}`,
              },
            ],
          },
          id: rpcId,
        },
        { headers: corsHeaders },
      );
    }

    case "set_reminder": {
      const {
        taskId,
        reminderTime,
        repeatDaily = false,
      } = args as {
        taskId: string;
        reminderTime: string;
        repeatDaily?: boolean;
      };

      const doc = await appStorageService.getDocument(appId, taskId);
      if (!doc) {
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            error: { code: -32001, message: `Task not found: ${taskId}` },
            id: rpcId,
          },
          { status: 404, headers: corsHeaders },
        );
      }

      const task = documentToTask(doc);
      const reminder = new Date(reminderTime);

      // Store reminder in task metadata
      await appStorageService.updateDocument(
        appId,
        taskId,
        {
          metadata: {
            ...task.metadata,
            reminder: {
              time: reminder.toISOString(),
              repeatDaily,
              enabled: true,
            },
          },
        },
        userId,
      );

      logger.info("[Todo MCP] Reminder set", { appId, taskId, reminderTime });

      return NextResponse.json(
        {
          jsonrpc: "2.0",
          result: {
            content: [
              {
                type: "text",
                text: `Reminder set for "${task.name}" at ${reminder.toLocaleString()}${repeatDaily ? " (repeating daily)" : ""}`,
              },
            ],
          },
          id: rpcId,
        },
        { headers: corsHeaders },
      );
    }

    default:
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32601, message: `Unknown tool: ${name}` },
          id: rpcId,
        },
        { status: 400, headers: corsHeaders },
      );
  }
}
