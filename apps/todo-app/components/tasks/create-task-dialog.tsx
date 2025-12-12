"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Task, TaskType, TaskPriority } from "@/lib/types";

interface CreateTaskDialogProps {
  onCreateTask: (task: Omit<Task, "id">) => Promise<void>;
  defaultType?: TaskType;
}

export function CreateTaskDialog({
  onCreateTask,
  defaultType = "one-off",
}: CreateTaskDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<TaskType>(defaultType);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(3);
  const [urgent, setUrgent] = useState(false);
  const [dueDate, setDueDate] = useState("");

  const resetForm = () => {
    setName("");
    setType(defaultType);
    setDescription("");
    setPriority(3);
    setUrgent(false);
    setDueDate("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);

    const task: Omit<Task, "id"> = {
      name: name.trim(),
      type,
      priority: type === "one-off" ? priority : undefined,
      urgent: type === "one-off" ? urgent : undefined,
      completed: false,
      metadata: {
        description: description.trim() || undefined,
        dueDate: dueDate || undefined,
        streak: type === "daily" ? 0 : undefined,
      },
    };

    await onCreateTask(task);
    setIsSubmitting(false);
    resetForm();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Task
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Task name */}
          <div>
            <label className="text-sm font-medium mb-2 block">Task Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What do you need to do?"
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border focus:border-primary focus:outline-none transition-colors"
              autoFocus
            />
          </div>

          {/* Task type */}
          <div>
            <label className="text-sm font-medium mb-2 block">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(["daily", "one-off", "aspirational"] as TaskType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    type === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "daily"
                    ? "Daily Habit"
                    : t === "one-off"
                      ? "One-off"
                      : "Goal"}
                </button>
              ))}
            </div>
          </div>

          {/* Priority (only for one-off) */}
          {type === "one-off" && (
            <div>
              <label className="text-sm font-medium mb-2 block">Priority</label>
              <div className="grid grid-cols-4 gap-2">
                {([1, 2, 3, 4] as TaskPriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      priority === p
                        ? p === 1
                          ? "bg-red-500 text-white"
                          : p === 2
                            ? "bg-orange-500 text-white"
                            : p === 3
                              ? "bg-yellow-500 text-black"
                              : "bg-gray-500 text-white"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    P{p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Urgent checkbox (only for one-off) */}
          {type === "one-off" && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
                className="w-4 h-4 rounded border-border"
              />
              <span className="text-sm">Mark as Urgent (+10 bonus points)</span>
            </label>
          )}

          {/* Description */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border focus:border-primary focus:outline-none transition-colors resize-none"
            />
          </div>

          {/* Due date (not for daily) */}
          {type !== "daily" && (
            <div>
              <label className="text-sm font-medium mb-2 block">
                Due Date (optional)
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border focus:border-primary focus:outline-none transition-colors"
              />
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
