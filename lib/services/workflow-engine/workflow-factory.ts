/**
 * Workflow Factory
 *
 * Orchestrates AI-powered workflow generation using Claude.
 * Integrates context building, dependency resolution, and code generation.
 * Inspired by plugin-n8n's iterative generation approach.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/utils/logger";
import {
  contextBuilder,
  type WorkflowContext,
  type GeneratedPrompt,
} from "./context-builder";
import { dependencyResolver } from "./dependency-resolver";
import type { ServiceConnectionStatus } from "./service-specs";

/**
 * Workflow generation request
 */
export interface WorkflowGenerationRequest {
  /** Natural language description of what user wants */
  userIntent: string;
  /** Organization requesting the workflow */
  organizationId: string;
  /** User ID */
  userId?: string;
  /** Connected services with their status */
  connectedServices: ServiceConnectionStatus[];
  /** Additional context or constraints */
  additionalContext?: string;
  /** Model to use (defaults to claude-3-opus) */
  model?: string;
  /** Max iterations for refinement */
  maxIterations?: number;
}

/**
 * Generated workflow result
 */
export interface GeneratedWorkflow {
  /** Unique ID for this workflow */
  id: string;
  /** Name derived from intent */
  name: string;
  /** Original user intent */
  userIntent: string;
  /** Generated TypeScript code */
  code: string;
  /** Services this workflow depends on */
  serviceDependencies: string[];
  /** Execution plan */
  executionPlan: {
    step: number;
    serviceId: string;
    operation: string;
  }[];
  /** Generation metadata */
  metadata: {
    model: string;
    iterations: number;
    tokensUsed: number;
    generatedAt: Date;
  };
  /** Validation results */
  validation: {
    syntaxValid: boolean;
    hasErrorHandling: boolean;
    hasTypedReturn: boolean;
    warnings: string[];
  };
}

/**
 * Generation job status
 */
export interface GenerationJob {
  id: string;
  status: "pending" | "generating" | "validating" | "completed" | "failed";
  progress: number;
  currentPhase: string;
  result?: GeneratedWorkflow;
  error?: string;
  logs: string[];
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Default Claude model for workflow generation
 */
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

/**
 * Workflow Factory Service
 */
class WorkflowFactoryService {
  private anthropic: Anthropic | null = null;
  private jobs: Map<string, GenerationJob> = new Map();

  /**
   * Initialize the factory with API key
   */
  initialize(apiKey: string): void {
    this.anthropic = new Anthropic({ apiKey });
    logger.info("[WorkflowFactory] Initialized with Anthropic API");
  }

  /**
   * Check if factory is ready
   */
  isReady(): boolean {
    return this.anthropic !== null;
  }

  /**
   * Generate a workflow from user intent
   */
  async generateWorkflow(
    request: WorkflowGenerationRequest,
  ): Promise<GeneratedWorkflow> {
    if (!this.anthropic) {
      throw new Error(
        "WorkflowFactory not initialized. Call initialize() with API key first.",
      );
    }

    const jobId = this.generateJobId();
    const job = this.createJob(jobId);

    try {
      // Phase 1: Analyze intent
      this.updateJob(jobId, {
        status: "generating",
        currentPhase: "Analyzing intent",
        progress: 10,
      });

      const intentAnalysis = dependencyResolver.analyzeIntent(request.userIntent);
      this.logToJob(
        jobId,
        `Intent analyzed: ${intentAnalysis.primaryAction} (confidence: ${intentAnalysis.confidence})`,
      );

      // Phase 2: Build context
      this.updateJob(jobId, {
        currentPhase: "Building context",
        progress: 20,
      });

      const context: WorkflowContext = {
        userIntent: request.userIntent,
        intentAnalysis,
        connectedServices: request.connectedServices,
        organizationId: request.organizationId,
        userId: request.userId,
        additionalContext: request.additionalContext,
      };

      const prompt = contextBuilder.buildPrompt(context);
      this.logToJob(jobId, `Context built: ~${prompt.estimatedTokens} tokens`);

      // Phase 3: Generate code
      this.updateJob(jobId, {
        currentPhase: "Generating workflow code",
        progress: 40,
      });

      const model = request.model || DEFAULT_MODEL;
      let generatedCode = "";
      let iterations = 0;
      const maxIterations = request.maxIterations || 3;
      let tokensUsed = 0;

      while (iterations < maxIterations) {
        iterations++;
        this.logToJob(jobId, `Generation iteration ${iterations}/${maxIterations}`);

        const response = await this.callClaude(
          prompt.fullPrompt,
          model,
          iterations > 1 ? generatedCode : undefined,
        );

        generatedCode = this.extractCode(response.content);
        tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

        // Phase 4: Validate
        this.updateJob(jobId, {
          currentPhase: "Validating code",
          progress: 60 + iterations * 10,
        });

        const validation = this.validateCode(generatedCode);

        if (validation.syntaxValid && validation.hasErrorHandling) {
          this.logToJob(jobId, "Code validation passed");
          break;
        }

        if (iterations < maxIterations) {
          this.logToJob(
            jobId,
            `Validation issues: ${validation.warnings.join(", ")}. Retrying...`,
          );
        }
      }

      // Phase 5: Finalize
      this.updateJob(jobId, {
        currentPhase: "Finalizing workflow",
        progress: 90,
      });

      const workflow: GeneratedWorkflow = {
        id: jobId,
        name: this.generateWorkflowName(request.userIntent),
        userIntent: request.userIntent,
        code: generatedCode,
        serviceDependencies: intentAnalysis.potentialServices,
        executionPlan: this.buildExecutionPlan(intentAnalysis, request.connectedServices),
        metadata: {
          model,
          iterations,
          tokensUsed,
          generatedAt: new Date(),
        },
        validation: this.validateCode(generatedCode),
      };

      this.updateJob(jobId, {
        status: "completed",
        currentPhase: "Complete",
        progress: 100,
        result: workflow,
        completedAt: new Date(),
      });

      this.logToJob(
        jobId,
        `Workflow generated successfully in ${iterations} iteration(s)`,
      );

      return workflow;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateJob(jobId, {
        status: "failed",
        error: errorMessage,
        completedAt: new Date(),
      });
      this.logToJob(jobId, `Generation failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get job status
   */
  getJob(jobId: string): GenerationJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Call Claude API
   */
  private async callClaude(
    prompt: string,
    model: string,
    previousCode?: string,
  ): Promise<Anthropic.Message> {
    if (!this.anthropic) {
      throw new Error("Anthropic client not initialized");
    }

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: prompt,
      },
    ];

    if (previousCode) {
      messages.push({
        role: "assistant",
        content: `Here's my previous attempt:\n\`\`\`typescript\n${previousCode}\n\`\`\``,
      });
      messages.push({
        role: "user",
        content:
          "The code needs improvement. Please fix any issues and regenerate with better error handling and type safety.",
      });
    }

