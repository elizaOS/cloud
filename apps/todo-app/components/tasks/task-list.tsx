"use client";

import { TaskCard } from "./task-card";
import type { Task } from "@/lib/types";
import { Inbox } from "lucide-react";

interface TaskListProps {
  tasks: Task[];
  onComplete: (taskId: string) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onEdit?: (task: Task) => void;
  emptyMessage?: string;
}

export function TaskList({
  tasks,
  onComplete,
  onDelete,
  onEdit,
  emptyMessage = "No tasks yet",
}: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Inbox className="h-12 w-12 mb-4 opacity-50" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onComplete={onComplete}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
