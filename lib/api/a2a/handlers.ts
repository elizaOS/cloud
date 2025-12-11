/**
 * A2A Method Handlers
 */

import { v4 as uuidv4 } from "uuid";
import { contentModerationService } from "@/lib/services/content-moderation";
import { a2aTaskStoreService, type TaskStoreEntry } from "@/lib/services/a2a-task-store";
import { logger } from "@/lib/utils/logger";
import {
  type A2AContext,
  type Task,
  type TaskState,
  type Message,
  type Artifact,
  type MessageSendParams,
  type TaskGetParams,
  type TaskCancelParams,
  createTextPart,
  createDataPart,
  createTask,
  createTaskStatus,
  createArtifact,
  createMessage,
} from "./types";
import * as skills from "./skills";

type SkillHandler = (
  textContent: string,
  dataContent: Record<string, unknown>,
  ctx: A2AContext
) => Promise<unknown>;

type SkillEntry = {
  handler: SkillHandler;
  description: string;
  aliases?: string[];
  formatResult?: (result: unknown) => Message;
};

const SKILL_REGISTRY: Record<string, SkillEntry> = {
  chat_completion: {
    handler: skills.executeSkillChatCompletion,
    description: "Generate text with LLMs",
    formatResult: (r) => {
      const result = r as { content: string };
      return createMessage("agent", [createTextPart(result.content)]);
    },
  },
  image_generation: {
    handler: skills.executeSkillImageGeneration,
    description: "Generate images",
    formatResult: (r) => {
      const result = r as { image: string; mimeType: string };
      return createMessage("agent", [
        { type: "file", file: { bytes: result.image.split(",")[1], mimeType: result.mimeType } },
      ]);
    },
  },
  video_generation: { handler: skills.executeSkillVideoGeneration, description: "Generate videos (async)", aliases: ["generate_video"] },
  get_x402_topup_requirements: { handler: skills.executeSkillGetX402TopupRequirements, description: "Get x402 payment requirements", aliases: ["x402_topup_requirements"] },
  check_balance: { handler: (_, __, ctx) => skills.executeSkillCheckBalance(ctx), description: "Check credit balance" },
  get_usage: { handler: (_, data, ctx) => skills.executeSkillGetUsage(data, ctx), description: "Get usage statistics" },
  list_agents: { handler: (_, data, ctx) => skills.executeSkillListAgents(data, ctx), description: "List available agents" },
  chat_with_agent: {
    handler: skills.executeSkillChatWithAgent,
    description: "Chat with agent",
    formatResult: (r) => {
      const result = r as { response: string };
      return createMessage("agent", [createTextPart(result.response)]);
    },
  },
  save_memory: { handler: skills.executeSkillSaveMemory, description: "Save a memory" },
  retrieve_memories: { handler: skills.executeSkillRetrieveMemories, description: "Retrieve memories by query" },
  delete_memory: { handler: (_, data, ctx) => skills.executeSkillDeleteMemory(data, ctx), description: "Delete a memory" },
  create_conversation: { handler: (_, data, ctx) => skills.executeSkillCreateConversation(data, ctx), description: "Create a new conversation" },
  get_conversation_context: { handler: (_, data, ctx) => skills.executeSkillGetConversationContext(data, ctx), description: "Get conversation details" },
  list_containers: { handler: (_, data, ctx) => skills.executeSkillListContainers(data, ctx), description: "List deployed containers" },
  get_user_profile: { handler: (_, __, ctx) => skills.executeSkillGetUserProfile(ctx), description: "Get current user profile", aliases: ["profile"] },
  storage_upload: { handler: (_, data, ctx) => skills.executeSkillStorageUpload(data, ctx), description: "Upload file to storage", aliases: ["upload_file"] },
  storage_list: { handler: (_, data, ctx) => skills.executeSkillStorageList(data, ctx), description: "List stored files", aliases: ["list_files"] },
  storage_stats: { handler: (_, __, ctx) => skills.executeSkillStorageStats(ctx), description: "Get storage statistics" },
  storage_cost: { handler: (_, data) => skills.executeSkillStorageCalculateCost(data), description: "Calculate storage cost", aliases: ["calculate_storage_cost"] },
  storage_pin: { handler: (_, data, ctx) => skills.executeSkillStoragePin(data, ctx), description: "Pin to IPFS", aliases: ["pin_to_ipfs"] },
  n8n_create_workflow: { handler: skills.executeSkillN8nCreateWorkflow, description: "Create n8n workflow", aliases: ["create_n8n_workflow"] },
  n8n_list_workflows: { handler: (_, data, ctx) => skills.executeSkillN8nListWorkflows(data, ctx), description: "List n8n workflows", aliases: ["list_n8n_workflows"] },
  n8n_generate_workflow: { handler: skills.executeSkillN8nGenerateWorkflow, description: "AI-generate n8n workflow", aliases: ["generate_n8n_workflow"] },
  n8n_trigger_workflow: { handler: skills.executeSkillN8nTriggerWorkflow, description: "Execute n8n workflow via trigger", aliases: ["trigger_n8n_workflow", "execute_workflow_trigger"] },
  n8n_list_triggers: { handler: (_, data, ctx) => skills.executeSkillN8nListTriggers(data, ctx), description: "List n8n workflow triggers", aliases: ["list_n8n_triggers", "list_workflow_triggers"] },
  n8n_create_trigger: { handler: skills.executeSkillN8nCreateTrigger, description: "Create n8n workflow trigger", aliases: ["create_n8n_trigger", "create_workflow_trigger"] },
  // Application triggers (apps, agents, MCPs)
  create_app_trigger: { handler: skills.executeSkillCreateAppTrigger, description: "Create trigger for an app, agent, or MCP", aliases: ["create_trigger", "add_trigger"] },
  list_app_triggers: { handler: (_, data, ctx) => skills.executeSkillListAppTriggers(data, ctx), description: "List triggers for apps, agents, or MCPs", aliases: ["list_triggers", "get_triggers"] },
  execute_app_trigger: { handler: skills.executeSkillExecuteAppTrigger, description: "Execute a trigger manually", aliases: ["run_trigger", "trigger"] },
  generate_fragment: { handler: skills.executeSkillFragmentGenerate, description: "Generate code fragment", aliases: ["fragment_generate"] },
  execute_fragment: { handler: skills.executeSkillFragmentExecute, description: "Execute fragment in sandbox", aliases: ["fragment_execute"] },
  list_fragment_projects: { handler: skills.executeSkillFragmentListProjects, description: "List fragment projects", aliases: ["fragment_list_projects"] },
  create_fragment_project: { handler: skills.executeSkillFragmentCreateProject, description: "Create fragment project", aliases: ["fragment_create_project"] },
  get_fragment_project: { handler: skills.executeSkillFragmentGetProject, description: "Get fragment project", aliases: ["fragment_get_project"] },
  update_fragment_project: { handler: skills.executeSkillFragmentUpdateProject, description: "Update fragment project", aliases: ["fragment_update_project"] },
  delete_fragment_project: { handler: skills.executeSkillFragmentDeleteProject, description: "Delete fragment project", aliases: ["fragment_delete_project"] },
  deploy_fragment_project: { handler: skills.executeSkillFragmentDeployProject, description: "Deploy fragment project", aliases: ["fragment_deploy_project"] },
  // ERC-8004 Marketplace Discovery
  marketplace_discover: { handler: skills.executeSkillMarketplaceDiscover, description: "Search ERC-8004 marketplace for agents/MCPs", aliases: ["discover_agents", "search_marketplace", "erc8004_discover"] },
  marketplace_get_tags: { handler: () => skills.executeSkillMarketplaceGetTags(), description: "Get available marketplace tags for search", aliases: ["get_tags", "list_tags", "erc8004_tags"] },
  marketplace_find_by_tags: { handler: skills.executeSkillMarketplaceFindByTags, description: "Find agents/MCPs by tags", aliases: ["find_by_tags"] },
  marketplace_find_by_mcp_tools: { handler: skills.executeSkillMarketplaceFindByMCPTools, description: "Find MCPs with specific tools", aliases: ["find_mcp_tools", "find_by_tools"] },
  marketplace_find_payable: { handler: skills.executeSkillMarketplaceFindPayable, description: "Find x402-enabled services", aliases: ["find_x402", "find_payable_agents"] },
  // Full App Builder - Multi-file complete app generation
  full_app_builder_start: { handler: skills.executeSkillFullAppBuilderStart, description: "Start full app builder session with Vercel sandbox", aliases: ["start_app_builder", "create_app_session"] },
  full_app_builder_prompt: { handler: skills.executeSkillFullAppBuilderPrompt, description: "Send prompt to app builder to generate/modify files", aliases: ["app_builder_prompt", "build_app"] },
  full_app_builder_status: { handler: skills.executeSkillFullAppBuilderStatus, description: "Get app builder session status and files", aliases: ["app_builder_status", "get_app_session"] },
  full_app_builder_stop: { handler: skills.executeSkillFullAppBuilderStop, description: "Stop app builder session and release resources", aliases: ["stop_app_builder", "end_app_session"] },
  full_app_builder_extend: { handler: skills.executeSkillFullAppBuilderExtend, description: "Extend app builder session timeout", aliases: ["extend_app_session"] },
  full_app_builder_list: { handler: (_, data, ctx) => skills.executeSkillFullAppBuilderListSessions(data, ctx), description: "List app builder sessions", aliases: ["list_app_sessions"] },
  // Telegram skills
  telegram_send_message: { handler: skills.executeSkillTelegramSendMessage, description: "Send a Telegram message", aliases: ["send_telegram", "telegram_message"] },
  telegram_list_chats: { handler: (_, data, ctx) => skills.executeSkillTelegramListChats(data, ctx), description: "List Telegram chats", aliases: ["list_telegram_chats"] },
  telegram_list_bots: { handler: (_, __, ctx) => skills.executeSkillTelegramListBots(ctx), description: "List connected Telegram bots", aliases: ["list_telegram_bots"] },
  // Org tools skills - Task management
  create_task: { handler: skills.executeSkillCreateTask, description: "Create a new task", aliases: ["create_todo", "add_task"] },
  list_tasks: { handler: (_, data, ctx) => skills.executeSkillListTasks(data, ctx), description: "List tasks with optional filters", aliases: ["list_todos", "get_tasks"] },
  update_task: { handler: skills.executeSkillUpdateTask, description: "Update an existing task", aliases: ["update_todo", "modify_task"] },
  complete_task: { handler: skills.executeSkillCompleteTask, description: "Mark a task as completed", aliases: ["complete_todo", "finish_task"] },
  get_task_stats: { handler: (_, __, ctx) => skills.executeSkillGetTaskStats(ctx), description: "Get task statistics", aliases: ["task_stats", "todo_stats"] },
  // Org tools skills - Check-in management
  create_checkin_schedule: { handler: skills.executeSkillCreateCheckinSchedule, description: "Create a team check-in schedule", aliases: ["create_checkin", "schedule_standup"] },
  list_checkin_schedules: { handler: (_, data, ctx) => skills.executeSkillListCheckinSchedules(data, ctx), description: "List check-in schedules", aliases: ["list_checkins", "get_schedules"] },
  record_checkin_response: { handler: skills.executeSkillRecordCheckinResponse, description: "Record a check-in response", aliases: ["record_checkin", "submit_checkin"] },
  generate_checkin_report: { handler: skills.executeSkillGenerateCheckinReport, description: "Generate a check-in report", aliases: ["checkin_report", "standup_report"] },
  // Org tools skills - Team management
  add_team_member: { handler: skills.executeSkillAddTeamMember, description: "Add a team member to a server", aliases: ["add_member", "register_member"] },
  list_team_members: { handler: (_, data, ctx) => skills.executeSkillListTeamMembers(data, ctx), description: "List team members", aliases: ["get_team", "list_members"] },
  get_platform_status: { handler: (_, __, ctx) => skills.executeSkillGetPlatformStatus(ctx), description: "Get platform connection status", aliases: ["platform_status", "bot_status"] },
};

