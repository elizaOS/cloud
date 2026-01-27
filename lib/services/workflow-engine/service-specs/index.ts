/**
 * Service Specifications Registry
 *
 * Central registry for all service API specifications used by the
 * AI Workflow Factory for context building and dependency resolution.
 */

import { googleSpec } from "./google";
import { notionSpec } from "./notion";
import { blooioSpec } from "./blooio";
import { twilioSpec } from "./twilio";
import type {
  ServiceSpecification,
  ServiceConnectionStatus,
  DependencyResolutionInput,
  DependencyResolutionResult,
} from "./types";

// Re-export types
export type {
  ServiceSpecification,
  ServiceResource,
  ResourceOperation,
  AuthenticationSpec,
  DependencySpec,
  WorkflowExample,
  ServiceConnectionStatus,
  DependencyResolutionInput,
  DependencyResolutionResult,
} from "./types";

// All registered service specifications
const serviceSpecs: Map<string, ServiceSpecification> = new Map([
  ["google", googleSpec],
  ["notion", notionSpec],
  ["blooio", blooioSpec],
  ["twilio", twilioSpec],
]);

/**
 * Service Specifications Registry
 *
 * Manages service API specifications for the AI Workflow Factory.
 */
class ServiceSpecsRegistry {
  /**
   * Get a service specification by ID
   */
  get(serviceId: string): ServiceSpecification | undefined {
    return serviceSpecs.get(serviceId);
  }

  /**
   * Get all service specifications
   */
  getAll(): ServiceSpecification[] {
    return Array.from(serviceSpecs.values());
  }

  /**
   * Get service IDs
   */
  getServiceIds(): string[] {
    return Array.from(serviceSpecs.keys());
  }

  /**
   * Register a new service specification
   */
  register(spec: ServiceSpecification): void {
    serviceSpecs.set(spec.id, spec);
  }

  /**
   * Check if a service is registered
   */
  has(serviceId: string): boolean {
    return serviceSpecs.has(serviceId);
  }

  /**
   * Get services that match a capability
   */
  findByCapability(
    capability: string,
  ): { serviceId: string; resource: string; operation: string }[] {
    const results: { serviceId: string; resource: string; operation: string }[] =
      [];
    const lowerCapability = capability.toLowerCase();

    for (const spec of serviceSpecs.values()) {
      for (const [resourceName, resource] of Object.entries(spec.resources)) {
        for (const [opName, op] of Object.entries(resource)) {
          const description = op.description?.toLowerCase() || "";
          if (
            description.includes(lowerCapability) ||
            opName.includes(lowerCapability) ||
            resourceName.includes(lowerCapability)
          ) {
            results.push({
              serviceId: spec.id,
              resource: resourceName,
              operation: opName,
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Get required scopes for an operation
   */
  getRequiredScopes(
    serviceId: string,
    operation: string,
  ): string[] | undefined {
    const spec = serviceSpecs.get(serviceId);
    if (!spec) return undefined;

    // For OAuth services, return all scopes for now
    // A more sophisticated implementation would map operations to specific scopes
    if (spec.authentication.type === "oauth2") {
      return spec.authentication.scopes;
    }

    return undefined;
  }

  /**
   * Get examples for a service
   */
  getExamples(serviceId: string): ServiceSpecification["examples"] {
    return serviceSpecs.get(serviceId)?.examples;
  }

  /**
   * Find relevant examples across all services for a user intent
   */
  findRelevantExamples(
    intent: string,
    limit = 3,
  ): { serviceId: string; example: NonNullable<ServiceSpecification["examples"]>[number] }[] {
    const results: {
      serviceId: string;
      example: NonNullable<ServiceSpecification["examples"]>[number];
      score: number;
    }[] = [];
    const lowerIntent = intent.toLowerCase();
    const intentWords = lowerIntent.split(/\s+/);

    for (const spec of serviceSpecs.values()) {
      if (!spec.examples) continue;

      for (const example of spec.examples) {
        const exampleIntent = example.intent.toLowerCase();
        let score = 0;

        // Score based on word matches
        for (const word of intentWords) {
          if (word.length > 2 && exampleIntent.includes(word)) {
            score += 1;
          }
        }

        // Bonus for key action words
        const actionWords = [
          "send",
          "create",
          "check",
          "get",
          "list",
          "search",
          "schedule",
          "text",
          "email",
          "message",
        ];
        for (const action of actionWords) {
          if (lowerIntent.includes(action) && exampleIntent.includes(action)) {
            score += 2;
          }
        }

        if (score > 0) {
          results.push({ serviceId: spec.id, example, score });
        }
      }
    }

    // Sort by score descending and take top results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ serviceId, example }) => ({ serviceId, example }));
  }

  /**
   * Get the dependency chain for an operation
   */
  getDependencies(
    serviceId: string,
    operation: string,
  ): ServiceSpecification["dependencies"] {
    const spec = serviceSpecs.get(serviceId);
    if (!spec) return [];

    return spec.dependencies.filter(
      (dep) =>
        dep.operation === operation ||
        dep.operation === `${serviceId}.${operation}`,
    );
  }

  /**
   * Generate a summary of a service for prompts
   */
  generateServiceSummary(serviceId: string): string {
    const spec = serviceSpecs.get(serviceId);
    if (!spec) return "";

    const resources = Object.entries(spec.resources)
      .map(([name, resource]) => {
        const ops = Object.keys(resource).join(", ");
        return `  - ${name}: ${ops}`;
      })
      .join("\n");

    return `
Service: ${spec.name}
Description: ${spec.description}
Authentication: ${spec.authentication.type}
Resources:
${resources}
`.trim();
  }

  /**
   * Generate a complete context for AI prompt building
   */
  generateFullContext(
    connectedServices: ServiceConnectionStatus[],
  ): string {
    const sections: string[] = [];

    sections.push("# Available Services and Capabilities\n");

    for (const connection of connectedServices) {
      const spec = serviceSpecs.get(connection.serviceId);
      if (!spec) continue;

      sections.push(`## ${spec.name} ${connection.connected ? "(Connected)" : "(Not Connected)"}`);
      sections.push(`${spec.description}\n`);

      if (connection.connected) {
        sections.push("### Available Operations:");
        for (const [resourceName, resource] of Object.entries(spec.resources)) {
          for (const [opName, op] of Object.entries(resource)) {
            sections.push(
              `- ${resourceName}.${opName}: ${op.description || ""}`,
            );
          }
        }
      }

      sections.push("");
    }

    return sections.join("\n");
  }
}

export const serviceSpecsRegistry = new ServiceSpecsRegistry();

// Export individual specs for direct access
export { googleSpec, notionSpec, blooioSpec, twilioSpec };
