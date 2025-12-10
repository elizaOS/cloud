/**
 * Individual Task API
 *
 * GET    /api/v1/tasks/[taskId] - Get task details
 * PATCH  /api/v1/tasks/[taskId] - Update task
 * DELETE /api/v1/tasks/[taskId] - Delete task
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { tasksService } from "@/lib/services/tasks";
import { logger } from "@/lib/utils/logger";

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { taskId } = await params;

  const todo = await tasksService.get(taskId, user.organization_id);
  if (!todo) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  return NextResponse.json({
    task: {
      id: todo.id,
      title: todo.title,
      description: todo.description,
      status: todo.status,
      priority: todo.priority,
      dueDate: todo.due_date?.toISOString(),
      assigneePlatformId: todo.assignee_platform_id,
      assigneePlatform: todo.assignee_platform,
      assigneeName: todo.assignee_name,
      tags: todo.tags,
      sourcePlatform: todo.source_platform,
      createdAt: todo.created_at.toISOString(),
      updatedAt: todo.updated_at.toISOString(),
      completedAt: todo.completed_at?.toISOString(),
    },
  });
}

const UpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  assigneePlatformId: z.string().optional().nullable(),
  assigneePlatform: z.enum(["discord", "telegram"]).optional().nullable(),
  assigneeName: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { taskId } = await params;

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const todo = await tasksService.update(taskId, user.organization_id, {
    ...parsed.data,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : parsed.data.dueDate === null ? null : undefined,
  });

  if (!todo) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  logger.info("[Tasks] Updated", { taskId, userId: user.id });

  return NextResponse.json({
    task: {
      id: todo.id,
      title: todo.title,
      status: todo.status,
      updatedAt: todo.updated_at.toISOString(),
    },
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { taskId } = await params;

  const deleted = await tasksService.delete(taskId, user.organization_id);
  if (!deleted) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  logger.info("[Tasks] Deleted", { taskId, userId: user.id });
  return NextResponse.json({ success: true });
}

