/**
 * Dependency Resolver
 *
 * Analyzes user intent and identifies prerequisites for workflow execution.
 * Handles the key challenge of inter-service dependencies (e.g., Notion page
 * requires a database to exist first).
 */

import { logger } from "@/lib/utils/logger";
import {
  serviceSpecsRegistry,
  type ServiceConnectionStatus,
  type DependencyResolutionInput,
  type DependencyResolutionResult,
  type ServiceSpecification,
} from "./service-specs";

/**
 * Intent analysis result from parsing user request
 */
export interface IntentAnalysis {
  /** Primary action the user wants to perform */
  primaryAction: string;
  /** Target service (if identifiable) */
  targetService?: string;
  /** Target resource (if identifiable) */
  targetResource?: string;
  /** Entities mentioned (contacts, subjects, etc.) */
  entities: {
    type: "contact" | "email" | "phone" | "date" | "time" | "content" | "other";
    value: string;
    raw: string;
  }[];
  /** Confidence score 0-1 */
  confidence: number;
  /** Services that might be involved */
  potentialServices: string[];
}

/**
 * Keywords that map to service operations
 */
const ACTION_KEYWORDS: Record<
  string,
  { service: string; resource: string; operation: string }[]
> = {
  // Email actions
  email: [{ service: "google", resource: "email", operation: "send" }],
  send: [
    { service: "google", resource: "email", operation: "send" },
    { service: "blooio", resource: "message", operation: "send" },
    { service: "twilio", resource: "sms", operation: "send" },
  ],
  check: [
    { service: "google", resource: "email", operation: "list" },
    { service: "google", resource: "calendar", operation: "list_events" },
  ],
  read: [{ service: "google", resource: "email", operation: "read" }],

  // Messaging actions
  text: [
    { service: "blooio", resource: "message", operation: "send" },
    { service: "twilio", resource: "sms", operation: "send" },
  ],
  sms: [{ service: "twilio", resource: "sms", operation: "send" }],
  imessage: [{ service: "blooio", resource: "message", operation: "send" }],
  message: [
    { service: "blooio", resource: "message", operation: "send" },
    { service: "twilio", resource: "sms", operation: "send" },
  ],

  // Calendar actions
  schedule: [
    { service: "google", resource: "calendar", operation: "create_event" },
  ],
  meeting: [
    { service: "google", resource: "calendar", operation: "create_event" },
  ],
  calendar: [
    { service: "google", resource: "calendar", operation: "list_events" },
  ],
  event: [
    { service: "google", resource: "calendar", operation: "create_event" },
  ],

  // Notion actions
  notion: [{ service: "notion", resource: "page", operation: "create" }],
  page: [{ service: "notion", resource: "page", operation: "create" }],
  note: [{ service: "notion", resource: "page", operation: "create" }],
  database: [{ service: "notion", resource: "database", operation: "query" }],

  // Contact actions
  contact: [{ service: "google", resource: "contacts", operation: "search" }],
  find: [{ service: "google", resource: "contacts", operation: "search" }],
};

/**
 * Entity extraction patterns
 */
const ENTITY_PATTERNS: {
  type: IntentAnalysis["entities"][number]["type"];
  pattern: RegExp;
}[] = [
  // Email addresses
  { type: "email", pattern: /[\w.+-]+@[\w.-]+\.\w+/gi },
  // Phone numbers (various formats)
  {
    type: "phone",
    pattern: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
  },
  // Contact names (after "to", "with", etc.)
  {
    type: "contact",
    pattern:
      /(?:to|with|for|contact|text|email|message|call)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
  },
  // Dates
  {
    type: "date",
    pattern:
      /(?:on|at|for|by)\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|next\s+\w+))/gi,
  },
  // Times
  { type: "time", pattern: /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/gi },
  // Content in quotes
  { type: "content", pattern: /"([^"]+)"|'([^']+)'/g },
];

/**
 * Dependency Resolver Service
 */
