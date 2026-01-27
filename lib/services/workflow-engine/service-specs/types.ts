/**
 * Service Specification Types
 *
 * Defines the structure for service API specifications used by the
 * AI Workflow Factory to understand service capabilities and dependencies.
 */

/**
 * A single operation that can be performed on a resource
 */
export interface ResourceOperation {
  /** What this operation requires as input */
  requires: string[];
  /** What this operation outputs */
  outputs?: string[];
  /** Human-readable description */
  description?: string;
  /** HTTP method if applicable */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** API endpoint pattern */
  endpoint?: string;
  /** Rate limit info */
  rateLimit?: {
    requests: number;
    period: "second" | "minute" | "hour" | "day";
  };
}

/**
 * A resource within a service (e.g., "database", "page", "email")
 */
export interface ServiceResource {
  /** Operations available on this resource */
  [operation: string]: ResourceOperation;
}

/**
 * Authentication requirements for a service
 */
export interface AuthenticationSpec {
  type: "oauth2" | "api_key" | "basic" | "bearer";
  /** OAuth scopes if applicable */
  scopes?: string[];
  /** Required credentials */
  requiredCredentials: string[];
  /** Token refresh supported */
  refreshable?: boolean;
}

/**
 * Dependency definition for operations
 */
export interface DependencySpec {
  /** The operation that depends on something */
  operation: string;
  /** What it depends on */
  dependsOn: string[];
  /** How to resolve if dependency doesn't exist */
  resolution?: "create" | "prompt_user" | "fail";
}

/**
 * Complete specification for a service
 */
export interface ServiceSpecification {
  /** Unique identifier for the service */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the service */
  description: string;
  /** Authentication requirements */
  authentication: AuthenticationSpec;
  /** Base URL for API calls */
  baseUrl?: string;
  /** Available resources and their operations */
  resources: Record<string, ServiceResource>;
  /** Inter-operation dependencies */
  dependencies: DependencySpec[];
  /** Example workflows using this service */
  examples?: WorkflowExample[];
}

/**
 * Example workflow for context building
 */
export interface WorkflowExample {
  /** User intent that triggers this workflow */
  intent: string;
  /** Operations executed in order */
  operations: string[];
  /** Sample code snippet */
  code?: string;
}

/**
 * Result of checking a user's service connection
 */
export interface ServiceConnectionStatus {
  serviceId: string;
  connected: boolean;
  scopes?: string[];
  expiresAt?: Date;
  resources?: {
    type: string;
    id: string;
    name: string;
  }[];
}

/**
 * Input for dependency resolution
 */
export interface DependencyResolutionInput {
  /** The target operation user wants to perform */
  targetOperation: string;
  /** Service the operation belongs to */
  serviceId: string;
  /** User's connected services */
  connectedServices: ServiceConnectionStatus[];
  /** Known resources user has */
  existingResources?: Record<string, string[]>;
}

/**
 * Output from dependency resolution
 */
export interface DependencyResolutionResult {
  /** Can the operation be performed? */
  canExecute: boolean;
  /** Missing services that need to be connected */
  missingServices: string[];
  /** Missing scopes on connected services */
  missingScopes: { serviceId: string; scopes: string[] }[];
  /** Prerequisites that need to be created first */
  prerequisites: {
    serviceId: string;
    operation: string;
    reason: string;
  }[];
  /** Ordered execution plan */
  executionPlan: {
    step: number;
    serviceId: string;
    operation: string;
    inputs: Record<string, string>;
  }[];
}