// Build alias lookup
const SKILL_ALIAS_MAP = new Map<string, string>();
for (const [id, entry] of Object.entries(SKILL_REGISTRY)) {
  SKILL_ALIAS_MAP.set(id, id);
  entry.aliases?.forEach((alias) => SKILL_ALIAS_MAP.set(alias, id));
}

// Task store helpers
async function getTaskStore(taskId: string, organizationId: string): Promise<TaskStoreEntry | null> {
  return a2aTaskStoreService.get(taskId, organizationId);
}

async function updateTaskState(
  taskId: string,
  organizationId: string,
  state: TaskState,
  message?: Message
): Promise<Task | null> {
  return a2aTaskStoreService.updateTaskState(taskId, organizationId, state, message);
}

async function addArtifactToTask(
  taskId: string,
  organizationId: string,
  artifact: Artifact
): Promise<Task | null> {
  return a2aTaskStoreService.addArtifact(taskId, organizationId, artifact);
}

async function addMessageToHistory(
  taskId: string,
  organizationId: string,
  message: Message
): Promise<void> {
  await a2aTaskStoreService.addMessageToHistory(taskId, organizationId, message);
}

async function storeTask(
  taskId: string,
  task: Task,
  userId: string,
  organizationId: string
): Promise<void> {
  await a2aTaskStoreService.set(taskId, {
    task,
    userId,
    organizationId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * message/send - Core A2A method
 * Sends a message to create a new task or continue an existing one
 */
export async function handleMessageSend(
  params: MessageSendParams,
  ctx: A2AContext
): Promise<Task | Message> {
  const { message, configuration, metadata } = params;

  if (!message?.parts?.length) {
    throw new Error("Message must contain at least one part");
  }

  // Check if user is blocked due to moderation violations
  if (await contentModerationService.shouldBlockUser(ctx.user.id)) {
    throw new Error("Account suspended due to policy violations");
  }

  // Extract text content for moderation
  const textContent = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");

  if (textContent) {
    contentModerationService.moderateAgentInBackground(
      textContent,
      ctx.user.id,
      ctx.agentIdentifier,
      undefined,
      (result) => {
        logger.warn("[A2A] Moderation violation detected", {
          userId: ctx.user.id,
          categories: result.flaggedCategories,
          action: result.action,
        });
      }
    );
  }

  // Create a new task
  const taskId = (metadata?.taskId as string | undefined) || uuidv4();
  const contextId = (metadata?.contextId as string | undefined) || uuidv4();

  const task = createTask(taskId, "working", undefined, contextId, metadata);

  // Store the task
  await storeTask(taskId, task, ctx.user.id, ctx.user.organization_id);

  // Add user message to history
  await addMessageToHistory(taskId, ctx.user.organization_id, message);

  // Process the message
  const result = await processA2AMessage(task, message, ctx, configuration);

  return result;
}

/**
 * Process an A2A message and dispatch to appropriate skill
 */
async function processA2AMessage(
  task: Task,
  message: Message,
  ctx: A2AContext,
  _configuration?: MessageSendParams["configuration"]
): Promise<Task> {
  const textParts = message.parts.filter((p): p is { type: "text"; text: string } => p.type === "text");
  const dataParts = message.parts.filter((p): p is { type: "data"; data: Record<string, unknown> } => p.type === "data");

  const textContent = textParts.map((p) => p.text).join("\n");
  const dataContent = dataParts.length > 0 ? dataParts[0].data : {};
  const requestedSkill = dataContent.skill as string | undefined;

  // Resolve skill from registry (use chat_completion as default)
  const resolvedSkillId = requestedSkill ? SKILL_ALIAS_MAP.get(requestedSkill) : undefined;
  const skillId = resolvedSkillId || (textContent && !requestedSkill ? "chat_completion" : resolvedSkillId);
  const skillEntry = skillId ? SKILL_REGISTRY[skillId] : undefined;

  let responseMessage: Message;
  const artifacts: Artifact[] = [];

  if (skillEntry) {
    const result = await skillEntry.handler(textContent, dataContent, ctx);
    responseMessage = skillEntry.formatResult
      ? skillEntry.formatResult(result)
      : createMessage("agent", [createDataPart(result as Record<string, unknown>)]);

    // Add cost artifacts for certain skills
    if (skillId === "chat_completion") {
      const r = result as { model: string; usage: unknown; cost: number };
      artifacts.push(createArtifact([createDataPart({ model: r.model, usage: r.usage, cost: r.cost })], "usage", "Token usage and cost"));
    } else if (skillId === "image_generation") {
      const r = result as { cost: number };
      artifacts.push(createArtifact([createDataPart({ cost: r.cost })], "cost", "Generation cost"));
    }
  } else {
    // Fallback to chat completion
    const result = await skills.executeSkillChatCompletion(textContent, dataContent, ctx);
    responseMessage = createMessage("agent", [createTextPart(result.content)]);
  }

  await addMessageToHistory(task.id, ctx.user.organization_id, responseMessage);
  for (const artifact of artifacts) {
    await addArtifactToTask(task.id, ctx.user.organization_id, artifact);
  }

  const updatedTask = await updateTaskState(task.id, ctx.user.organization_id, "completed", responseMessage);
  if (updatedTask) return updatedTask;

  task.status = createTaskStatus("completed", responseMessage);
  return task;
}

/**
 * tasks/get - Get task status and history
 */
export async function handleTasksGet(params: TaskGetParams, ctx: A2AContext): Promise<Task> {
  const { id, historyLength } = params;

  const store = await getTaskStore(id, ctx.user.organization_id);
  if (!store) {
    throw new Error(`Task not found: ${id}`);
  }

  const task = { ...store.task };

  if (historyLength !== undefined && task.history) {
    task.history = task.history.slice(-historyLength);
  }

  return task;
}

/**
 * tasks/cancel - Cancel a running task
 */
export async function handleTasksCancel(params: TaskCancelParams, ctx: A2AContext): Promise<Task> {
  const { id } = params;

  const store = await getTaskStore(id, ctx.user.organization_id);
  if (!store) {
    throw new Error(`Task not found: ${id}`);
  }

  const terminalStates: TaskState[] = ["completed", "canceled", "failed", "rejected"];
  if (terminalStates.includes(store.task.status.state)) {
    throw new Error(`Task ${id} is already in terminal state: ${store.task.status.state}`);
  }

  const task = await updateTaskState(id, ctx.user.organization_id, "canceled");
  if (!task) {
    throw new Error(`Failed to update task: ${id}`);
  }

  return task;
}

/**
 * Available skills for service discovery (generated from registry)
 */
export const AVAILABLE_SKILLS = Object.entries(SKILL_REGISTRY).map(([id, entry]) => ({
  id,
  description: entry.description,
}));