class DependencyResolverService {
  /**
   * Analyze user intent from natural language
   */
  analyzeIntent(userInput: string): IntentAnalysis {
    const lowerInput = userInput.toLowerCase();
    const words = lowerInput.split(/\s+/);

    // Find matching actions
    const matchedActions: {
      service: string;
      resource: string;
      operation: string;
      score: number;
    }[] = [];

    for (const word of words) {
      const actions = ACTION_KEYWORDS[word];
      if (actions) {
        for (const action of actions) {
          const existing = matchedActions.find(
            (a) =>
              a.service === action.service &&
              a.resource === action.resource &&
              a.operation === action.operation,
          );
          if (existing) {
            existing.score += 1;
          } else {
            matchedActions.push({ ...action, score: 1 });
          }
        }
      }
    }

    // Sort by score to get primary action
    matchedActions.sort((a, b) => b.score - a.score);

    // Extract entities
    const entities: IntentAnalysis["entities"] = [];
    for (const { type, pattern } of ENTITY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match = regex.exec(userInput);
      while (match !== null) {
        const value = match[1] || match[0];
        entities.push({
          type,
          value: value.trim(),
          raw: match[0],
        });
        match = regex.exec(userInput);
      }
    }

    // Determine potential services
    const potentialServices = [
      ...new Set(matchedActions.map((a) => a.service)),
    ];

    // Calculate confidence based on matches
    const confidence = Math.min(
      1,
      (matchedActions.length * 0.3 + entities.length * 0.2) / 2,
    );

    const primaryAction = matchedActions[0];

    return {
      primaryAction: primaryAction
        ? `${primaryAction.resource}.${primaryAction.operation}`
        : "unknown",
      targetService: primaryAction?.service,
      targetResource: primaryAction?.resource,
      entities,
      confidence,
      potentialServices,
    };
  }

  /**
   * Resolve dependencies for an operation
   */
  resolveDependencies(input: DependencyResolutionInput): DependencyResolutionResult {
    const result: DependencyResolutionResult = {
      canExecute: true,
      missingServices: [],
      missingScopes: [],
      prerequisites: [],
      executionPlan: [],
    };

    const spec = serviceSpecsRegistry.get(input.serviceId);
    if (!spec) {
      result.canExecute = false;
      result.missingServices.push(input.serviceId);
      return result;
    }

    // Check if service is connected
    const serviceConnection = input.connectedServices.find(
      (s) => s.serviceId === input.serviceId,
    );

    if (!serviceConnection?.connected) {
      result.canExecute = false;
      result.missingServices.push(input.serviceId);
      return result;
    }

    // Check scopes for OAuth services
    if (spec.authentication.type === "oauth2" && spec.authentication.scopes) {
      const requiredScopes = this.getRequiredScopesForOperation(
        spec,
        input.targetOperation,
      );
      const userScopes = serviceConnection.scopes || [];

      const missingScopes = requiredScopes.filter(
        (scope) => !userScopes.includes(scope),
      );
      if (missingScopes.length > 0) {
        result.missingScopes.push({
          serviceId: input.serviceId,
          scopes: missingScopes,
        });
        result.canExecute = false;
      }
    }

    // Check dependencies
    const dependencies = serviceSpecsRegistry.getDependencies(
      input.serviceId,
      input.targetOperation,
    );

    let stepNumber = 1;

    for (const dep of dependencies) {
      for (const dependsOn of dep.dependsOn) {
        // Parse the dependency (e.g., "database.exists_or_create")
        const [resource, action] = dependsOn.split(".");
        const isExistenceCheck =
          action === "exists" || action === "exists_or_create";

        if (isExistenceCheck) {
          // Check if user has the required resource
          const userResources = input.existingResources?.[resource] || [];

          if (userResources.length === 0) {
            if (action === "exists_or_create" && dep.resolution === "create") {
              // Add prerequisite to create the resource
              result.prerequisites.push({
                serviceId: input.serviceId,
                operation: `${resource}.create`,
                reason: `Need to create ${resource} before ${input.targetOperation}`,
              });

              result.executionPlan.push({
                step: stepNumber++,
                serviceId: input.serviceId,
                operation: `${resource}.create`,
                inputs: {},
              });
            } else if (dep.resolution === "fail") {
              result.canExecute = false;
              result.prerequisites.push({
                serviceId: input.serviceId,
                operation: `${resource}.exists`,
                reason: `${resource} must exist for ${input.targetOperation}`,
              });
            } else if (dep.resolution === "prompt_user") {
              result.prerequisites.push({
                serviceId: input.serviceId,
                operation: `${resource}.select`,
                reason: `User must select or provide ${resource}`,
              });
            }
          }
        } else {
          // Regular operation dependency
          const [depService, depOp] = dependsOn.includes(".")
            ? dependsOn.split(".")
            : [input.serviceId, dependsOn];

          // Check if the dependent service is connected
          const depConnection = input.connectedServices.find(
            (s) => s.serviceId === depService,
          );

          if (!depConnection?.connected) {
            result.missingServices.push(depService);
            result.canExecute = false;
          } else {
            // Add to execution plan
            result.executionPlan.push({
              step: stepNumber++,
              serviceId: depService,
              operation: depOp,
              inputs: {},
            });
          }
        }
      }
    }

    // Add the target operation as final step
    result.executionPlan.push({
      step: stepNumber,
      serviceId: input.serviceId,
      operation: input.targetOperation,
      inputs: {},
    });

    logger.info("[DependencyResolver] Resolution complete", {
      serviceId: input.serviceId,
      operation: input.targetOperation,
      canExecute: result.canExecute,
      prerequisites: result.prerequisites.length,
      executionPlanSteps: result.executionPlan.length,
    });

    return result;
  }

