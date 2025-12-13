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
}

export interface WorkflowExecution {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
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
