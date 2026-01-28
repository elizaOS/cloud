/**
 * Context Builder
 *
 * Builds comprehensive prompts for AI workflow generation.
 * Assembles all relevant context including connected services,
 * API specifications, dependency analysis, and example workflows.
 */

import { logger } from "@/lib/utils/logger";
import {
  serviceSpecsRegistry,
  type ServiceConnectionStatus,
  type ServiceSpecification,
} from "./service-specs";
import {
  dependencyResolver,
  type IntentAnalysis,
} from "./dependency-resolver";
import type { TemplateMatchResult } from "./workflow-template-search";

/**
 * Context for workflow generation
 */
export interface WorkflowContext {
  /** Original user intent */
  userIntent: string;
  /** Analyzed intent */
  intentAnalysis: IntentAnalysis;
  /** Connected services with their status */
  connectedServices: ServiceConnectionStatus[];
  /** Organization ID for credential access */
  organizationId: string;
  /** User ID */
  userId?: string;
  /** Additional context from user */
  additionalContext?: string;
  /** Similar templates found via semantic search */
  similarTemplates?: TemplateMatchResult[];
}

/**
 * Generated prompt for AI
 */
export interface GeneratedPrompt {
  /** System prompt setting up the AI's role */
  systemPrompt: string;
  /** User prompt with specific task */
  userPrompt: string;
  /** Full combined prompt */
  fullPrompt: string;
  /** Relevant examples */
  examples: string[];
  /** Estimated token count */
  estimatedTokens: number;
}

/**
 * Context Builder Service
 */
class ContextBuilderService {
  /**
   * Build a complete prompt for workflow generation
   */
  buildPrompt(context: WorkflowContext): GeneratedPrompt {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    // Rough token estimation (4 chars per token on average)
    const estimatedTokens = Math.ceil(fullPrompt.length / 4);

    const examples = serviceSpecsRegistry
      .findRelevantExamples(context.userIntent)
      .map(({ serviceId, example }) => this.formatExample(serviceId, example));

    logger.info("[ContextBuilder] Prompt built", {
      intentConfidence: context.intentAnalysis.confidence,
      connectedServices: context.connectedServices.filter((s) => s.connected)
        .length,
      estimatedTokens,
      examplesIncluded: examples.length,
    });

    return {
      systemPrompt,
      userPrompt,
      fullPrompt,
      examples,
      estimatedTokens,
    };
  }

  /**
   * Build the system prompt that sets up Claude's role
   */
  private buildSystemPrompt(): string {
    return `You are an expert ElizaOS workflow generator. Your task is to create production-ready 
workflow code that agents can execute to accomplish user tasks.

## Your Capabilities
- Generate TypeScript/JavaScript code that integrates with external services
- Handle authentication using provided credentials
- Implement proper error handling and retries
- Create reusable, well-documented workflows
- Handle multi-step operations with proper sequencing

## Code Requirements
1. Use async/await for all asynchronous operations
2. Include proper TypeScript types
3. Add JSDoc comments for the main function
4. Handle errors gracefully with meaningful messages
5. Return structured results that can be displayed to users
6. Follow ElizaOS plugin conventions

## Output Format
Provide the workflow as a single TypeScript function with:
- Clear function signature with typed parameters
- Proper error handling
- Meaningful return value
- Comments explaining key steps

Do NOT include:
- Placeholder credentials or API keys
- console.log statements (use structured returns instead)
- Incomplete implementations
- External dependencies not already available`;
  }

  /**
   * Build the user-specific prompt with all context
   */
  private buildUserPrompt(context: WorkflowContext): string {
    const sections: string[] = [];

    // User intent section
    sections.push(this.buildIntentSection(context));

    // Connected services section
    sections.push(this.buildServicesSection(context.connectedServices));

    // Similar templates section (if available) - placed before examples for higher priority
    if (context.similarTemplates && context.similarTemplates.length > 0) {
      sections.push(this.buildTemplatesSection(context.similarTemplates));
    }

    // Dependencies and execution plan
    sections.push(this.buildDependenciesSection(context));

    // API specifications for relevant services
    sections.push(this.buildAPISpecsSection(context));

    // Examples section
    sections.push(this.buildExamplesSection(context.userIntent));

    // Output requirements
    sections.push(this.buildOutputRequirements(context));

    return sections.filter(Boolean).join("\n\n---\n\n");
  }

