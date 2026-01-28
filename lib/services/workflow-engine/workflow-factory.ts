/**
 * Workflow Factory
 *
 * Orchestrates AI-powered workflow generation using OpenAI GPT-4.
 * Integrates context building, dependency resolution, and code generation.
 * Inspired by plugin-n8n's iterative generation approach.
 */

import OpenAI from "openai";
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
 * Default OpenAI model for workflow generation
 */
const DEFAULT_MODEL = "gpt-4o";

/**
 * Workflow Factory Service
 */
class WorkflowFactoryService {
  private openai: OpenAI | null = null;
  private jobs: Map<string, GenerationJob> = new Map();

  /**
   * Initialize the factory with API key
   */
  initialize(apiKey: string): void {
    this.openai = new OpenAI({ apiKey });
    logger.info("[WorkflowFactory] Initialized with OpenAI API");
  }

  /**
   * Check if factory is ready
   */
  isReady(): boolean {
    return this.openai !== null;
  }

  /**
   * Generate a workflow from user intent
   */
  async generateWorkflow(
    request: WorkflowGenerationRequest,
  ): Promise<GeneratedWorkflow> {
    if (!this.openai) {
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

        const response = await this.callOpenAI(
          prompt.fullPrompt,
          model,
          iterations > 1 ? generatedCode : undefined,
        );

        generatedCode = this.extractCodeFromOpenAI(response);
        tokensUsed += (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0);

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
   * Call OpenAI API
   */
  private async callOpenAI(
    prompt: string,
    model: string,
    previousCode?: string,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    if (!this.openai) {
      throw new Error("OpenAI client not initialized");
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: "You are an expert workflow automation engineer. Generate clean, type-safe TypeScript code with proper error handling. Always wrap code in markdown code blocks with ```typescript.",
      },
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

    return this.openai.chat.completions.create({
      model,
      max_tokens: 4096,
      temperature: 0,
      messages,
    });
  }

  /**
   * Extract code from OpenAI response
   */
  private extractCodeFromOpenAI(response: OpenAI.Chat.Completions.ChatCompletion): string {
    const textContent = response.choices[0]?.message?.content || "";

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
    // If we have a clear target service, use the dependency resolver
    if (intentAnalysis.targetService) {
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

    // Fallback: Build execution plan from potential services
    if (intentAnalysis.potentialServices.length > 0) {
      const plan: GeneratedWorkflow["executionPlan"] = [];
      let stepNum = 1;

      for (const serviceId of intentAnalysis.potentialServices) {
        // Determine the operation based on the primary action or default
        let operation = intentAnalysis.primaryAction || "execute";
        
        // Map service to common operations
        if (serviceId === "google") {
          if (operation.includes("email") || operation === "unknown") {
            operation = "sendEmail";
          } else if (operation.includes("calendar")) {
            operation = "listCalendarEvents";
          }
        } else if (serviceId === "twilio") {
          operation = "sendSms";
        } else if (serviceId === "blooio") {
          operation = "sendIMessage";
        }

        plan.push({
          step: stepNum++,
          serviceId,
          operation,
        });
      }

      logger.info("[WorkflowFactory] Built fallback execution plan", {
        potentialServices: intentAnalysis.potentialServices,
        planSteps: plan.length,
      });

      return plan;
    }

    // Last resort: Create a generic execution plan for connected services
    const connectedServiceIds = connectedServices
      .filter(s => s.connected)
      .map(s => s.serviceId);

    if (connectedServiceIds.length > 0) {
      logger.warn("[WorkflowFactory] No target service detected, using first connected service");
      return [{
        step: 1,
        serviceId: connectedServiceIds[0],
        operation: "execute",
      }];
    }

    logger.warn("[WorkflowFactory] Could not build execution plan - no services available");
    return [];
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
