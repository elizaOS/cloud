/**
 * A2A (Agent-to-Agent) Types
 *
 * Re-exports core A2A types and defines service-specific types
 */

import type { UserWithOrganization } from "@/lib/types";
import type { Organization } from "@/db/schemas/organizations";

// Re-export core A2A types
export type {
  Task,
  TaskState,
  Message,
  Part,
  Artifact,
  MessageSendParams,
  TaskGetParams,
  TaskCancelParams,
  JSONRPCRequest,
  JSONRPCResponse,
} from "@/lib/types/a2a";

// Re-export value exports
export {
  A2AErrorCodes,
  createTextPart,
  createDataPart,
  createTask,
  createTaskStatus,
  createArtifact,
  createMessage,
  jsonRpcSuccess,
  jsonRpcError,
} from "@/lib/types/a2a";

/**
 * A2A execution context with authenticated user and secrets
 */
export interface A2AContext {
  user: UserWithOrganization & { organization_id: string; organization: Organization };
  apiKeyId: string | null;
  agentIdentifier: string;
  /**
   * Decrypted secrets available to this A2A session.
   * Loaded from secrets service based on organization and optional agent/project.
   * Access via ctx.secrets['SECRET_NAME']
   */
  secrets: Record<string, string>;
}

/**
 * Chat completion result
 */
export interface ChatCompletionResult {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost: number;
}

/**
 * Image generation result
 */
export interface ImageGenerationResult {
  image: string;
  mimeType: string;
  aspectRatio: string;
  cost: number;
}

/**
 * Balance check result
 */
export interface BalanceResult {
  balance: number;
  organizationId: string;
  organizationName: string;
}

/**
 * Usage record
 */
export interface UsageResult {
  usage: Array<{
    id: string;
    type: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    createdAt: string;
  }>;
  total: number;
}

/**
 * Agent list result
 */
export interface ListAgentsResult {
  agents: Array<{
    id: string;
    name: string;
    bio: string | string[] | null;
    avatarUrl: string | null;
    createdAt: Date;
  }>;
  total: number;
}

/**
 * Chat with agent result
 */
export interface ChatWithAgentResult {
  response: string;
  roomId: string;
  messageId: string;
  timestamp: string;
}

/**
 * Memory save result
 */
export interface SaveMemoryResult {
  memoryId: string;
  storage: string;
  cost: number;
}

/**
 * Memory retrieval result
 */
export interface RetrieveMemoriesResult {
  memories: Array<{
    id: string;
    content: string;
    score: number;
    createdAt: string;
  }>;
  count: number;
}

/**
 * Conversation creation result
 */
export interface CreateConversationResult {
  conversationId: string;
  title: string;
  model: string;
  cost: number;
}

/**
 * Container list result
 */
export interface ListContainersResult {
  containers: Array<{
    id: string;
    name: string;
    status: string;
    url: string | null;
    createdAt: Date;
  }>;
  total: number;
}

/**
 * Video generation result
 */
export interface VideoGenerationResult {
  jobId: string;
  status: string;
  cost: number;
}

/**
 * Fragment generation result
 */
export interface FragmentGenerationResult {
  fragment: {
    commentary: string;
    template: string;
    title: string;
    description: string;
    file_path: string;
    code: string;
    port: number | null;
    additional_dependencies: string[];
    has_additional_dependencies: boolean;
    install_dependencies_command: string;
  };
  cost: number;
}

/**
 * Fragment execution result
 */
export interface FragmentExecutionResult {
  containerId: string;
  template: string;
  url?: string;
  stdout?: string[];
  stderr?: string[];
  runtimeError?: {
    message: string;
    name: string;
    traceback?: string;
  };
}

/**
 * Fragment project result
 */
export interface FragmentProjectResult {
  project: {
    id: string;
    name: string;
    description?: string;
    organization_id: string;
    user_id: string;
    fragment_data: Record<string, unknown>;
    template: string;
    status: string;
    deployed_app_id?: string;
    deployed_container_id?: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    deployed_at?: string;
  };
}

/**
 * Fragment project list result
 */
export interface FragmentProjectListResult {
  projects: Array<FragmentProjectResult["project"]>;
  count: number;
}

/**
 * Fragment deployment result
 */
