"use client";

import { useState } from "react";
import { Check, Circle, Flame, Star, AlertTriangle, Clock, Trash2, Edit2 } from "lucide-react";
import { cn, formatRelativeDate, isOverdue, getPriorityColor } from "@/lib/utils";
import type { Task } from "@/lib/types";

interface TaskCardProps {
  task: Task;
  onComplete: (taskId: string) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onEdit?: (task: Task) => void;
}

export function TaskCard({ task, onComplete, onDelete, onEdit }: TaskCardProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleComplete = async () => {
    if (task.completed || isCompleting) return;
    setIsCompleting(true);
    await onComplete(task.id);
    setIsCompleting(false);
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    await onDelete(task.id);
  };

  const dueDate = task.metadata.dueDate;
  const overdue = dueDate && !task.completed && isOverdue(dueDate);

  return (
    <div className={cn(
      "group p-4 rounded-xl border transition-all",
      task.completed ? "bg-card/50 border-border/50 opacity-60" : "bg-card border-border hover:border-primary/50"
    )}>
      <div className="flex items-start gap-3">
        <button
          onClick={handleComplete}
          disabled={task.completed || isCompleting}
          className={cn(
            "mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
            task.completed ? "bg-primary border-primary" : "border-muted-foreground/50 hover:border-primary"
          )}
        >
          {isCompleting ? (
            <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : task.completed ? (
            <Check className="h-3.5 w-3.5 text-primary-foreground" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("font-medium", task.completed && "line-through text-muted-foreground")}>
              {task.name}
            </span>
            {task.type === "daily" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 text-xs font-medium">
                <Flame className="h-3 w-3" />{task.metadata.streak || 0}
              </span>
            )}
            {task.type === "aspirational" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500 text-xs font-medium">
                <Star className="h-3 w-3" />Goal
              </span>
            )}
            {task.type === "one-off" && task.priority && (
              <span className={cn("text-xs font-medium", getPriorityColor(task.priority))}>P{task.priority}</span>
            )}
            {task.urgent && <AlertTriangle className="h-4 w-4 text-red-500" />}
          </div>

          {task.metadata.description && (
            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{task.metadata.description}</p>
          )}

          {dueDate && (
            <div className={cn("inline-flex items-center gap-1 text-xs", overdue ? "text-red-500" : "text-muted-foreground")}>
              <Clock className="h-3 w-3" />{formatRelativeDate(dueDate)}{overdue && " (Overdue)"}
            </div>
          )}

          {task.completed && task.metadata.pointsAwarded && (
            <div className="text-xs text-green-500 mt-1">+{task.metadata.pointsAwarded} points</div>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && !task.completed && (
            <button onClick={() => onEdit(task)} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <Edit2 className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          <button onClick={handleDelete} disabled={isDeleting} className="p-2 rounded-lg hover:bg-destructive/10 transition-colors">
            <Trash2 className={cn("h-4 w-4", isDeleting ? "text-muted-foreground animate-pulse" : "text-destructive")} />
          </button>
        </div>
      </div>
    </div>
  );
}
