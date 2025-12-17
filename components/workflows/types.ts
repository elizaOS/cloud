export const STATUS_COLORS = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  archived: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  draft: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  completed: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
  running: "bg-blue-500/20 text-blue-400",
} as const;

export function getStatusColor(status: string): string {
  return (
    STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.draft
  );
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  version: number;
  tags: string[];
  workflowData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  n8nWorkflowId?: string;
  isActiveInN8n?: boolean;
}

export interface WorkflowVersion {
  id: string;
  version: number;
  changes_summary: string | null;
  created_at: string;
  created_by: string;
}

export interface WorkflowExecution {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
}

export interface TestResult {
  success: boolean;
  executionId: string;
  status: "completed" | "failed" | "running";
  startTime: string;
  endTime?: string;
  duration?: number;
  output?: Record<string, unknown>;
  error?: string;
  executionMode?: "real" | "simulated";
  n8nExecutionId?: string;
}

export interface EndpointNode {
  id: string;
  name: string;
  description: string;
  type: "a2a" | "mcp" | "rest";
  category: string;
  endpoint: string;
  method?: string;
  authentication?: {
    type: string;
    description?: string;
  };
  x402Enabled?: boolean;
  pricing?: {
    currency: string;
    amount: number;
  };
  source?: string;
  metadata?: Record<string, unknown>;
}

export type TriggerType = "cron" | "webhook" | "a2a" | "mcp";

export interface Trigger {
  id: string;
  triggerType: TriggerType;
  triggerKey: string;
  config: {
    cronExpression?: string;
    webhookSecret?: string;
    webhookUrl?: string;
    requireSignature?: boolean;
    skillId?: string;
    toolName?: string;
    inputData?: Record<string, unknown>;
    maxExecutionsPerDay?: number;
    allowedIps?: string[];
    hasWebhookSecret?: boolean;
  };
  isActive: boolean;
  lastExecutedAt: string | null;
  executionCount: number;
  errorCount: number;
  createdAt?: string;
  webhookUrl?: string;
}

export interface ProposedChanges {
  workflowData?: Record<string, unknown>;
  name?: string;
  description?: string;
  status?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  proposedChanges?: ProposedChanges;
  changeStatus?: "pending" | "applied" | "rejected";
}
