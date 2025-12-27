"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Check,
  MessageSquare,
  LogOut,
  RefreshCw,
  Flame,
  Target,
  Star,
  ChevronDown,
  Settings,
} from "lucide-react";

import { useAuth } from "@/lib/use-auth";
import {
  listTasks,
  createTask,
  deleteTask,
  completeTask,
  getUserPoints,
} from "@/lib/cloud-api";
import type { Task, UserPoints } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskList } from "@/components/tasks/task-list";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { LevelBadge } from "@/components/gamification/level-badge";
import { PointsPopup } from "@/components/gamification/points-popup";

const PAGE_SIZE = 20;

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, token, logout } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [points, setPoints] = useState<UserPoints>({
    currentPoints: 0,
    totalEarned: 0,
    streak: 0,
  });
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [earnedPoints, setEarnedPoints] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/");
  }, [isLoading, isAuthenticated, router]);

  const loadData = useCallback(
    async (loadMore = false) => {
      if (!token) return;

      if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoadingData(true);
      }

      const offset = loadMore ? tasks.length : 0;

      const [tasksResult, pointsResult] = await Promise.allSettled([
        listTasks(token, { limit: PAGE_SIZE, offset }),
        loadMore ? Promise.resolve(null) : getUserPoints(token),
      ]);

      if (tasksResult.status === "fulfilled") {
        const { tasks: newTasks, total, hasMore: more } = tasksResult.value;
        if (loadMore) {
          setTasks((prev) => [...prev, ...newTasks]);
        } else {
          setTasks(newTasks);
        }
        setTotalTasks(total);
        setHasMore(more);
      } else {
        toast.error("Failed to load tasks");
        if (!loadMore) setTasks([]);
      }

      if (
        !loadMore &&
        pointsResult.status === "fulfilled" &&
        pointsResult.value
      ) {
        setPoints(pointsResult.value);
      } else if (!loadMore && pointsResult.status === "rejected") {
        toast.error("Failed to load points");
        setPoints({ currentPoints: 0, totalEarned: 0, streak: 0 });
      }

      setIsLoadingData(false);
      setIsLoadingMore(false);
    },
    [token, tasks.length],
  );

  useEffect(() => {
    if (token) loadData();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateTask = async (task: Omit<Task, "id">) => {
    if (!token) return;
    const newTask = await createTask(token, task);
    setTasks((prev) => [newTask, ...prev]);
    setTotalTasks((prev) => prev + 1);
    toast.success(`Created task: ${task.name}`);
  };

  const handleCompleteTask = async (taskId: string) => {
    if (!token) return;
    const result = await completeTask(token, taskId);
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              completed: true,
              metadata: { ...t.metadata, pointsAwarded: result.points },
            }
          : t,
      ),
    );
    setEarnedPoints(result.points);
    const newPoints = await getUserPoints(token);
    setPoints(newPoints);
    toast.success(result.message);
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!token) return;
    await deleteTask(token, taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setTotalTasks((prev) => prev - 1);
    toast.success("Task deleted");
  };

  const filterTasks = (tab: string): Task[] => {
    switch (tab) {
      case "daily":
        return tasks.filter((t) => t.type === "daily" && !t.completed);
      case "tasks":
        return tasks.filter((t) => t.type === "one-off" && !t.completed);
      case "goals":
        return tasks.filter((t) => t.type === "aspirational" && !t.completed);
      case "completed":
        return tasks.filter((t) => t.completed);
      default:
        return tasks.filter((t) => !t.completed);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const incompleteTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  return (
    <div className="min-h-screen bg-background">
      {earnedPoints !== null && (
        <PointsPopup
          points={earnedPoints}
          onComplete={() => setEarnedPoints(null)}
        />
      )}

      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-40 bg-background/80">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center">
              <Check className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">Eliza Todo</span>
          </Link>

          <div className="flex items-center gap-4">
            <LevelBadge points={points} compact />
            <Link
              href="/chat"
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title="Chat with AI"
            >
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            </Link>
            <Link
              href="/settings"
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title="Settings"
            >
              <Settings className="h-5 w-5 text-muted-foreground" />
            </Link>
            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title="Sign out"
            >
              <LogOut className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">
            Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!
          </h1>
          <p className="text-muted-foreground">
            {incompleteTasks.length} tasks remaining • {completedTasks.length}{" "}
            completed
            {totalTasks > tasks.length && ` • ${totalTasks} total`}
          </p>
        </div>

        <div className="mb-8">
          <LevelBadge points={points} />
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Your Tasks</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadData(false)}
              disabled={isLoadingData}
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoadingData ? "animate-spin" : ""}`}
              />
            </Button>
            <CreateTaskDialog onCreateTask={handleCreateTask} />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="all">
              All ({incompleteTasks.length})
            </TabsTrigger>
            <TabsTrigger value="daily" className="flex items-center gap-1">
              <Flame className="h-3 w-3" />
              Daily
            </TabsTrigger>
            <TabsTrigger value="tasks" className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              Tasks
            </TabsTrigger>
            <TabsTrigger value="goals" className="flex items-center gap-1">
              <Star className="h-3 w-3" />
              Goals
            </TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            {isLoadingData ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <TaskList
                  tasks={filterTasks(activeTab)}
                  onComplete={handleCompleteTask}
                  onDelete={handleDeleteTask}
                  emptyMessage={
                    activeTab === "all"
                      ? "No tasks yet. Create your first task!"
                      : activeTab === "daily"
                        ? "No daily habits."
                        : activeTab === "tasks"
                          ? "No one-off tasks."
                          : activeTab === "goals"
                            ? "No goals."
                            : "No completed tasks yet."
                  }
                />
                {hasMore && (
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="outline"
                      onClick={() => loadData(true)}
                      disabled={isLoadingMore}
                      className="gap-2"
                    >
                      {isLoadingMore ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      Load More ({tasks.length} of {totalTasks})
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