  /**
   * Build section for similar templates found via semantic search
   * These are proven, working workflows that should be adapted
   */
  private buildTemplatesSection(templates: TemplateMatchResult[]): string {
    if (templates.length === 0) {
      return "";
    }

    let section = `## Similar Existing Workflows (Reference These Patterns)

The following workflows accomplish similar tasks and have been proven to work.
**Use these as your primary reference** when generating the new workflow.

`;

    for (const { template, similarity, matchReason, canAdapt } of templates) {
      const similarityPct = Math.round(similarity * 100);
      section += `### ${template.name} (${similarityPct}% similar${canAdapt ? " - HIGH MATCH" : ""})

**Original Intent**: "${template.user_intent}"
**Match Reason**: ${matchReason}
**Services Used**: ${template.service_dependencies?.join(", ") || "N/A"}

\`\`\`typescript
${template.generated_code}
\`\`\`

`;
    }

    section += `**Instructions**: Adapt the patterns from these templates to match the user's specific request. 
Reuse the proven code structure and error handling approaches.`;

    return section;
  }

  /**
   * Build the intent section
   */
  private buildIntentSection(context: WorkflowContext): string {
    const { intentAnalysis, userIntent, additionalContext } = context;

    let section = `## User Request
"${userIntent}"

## Intent Analysis
- Primary Action: ${intentAnalysis.primaryAction}
- Target Service: ${intentAnalysis.targetService || "Not determined"}
- Confidence: ${(intentAnalysis.confidence * 100).toFixed(0)}%`;

    if (intentAnalysis.entities.length > 0) {
      section += "\n- Extracted Entities:";
      for (const entity of intentAnalysis.entities) {
        section += `\n  - ${entity.type}: "${entity.value}"`;
      }
    }

    if (additionalContext) {
      section += `\n\n## Additional Context\n${additionalContext}`;
    }

    return section;
  }

  /**
   * Build the services section
   */
  private buildServicesSection(
    connectedServices: ServiceConnectionStatus[],
  ): string {
    const connected = connectedServices.filter((s) => s.connected);
    const disconnected = connectedServices.filter((s) => !s.connected);

    let section = "## Available Services\n";

    if (connected.length > 0) {
      section += "\n### Connected (credentials available):\n";
      for (const service of connected) {
        const spec = serviceSpecsRegistry.get(service.serviceId);
        section += `- **${spec?.name || service.serviceId}**`;
        if (service.scopes?.length) {
          section += ` (scopes: ${service.scopes.length})`;
        }
        if (service.expiresAt) {
          const expires = new Date(service.expiresAt);
          const now = new Date();
          if (expires > now) {
            section += " (valid)";
          } else {
            section += " (EXPIRED - needs refresh)";
          }
        }
        section += "\n";
      }
    }

    if (disconnected.length > 0) {
      section += "\n### Not Connected (cannot use):\n";
      for (const service of disconnected) {
        const spec = serviceSpecsRegistry.get(service.serviceId);
        section += `- ${spec?.name || service.serviceId}\n`;
      }
    }

    return section;
  }

  /**
   * Build the dependencies section
   */
  private buildDependenciesSection(context: WorkflowContext): string {
    const { intentAnalysis, connectedServices } = context;

    if (!intentAnalysis.targetService) {
      return "## Dependencies\nNo specific service identified - will use best available option.";
    }

    const resolution = dependencyResolver.resolveDependencies({
      targetOperation: intentAnalysis.primaryAction,
      serviceId: intentAnalysis.targetService,
      connectedServices,
    });

    let section = "## Dependency Analysis\n";

    if (!resolution.canExecute) {
      section += "\n⚠️ **Cannot execute directly**\n";

      if (resolution.missingServices.length > 0) {
        section += "\nMissing service connections:\n";
        for (const service of resolution.missingServices) {
          section += `- ${service}\n`;
        }
      }

      if (resolution.missingScopes.length > 0) {
        section += "\nMissing permissions:\n";
        for (const { serviceId, scopes } of resolution.missingScopes) {
          section += `- ${serviceId}: ${scopes.join(", ")}\n`;
        }
      }
    }

    if (resolution.prerequisites.length > 0) {
      section += "\n### Prerequisites (must complete first):\n";
      for (const prereq of resolution.prerequisites) {
        section += `- ${prereq.serviceId}.${prereq.operation}: ${prereq.reason}\n`;
      }
    }

    if (resolution.executionPlan.length > 0) {
      section += "\n### Execution Plan:\n";
      for (const step of resolution.executionPlan) {
        section += `${step.step}. ${step.serviceId} → ${step.operation}\n`;
      }
    }

    return section;
  }

