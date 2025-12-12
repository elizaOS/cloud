import type { Task, UserPoints, User, AppSession } from "./types";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL || "http://localhost:3000";
const APP_ID = "eliza-todo";
const TASKS_COLLECTION = "tasks";
const POINTS_COLLECTION = "user_points";

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const response = await fetch(url, options).catch((err) => {
      if (i === retries) throw err;
      return null;
    });
    if (response) return response;
    await new Promise((r) => setTimeout(r, 500 * (i + 1))); // Backoff: 500ms, 1000ms
  }
  throw new Error("Network request failed after retries");
}

interface StorageDocument {
  id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface StorageResponse {
  documents: StorageDocument[];
  total?: number;
  hasMore?: boolean;
}

export interface PaginatedTasks {
  tasks: Task[];
  total: number;
  hasMore: boolean;
}

interface DocumentResponse {
  document: StorageDocument;
}

interface MCPResponse {
  result?: { content: Array<{ text: string }> };
  error?: { message: string };
}

const authHeaders = (token: string): HeadersInit => ({
  "Content-Type": "application/json",
  "X-App-Token": token,
});

const toTask = (doc: StorageDocument): Task => ({
  id: doc.id,
  name: doc.data.name as string,
  type: doc.data.type as Task["type"],
  priority: doc.data.priority as Task["priority"],
  urgent: doc.data.urgent as boolean | undefined,
  completed: doc.data.completed as boolean,
  metadata: (doc.data.metadata as Task["metadata"]) || {},
});

export async function createAppSession(callbackUrl: string): Promise<AppSession> {
  const response = await fetchWithRetry(`${CLOUD_URL}/api/auth/app-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callbackUrl, appId: APP_ID }),
  });
  if (!response.ok) throw new Error(`Session creation failed: ${response.status}`);
  return response.json();
}

export async function getCurrentUser(token: string): Promise<User> {
  const response = await fetchWithRetry(`${CLOUD_URL}/api/v1/app/user`, {
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(`Get user failed: ${response.status}`);
  return (await response.json()).user;
}

const DEFAULT_PAGE_SIZE = 20;

export async function listTasks(
  token: string,
  options?: { type?: Task["type"] | "all"; completed?: boolean; limit?: number; offset?: number }
): Promise<PaginatedTasks> {
  const params = new URLSearchParams();
  const filter: Record<string, unknown> = {};
  
  if (options?.type && options.type !== "all") filter.type = options.type;
  if (options?.completed !== undefined) filter.completed = options.completed;
  if (Object.keys(filter).length) params.set("filter", JSON.stringify(filter));
  
  const limit = options?.limit ?? DEFAULT_PAGE_SIZE;
  params.set("limit", String(limit));
  if (options?.offset) params.set("offset", String(options.offset));

  const response = await fetchWithRetry(
    `${CLOUD_URL}/api/v1/app/storage/${TASKS_COLLECTION}?${params}`,
    { headers: authHeaders(token) }
  );
  if (!response.ok) throw new Error(`List tasks failed: ${response.status}`);
  
  const data = (await response.json()) as StorageResponse;
  return {
    tasks: data.documents.map(toTask),
    total: data.total ?? data.documents.length,
    hasMore: data.hasMore ?? data.documents.length === limit,
  };
}

export async function createTask(token: string, task: Omit<Task, "id">): Promise<Task> {
  const response = await fetchWithRetry(`${CLOUD_URL}/api/v1/app/storage/${TASKS_COLLECTION}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      ...task,
      metadata: { ...task.metadata, createdAt: new Date().toISOString() },
    }),
  });
  if (!response.ok) throw new Error(`Create task failed: ${response.status}`);
  return toTask((await response.json() as DocumentResponse).document);
}

export async function deleteTask(token: string, taskId: string): Promise<void> {
  const response = await fetchWithRetry(
    `${CLOUD_URL}/api/v1/app/storage/${TASKS_COLLECTION}/${taskId}`,
    { method: "DELETE", headers: authHeaders(token) }
  );
  if (!response.ok) throw new Error(`Delete task failed: ${response.status}`);
}

async function callMCP(token: string, tool: string, args: Record<string, unknown>): Promise<string> {
  const response = await fetchWithRetry(`${CLOUD_URL}/api/mcp/todoapp`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: tool, arguments: args },
      id: Date.now(),
    }),
  });
  if (!response.ok) throw new Error(`MCP call failed: ${response.status}`);
  
  const data = (await response.json()) as MCPResponse;
  if (data.error) throw new Error(data.error.message);
  return data.result?.content[0]?.text || "";
}

export async function completeTask(token: string, taskId: string): Promise<{ message: string; points: number }> {
  const result = await callMCP(token, "complete_task", { id: taskId });
  const points = parseInt(result.match(/Earned (\d+) points/)?.[1] || "0", 10);
  return { message: result, points };
}

export async function getUserPoints(token: string): Promise<UserPoints> {
  const response = await fetchWithRetry(
    `${CLOUD_URL}/api/v1/app/storage/${POINTS_COLLECTION}?limit=1`,
    { headers: authHeaders(token) }
  );
  if (!response.ok) throw new Error(`Get points failed: ${response.status}`);
  
  const { documents } = (await response.json()) as StorageResponse;
  if (!documents.length) return { currentPoints: 0, totalEarned: 0, streak: 0 };
  
  const { data } = documents[0];
  return {
    currentPoints: (data.currentPoints as number) || 0,
    totalEarned: (data.totalEarned as number) || 0,
    streak: (data.streak as number) || 0,
    lastCompletionDate: data.lastCompletionDate as string | undefined,
  };
}