export interface FragmentDeploymentResult {
  deployment: {
    type: "app" | "container";
    app?: {
      id: string;
      name: string;
      slug: string;
      app_url: string;
    };
    apiKey?: string;
    containerId?: string;
    collections?: Array<{
      name: string;
      schema: Record<string, unknown>;
    }>;
    injectedCode?: string;
    proxyRouteCode?: string;
  };
}

/**
 * Full App Builder session result
 */
export interface FullAppBuilderSessionResult {
  sessionId: string;
  sandboxId: string;
  sandboxUrl: string;
  status: string;
  examplePrompts: string[];
}

/**
 * Full App Builder prompt result
 */
export interface FullAppBuilderPromptResult {
  success: boolean;
  output: string;
  filesAffected: string[];
  error?: string;
}

/**
 * Full App Builder session status result
 */
export interface FullAppBuilderStatusResult {
  sessionId: string;
  sandboxId: string;
  sandboxUrl: string;
  status: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
    filesAffected?: string[];
  }>;
  generatedFiles: string[];
}

// ============================================
// Domain Management Types
// ============================================

/**
 * Domain search result
 */
export interface DomainSearchResult {
  query: string;
  results: Array<{
    domain: string;
    available: boolean;
    price: {
      amount: number;
      currency: string;
      period: number;
    } | null;
  }>;
  availableCount: number;
}

/**
 * Domain check result
 */
export interface DomainCheckResult {
  domain: string;
  available: boolean;
  price: {
    amount: number;
    currency: string;
    period: number;
    renewalAmount: number;
  } | null;
  moderationFlags: Array<{
    type: string;
    severity: string;
    reason: string;
  }>;
  requiresReview: boolean;
}

/**
 * Domain list result
 */
export interface DomainListResult {
  domains: Array<{
    id: string;
    domain: string;
    status: string;
    verified: boolean;
    resourceType: string | null;
    resourceId: string | null;
    expiresAt: string | null;
    sslStatus: string | null;
    isLive: boolean;
  }>;
  stats: {
    total: number;
    active: number;
    pending: number;
    suspended: number;
    expiringSoon: number;
  };
}

/**
 * Domain registration result
 */
export interface DomainRegisterResult {
  success: boolean;
  domain: {
    id: string;
    domain: string;
    status: string;
    verificationToken?: string;
  };
  dnsInstructions?: Array<{
    type: string;
    name: string;
    value: string;
    description: string;
  }>;
  message: string;
}

/**
 * Domain verification result
 */
export interface DomainVerifyResult {
  verified: boolean;
  domain: string;
  error?: string;
  dnsInstructions?: Array<{
    type: string;
    name: string;
    value: string;
    description: string;
  }>;
  message: string;
}

/**
 * Domain assignment result
 */
export interface DomainAssignResult {
  success: boolean;
  domain: {
    id: string;
    domain: string;
    resourceType: string;
    resourceId: string;
  };
  message: string;
}

// ============================================
// Code Agent Types
// ============================================

/**
 * Code agent session creation result
 */
export interface CodeAgentSessionResult {
  sessionId: string;
  name: string | null;
  status: string;
  runtimeUrl: string | null;
  expiresAt: string | null;
}

/**
 * Code execution result
 */
export interface CodeExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  filesAffected?: string[];
}

/**
 * Code interpreter result
 */
export interface CodeInterpreterResult {
  success: boolean;
  executionId: string;
  output: string;
  error?: string;
  exitCode: number;
  durationMs: number;
  costCents: number;
}

/**
 * File operation result
 */
export interface FileOperationResult {
  success: boolean;
  path: string;
  content?: string;
  size?: number;
  error?: string;
}

/**
 * Git operation result
 */
export interface GitOperationResult {
  success: boolean;
  message: string;
  gitState?: {
    isRepo: boolean;
    branch?: string;
    commitHash?: string;
    remoteUrl?: string;
    hasUncommittedChanges?: boolean;
  };
  error?: string;
}

/**
 * A2A method handler type
 */
export type MethodHandler<T = Record<string, unknown>, R = unknown> = (
  params: T,
  ctx: A2AContext
) => Promise<R>;

/**
 * Method definition in registry
 */
export interface MethodDefinition {
  handler: MethodHandler;
  description: string;
}