  /**
   * Build API specifications section for relevant services
   */
  private buildAPISpecsSection(context: WorkflowContext): string {
    const relevantServices = new Set<string>();

    // Add target service
    if (context.intentAnalysis.targetService) {
      relevantServices.add(context.intentAnalysis.targetService);
    }

    // Add all potential services
    for (const serviceId of context.intentAnalysis.potentialServices) {
      relevantServices.add(serviceId);
    }

    // Only include connected services
    const connectedIds = new Set(
      context.connectedServices
        .filter((s) => s.connected)
        .map((s) => s.serviceId),
    );

    const servicesToInclude = [...relevantServices].filter((id) =>
      connectedIds.has(id),
    );

    if (servicesToInclude.length === 0) {
      return "";
    }

    let section = "## API Specifications\n";

    for (const serviceId of servicesToInclude) {
      const spec = serviceSpecsRegistry.get(serviceId);
      if (!spec) continue;

      section += `\n### ${spec.name}\n`;
      section += `Base URL: ${spec.baseUrl || "N/A"}\n`;
      section += `Authentication: ${spec.authentication.type}\n`;

      section += "\nOperations:\n";
      for (const [resourceName, resource] of Object.entries(spec.resources)) {
        for (const [opName, op] of Object.entries(resource)) {
          section += `- \`${resourceName}.${opName}\`: ${op.description || ""}\n`;
          section += `  - Requires: ${op.requires.join(", ")}\n`;
          if (op.outputs) {
            section += `  - Returns: ${op.outputs.join(", ")}\n`;
          }
          if (op.endpoint) {
            section += `  - Endpoint: ${op.method || "GET"} ${op.endpoint}\n`;
          }
        }
      }
    }

    return section;
  }

  /**
   * Build examples section
   */
  private buildExamplesSection(userIntent: string): string {
    const examples = serviceSpecsRegistry.findRelevantExamples(userIntent, 2);

    if (examples.length === 0) {
      return "";
    }

    let section = "## Similar Workflow Examples\n";

    for (const { serviceId, example } of examples) {
      section += `\n### Example: "${example.intent}"\n`;
      section += `Service: ${serviceId}\n`;
      section += `Operations: ${example.operations.join(" → ")}\n`;
      if (example.code) {
        section += `\`\`\`typescript\n${example.code.trim()}\n\`\`\`\n`;
      }
    }

    return section;
  }

  /**
   * Build output requirements section
   */
  private buildOutputRequirements(context: WorkflowContext): string {
    return `## Output Requirements

Generate a TypeScript workflow function that:

1. **Function Signature**:
\`\`\`typescript
interface WorkflowResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message: string;
}

async function execute${this.toPascalCase(context.intentAnalysis.primaryAction)}(
  credentials: { [key: string]: string },
  params: { [key: string]: unknown }
): Promise<WorkflowResult>
\`\`\`

2. **Credential Access**: Use \`credentials.{service}_{credential}\` format
   Example: \`credentials.google_access_token\`, \`credentials.twilio_auth_token\`

3. **Error Handling**: Wrap all API calls in try/catch and return meaningful errors

4. **Return Value**: Always return a WorkflowResult with:
   - \`success\`: boolean indicating if the operation completed
   - \`data\`: the actual result data (if successful)
   - \`error\`: error message (if failed)
   - \`message\`: human-readable summary for the user

5. **Organization**: ${context.organizationId}

Please generate the complete workflow code now.`;
  }

  /**
   * Format an example for inclusion in prompt
   */
  private formatExample(
    serviceId: string,
    example: NonNullable<ServiceSpecification["examples"]>[number],
  ): string {
    return `// Example: ${example.intent}
// Service: ${serviceId}
// Operations: ${example.operations.join(" → ")}
${example.code || "// No code example available"}`;
  }

  /**
   * Convert string to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split(/[._-]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
  }

  /**
   * Build a minimal prompt for simple tasks
   */
  buildMinimalPrompt(
    userIntent: string,
    serviceId: string,
    operation: string,
  ): string {
    const spec = serviceSpecsRegistry.get(serviceId);
    if (!spec) {
      return `Generate a workflow for: "${userIntent}"`;
    }

    const [resource, op] = operation.split(".");
    const opSpec = spec.resources[resource]?.[op];

    return `Generate an ElizaOS workflow for:
Intent: "${userIntent}"
Service: ${spec.name}
Operation: ${resource}.${op}
${opSpec?.description ? `Description: ${opSpec.description}` : ""}
${opSpec?.requires ? `Required inputs: ${opSpec.requires.join(", ")}` : ""}
${opSpec?.outputs ? `Expected outputs: ${opSpec.outputs.join(", ")}` : ""}

Return a TypeScript async function with proper error handling.`;
  }
}

export const contextBuilder = new ContextBuilderService();
