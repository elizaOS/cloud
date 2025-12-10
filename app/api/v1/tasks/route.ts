/**
 * Tasks API - Task management across web, Discord, Telegram
 *
 * Works via session, API key, or app token auth.
 *
 * GET  /api/v1/tasks - List tasks
 * POST /api/v1/tasks - Create task
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { tasksService } from "@/lib/services/tasks";
import { logger } from "@/lib/utils/logger";

const CreateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().datetime().optional(),
  assigneePlatformId: z.string().optional(),
  assigneePlatform: z.enum(["discord", "telegram"]).optional(),
  assigneeName: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sourcePlatform: z.enum(["web", "discord", "telegram"]).optional(),
  sourceServerId: z.string().optional(),
  sourceChannelId: z.string().optional(),
  sourceMessageId: z.string().optional(),
  relatedProject: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const params = Object.fromEntries(request.nextUrl.searchParams);

  const todos = await tasksService.list(user.organization_id, {
    status: params.status?.split(",") as ("pending" | "in_progress" | "completed" | "cancelled")[],
    priority: params.priority?.split(",") as ("low" | "medium" | "high" | "urgent")[],
    assigneePlatformId: params.assigneePlatformId,
    tags: params.tags?.split(","),
    limit: params.limit ? parseInt(params.limit) : undefined,
    offset: params.offset ? parseInt(params.offset) : undefined,
    search: params.search,
  });

  return NextResponse.json({
    tasks: todos.items.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueDate: t.due_date?.toISOString(),
      assigneePlatformId: t.assignee_platform_id,
      assigneePlatform: t.assignee_platform,
      assigneeName: t.assignee_name,
      tags: t.tags,
      createdAt: t.created_at.toISOString(),
      updatedAt: t.updated_at.toISOString(),
      completedAt: t.completed_at?.toISOString(),
    })),
    total: todos.total,
    hasMore: todos.hasMore,
  });
}

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });

  const data = parsed.data;
  const todo = await tasksService.create({
    organizationId: user.organization_id,
    title: data.title,
    description: data.description,
    priority: data.priority as "low" | "medium" | "high" | "urgent" | undefined,
    dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    assigneePlatformId: data.assigneePlatformId,
    assigneePlatform: data.assigneePlatform as "discord" | "telegram" | undefined,
    assigneeName: data.assigneeName,
    tags: data.tags,
    sourcePlatform: data.sourcePlatform as "web" | "discord" | "telegram" | undefined,
    sourceServerId: data.sourceServerId,
    sourceChannelId: data.sourceChannelId,
    sourceMessageId: data.sourceMessageId,
    createdByUserId: user.id,
    relatedProject: data.relatedProject,
  });

  logger.info("[Tasks] Created", { taskId: todo.id, userId: user.id });

  return NextResponse.json({
    task: {
      id: todo.id,
      title: todo.title,
      status: todo.status,
      priority: todo.priority,
      createdAt: todo.created_at.toISOString(),
    },
  }, { status: 201 });
}