    return this.anthropic.messages.create({
      model,
      max_tokens: 4096,
      temperature: 0,
      messages,
    });
  }

  /**
   * Extract code from Claude response
   */
  private extractCode(content: Anthropic.ContentBlock[]): string {
    const textContent = content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    // Extract code from markdown code blocks
    const codeBlockRegex = /```(?:typescript|ts|javascript|js)?\s*\n([\s\S]*?)```/g;
    const matches: string[] = [];
    let match = codeBlockRegex.exec(textContent);
    while (match !== null) {
      matches.push(match[1].trim());
      match = codeBlockRegex.exec(textContent);
    }

    if (matches.length > 0) {
      // Return the longest code block (likely the main implementation)
      return matches.reduce((a, b) => (a.length > b.length ? a : b));
    }

    // If no code blocks found, return the raw text
    return textContent;
  }

  /**
   * Validate generated code
   */
  private validateCode(code: string): GeneratedWorkflow["validation"] {
    const warnings: string[] = [];

    // Check for basic syntax (function definition)
    const hasFunctionDef =
      code.includes("async function") || code.includes("async (");
    if (!hasFunctionDef) {
      warnings.push("Missing async function definition");
    }

    // Check for error handling
    const hasErrorHandling = code.includes("try") && code.includes("catch");
    if (!hasErrorHandling) {
      warnings.push("Missing try/catch error handling");
    }

    // Check for typed return
    const hasTypedReturn =
      code.includes("Promise<") || code.includes(": WorkflowResult");
    if (!hasTypedReturn) {
      warnings.push("Missing typed return value");
    }

    // Check for credential usage
    const usesCredentials = code.includes("credentials");
    if (!usesCredentials) {
      warnings.push("Does not reference credentials parameter");
    }

    // Check for console.log (should use returns instead)
    if (code.includes("console.log")) {
      warnings.push("Contains console.log statements (should use structured returns)");
    }

    return {
      syntaxValid: hasFunctionDef,
      hasErrorHandling,
      hasTypedReturn,
      warnings,
    };
  }

  /**
   * Generate a workflow name from intent
   */
  private generateWorkflowName(intent: string): string {
    // Extract key action words
    const words = intent.toLowerCase().split(/\s+/);
    const actionWords = ["send", "check", "create", "get", "list", "search", "schedule", "text", "email"];
    const action = words.find((w) => actionWords.includes(w)) || "execute";

    // Extract target (noun after action)
    const actionIndex = words.findIndex((w) => actionWords.includes(w));
    const target = actionIndex >= 0 && actionIndex < words.length - 1
      ? words[actionIndex + 1]
      : "task";

    return `${action}_${target}_workflow`;
  }

  /**
   * Build execution plan from analysis
   */
  private buildExecutionPlan(
    intentAnalysis: ReturnType<typeof dependencyResolver.analyzeIntent>,
    connectedServices: ServiceConnectionStatus[],
  ): GeneratedWorkflow["executionPlan"] {
    if (!intentAnalysis.targetService) {
      return [];
    }

    const resolution = dependencyResolver.resolveDependencies({
      targetOperation: intentAnalysis.primaryAction,
      serviceId: intentAnalysis.targetService,
      connectedServices,
    });

    return resolution.executionPlan.map((step) => ({
      step: step.step,
      serviceId: step.serviceId,
      operation: step.operation,
    }));
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `wf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Create a new job
   */
  private createJob(jobId: string): GenerationJob {
    const job: GenerationJob = {
      id: jobId,
      status: "pending",
      progress: 0,
      currentPhase: "Initializing",
      logs: [],
      startedAt: new Date(),
    };
    this.jobs.set(jobId, job);
    return job;
  }

  /**
   * Update job status
   */
  private updateJob(jobId: string, updates: Partial<GenerationJob>): void {
    const job = this.jobs.get(jobId);
    if (job) {
      Object.assign(job, updates);
    }
  }

  /**
   * Log message to job
   */
  private logToJob(jobId: string, message: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      const timestamp = new Date().toISOString();
      job.logs.push(`[${timestamp}] ${message}`);
    }
    logger.info(`[WorkflowFactory] [${jobId}] ${message}`);
  }

  /**
   * Clean up old jobs (call periodically)
   */
  cleanupOldJobs(maxAgeMs = 3600000): void {
    const now = Date.now();
    for (const [jobId, job] of this.jobs.entries()) {
      if (now - job.startedAt.getTime() > maxAgeMs) {
        this.jobs.delete(jobId);
      }
    }
  }
}

export const workflowFactory = new WorkflowFactoryService();
