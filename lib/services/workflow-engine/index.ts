/**
 * Workflow Engine Service
 *
 * AI-powered workflow generation and execution engine.
 * This is the "AI Workflow Builder" core - the $1.2B vision:
 * social connectors + AI generation + browser use.
 *
 * Key capabilities:
 * - AI workflow generation using Claude
 * - Service specifications with dependency resolution
 * - Context-aware prompt building
 * - Pre-built workflow templates
 * - Credential validation before execution
 */

// Workflow Registry
export {
  workflowRegistry,
  type WorkflowDefinition,
  type WorkflowInput,
  type WorkflowCategory,
  type WorkflowExecutionRequest,
  type WorkflowExecutionResponse,
} from "./registry";

// n8n Client (for external n8n integration)
export {
  n8nClient,
  type N8nWorkflow,
  type N8nNode,
  type N8nExecution,
  type N8nExecutionResult,
} from "./n8n-client";

// Credential Validation
export {
  credentialValidator,
  type CredentialProvider,
  type RequiredCredential,
  type ValidationResult,
  type MissingCredential,
  WORKFLOW_CREDENTIALS,
} from "./credential-validator";

// Service Specifications
export {
  serviceSpecsRegistry,
  googleSpec,
  notionSpec,
  blooioSpec,
  twilioSpec,
  type ServiceSpecification,
  type ServiceResource,
  type ResourceOperation,
  type AuthenticationSpec,
  type DependencySpec,
  type WorkflowExample,
  type ServiceConnectionStatus,
  type DependencyResolutionInput,
  type DependencyResolutionResult,
} from "./service-specs";

// Dependency Resolution
export {
  dependencyResolver,
  type IntentAnalysis,
} from "./dependency-resolver";

// Context Building
export {
  contextBuilder,
  type WorkflowContext,
  type GeneratedPrompt,
} from "./context-builder";

// Workflow Factory (AI Generation)
export {
  workflowFactory,
  type WorkflowGenerationRequest,
  type GeneratedWorkflow,
  type GenerationJob,
} from "./workflow-factory";

// Workflow Sharing (MCP Publishing)
export {
  workflowSharingService,
  type AutoShareCriteria,
  type ShareWorkflowOptions,
  type ShareResult,
} from "./workflow-sharing";