  /**
   * Get required scopes for an operation (simplified)
   */
  private getRequiredScopesForOperation(
    spec: ServiceSpecification,
    operation: string,
  ): string[] {
    // For now, return all scopes for the service
    // A more sophisticated implementation would map operations to specific scopes
    return spec.authentication.scopes || [];
  }

  /**
   * Build a complete dependency graph for a user intent
   */
  buildDependencyGraph(
    intent: IntentAnalysis,
    connectedServices: ServiceConnectionStatus[],
  ): {
    nodes: { id: string; type: "service" | "operation"; label: string }[];
    edges: { from: string; to: string; label?: string }[];
    resolutions: DependencyResolutionResult[];
  } {
    const nodes: { id: string; type: "service" | "operation"; label: string }[] =
      [];
    const edges: { from: string; to: string; label?: string }[] = [];
    const resolutions: DependencyResolutionResult[] = [];

    // Add service nodes
    for (const serviceId of intent.potentialServices) {
      const spec = serviceSpecsRegistry.get(serviceId);
      if (spec) {
        nodes.push({
          id: serviceId,
          type: "service",
          label: spec.name,
        });
      }
    }

    // Resolve dependencies for each potential operation
    if (intent.targetService && intent.targetResource) {
      const resolution = this.resolveDependencies({
        targetOperation: intent.primaryAction,
        serviceId: intent.targetService,
        connectedServices,
      });

      resolutions.push(resolution);

      // Add operation nodes and edges
      for (const step of resolution.executionPlan) {
        const nodeId = `${step.serviceId}.${step.operation}`;
        nodes.push({
          id: nodeId,
          type: "operation",
          label: step.operation,
        });

        edges.push({
          from: step.serviceId,
          to: nodeId,
        });

        // Add edges between steps
        if (step.step > 1) {
          const prevStep = resolution.executionPlan.find(
            (s) => s.step === step.step - 1,
          );
          if (prevStep) {
            edges.push({
              from: `${prevStep.serviceId}.${prevStep.operation}`,
              to: nodeId,
              label: `step ${step.step}`,
            });
          }
        }
      }
    }

    return { nodes, edges, resolutions };
  }

  /**
   * Generate a human-readable explanation of what needs to happen
   */
  explainResolution(resolution: DependencyResolutionResult): string {
    const lines: string[] = [];

    if (resolution.missingServices.length > 0) {
      lines.push(
        `Missing connections: ${resolution.missingServices.join(", ")}`,
      );
    }

    if (resolution.missingScopes.length > 0) {
      for (const { serviceId, scopes } of resolution.missingScopes) {
        lines.push(
          `${serviceId} needs additional permissions: ${scopes.join(", ")}`,
        );
      }
    }

    if (resolution.prerequisites.length > 0) {
      lines.push("Prerequisites:");
      for (const prereq of resolution.prerequisites) {
        lines.push(`  - ${prereq.reason}`);
      }
    }

    if (resolution.canExecute && resolution.executionPlan.length > 0) {
      lines.push("Execution plan:");
      for (const step of resolution.executionPlan) {
        lines.push(`  ${step.step}. ${step.serviceId}: ${step.operation}`);
      }
    }

    return lines.join("\n");
  }
}

export const dependencyResolver = new DependencyResolverService();
