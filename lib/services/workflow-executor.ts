/**
 * Workflow Executor Service
 *
 * Executes workflows by processing nodes in topological order.
 * Handles agent calls, image generation, and output handling.
 */

import { workflowsRepository } from "@/db/repositories";
import { creditsService } from "./credits";
import { logger } from "@/lib/utils/logger";
import type { Workflow, WorkflowNode, WorkflowEdge } from "@/db/schemas";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

// ============================================================================
// Types
// ============================================================================

export interface WorkflowExecutionContext {
  workflowId: string;
  organizationId: string;
  userId: string;
  triggerInput?: Record<string, unknown>;
  nodeOutputs: Map<string, NodeOutput>;
  logs: ExecutionLog[];
  startedAt: Date;
}

export interface NodeOutput {
  nodeId: string;
  nodeType: string;
  output: unknown;
  executedAt: Date;
  durationMs: number;
}

export interface ExecutionLog {
  timestamp: Date;
  nodeId: string;
  level: "info" | "error" | "warn";
  message: string;
  data?: unknown;
}

export interface ExecutionResult {
  success: boolean;
  workflowId: string;
  outputs: Record<string, unknown>;
  logs: ExecutionLog[];
  totalDurationMs: number;
  creditsCharged: number;
  error?: string;
}

export interface TriggerNodeConfig {
  type: "manual" | "webhook" | "schedule";
  webhookId?: string;
  schedule?: string;
}

export interface AgentNodeConfig {
  mode: "my-agent" | "generic";
  agentId?: string; // For "my-agent" mode
  prompt: string;
  model?: string; // For "generic" mode
  useInputFromNode?: string; // Reference to previous node output
}

export interface ImageNodeConfig {
  model: string;
  prompt: string;
  width?: number;
  height?: number;
  usePromptFromNode?: string; // Use output from another node as prompt
}

export interface OutputNodeConfig {
  type: "display" | "save" | "webhook";
  webhookUrl?: string;
  saveToGallery?: boolean;
}

// ============================================================================
// Constants
// ============================================================================
const WORKFLOW_FLAT_RATE_CREDITS = 0.01; // Testing price - normally 10 credits

// ============================================================================
// Service
// ============================================================================

class WorkflowExecutorService {
  /**
   * Execute a workflow
   */
  async execute(
    workflowId: string,
    organizationId: string,
    userId: string,
    triggerInput?: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const startedAt = new Date();

    // Get workflow
    const workflow = await workflowsRepository.findByIdAndOrganization(
      workflowId,
      organizationId,
    );

    if (!workflow) {
      return {
        success: false,
        workflowId,
        outputs: {},
        logs: [],
        totalDurationMs: 0,
        creditsCharged: 0,
        error: "Workflow not found",
      };
    }

    // Deduct credits upfront (will fail if insufficient)
    const creditResult = await creditsService.deductCredits({
      organizationId,
      amount: WORKFLOW_FLAT_RATE_CREDITS,
      description: `Workflow execution: ${workflow.name}`,
      metadata: {
        workflowId,
        nodeCount: workflow.nodes.length,
      },
    });

    if (!creditResult.success) {
      return {
        success: false,
        workflowId,
        outputs: {},
        logs: [],
        totalDurationMs: 0,
        creditsCharged: 0,
        error: "Insufficient credits",
      };
    }

    // Create execution context
    const context: WorkflowExecutionContext = {
      workflowId,
      organizationId,
      userId,
      triggerInput,
      nodeOutputs: new Map(),
      logs: [],
      startedAt,
    };

    // Get execution order (topological sort)
    const executionOrder = this.getExecutionOrder(
      workflow.nodes,
      workflow.edges,
    );

    this.log(context, "info", "system", "Starting workflow execution", {
      nodeCount: executionOrder.length,
    });

    // Get retry config
    const retryEnabled = workflow.trigger_config.retryOnFailure ?? false;
    const maxRetries = workflow.trigger_config.maxRetries ?? 3;

    // Execute nodes in order
    for (const node of executionOrder) {
      const nodeStartTime = Date.now();
      let lastError: Error | null = null;
      let succeeded = false;

      // Retry loop
      const attempts = retryEnabled ? maxRetries : 1;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          if (attempt > 1) {
            this.log(
              context,
              "info",
              node.id,
              `Retry attempt ${attempt}/${maxRetries}`,
            );
            // Exponential backoff: 1s, 2s, 4s...
            await this.delay(Math.pow(2, attempt - 1) * 1000);
          }

          this.log(context, "info", node.id, `Executing ${node.type} node`);

          const output = await this.executeNode(node, context);

          const durationMs = Date.now() - nodeStartTime;
          context.nodeOutputs.set(node.id, {
            nodeId: node.id,
            nodeType: node.type,
            output,
            executedAt: new Date(),
            durationMs,
          });

          this.log(
            context,
            "info",
            node.id,
            `Node completed in ${durationMs}ms`,
          );
          succeeded = true;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          this.log(
            context,
            "warn",
            node.id,
            `Attempt ${attempt} failed: ${lastError.message}`,
          );
        }
      }

      if (!succeeded && lastError) {
        this.log(
          context,
          "error",
          node.id,
          `Node failed after ${attempts} attempt(s): ${lastError.message}`,
        );

        return {
          success: false,
          workflowId,
          outputs: this.collectOutputs(context),
          logs: context.logs,
          totalDurationMs: Date.now() - startedAt.getTime(),
          creditsCharged: WORKFLOW_FLAT_RATE_CREDITS, // Credits already deducted
          error: `Node ${node.id} failed: ${lastError.message}`,
        };
      }
    }

    this.log(
      context,
      "info",
      "system",
      `Workflow completed. Charged ${WORKFLOW_FLAT_RATE_CREDITS} credits`,
    );

    return {
      success: true,
      workflowId,
      outputs: this.collectOutputs(context),
      logs: context.logs,
      totalDurationMs: Date.now() - startedAt.getTime(),
      creditsCharged: WORKFLOW_FLAT_RATE_CREDITS,
    };
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    node: WorkflowNode,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const config = node.data as Record<string, unknown>;

    switch (node.type) {
      case "trigger":
        return this.executeTriggerNode(config, context);
      case "agent":
        return this.executeAgentNode(config, context);
      case "image":
        return this.executeImageNode(config, context);
      case "output":
        return this.executeOutputNode(config, context);
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  /**
   * Execute trigger node - passes through input data
   */
  private async executeTriggerNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    return {
      type: "trigger",
      input: context.triggerInput ?? {},
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Execute agent node - calls AI agent
   */
  private async executeAgentNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const mode = (config.mode as string) ?? "generic";
    const prompt = (config.prompt as string) ?? "Hello";
    const model = (config.model as string) ?? "gpt-4o-mini";

    // Build context from trigger and previous nodes
    let contextData = "";
    if (context.triggerInput) {
      contextData += `Trigger Input: ${JSON.stringify(context.triggerInput)}\n`;
    }

    // Get context from previous nodes
    for (const [nodeId, output] of context.nodeOutputs) {
      const data = output.output as Record<string, unknown>;
      if (data?.response) {
        contextData += `Previous output (${nodeId}): ${data.response}\n`;
      }
    }

    const finalPrompt = contextData
      ? `${prompt}\n\nContext:\n${contextData}`
      : prompt;

    if (mode === "my-agent") {
      const agentId = config.agentId as string;
      if (!agentId) {
        throw new Error("Agent ID required for my-agent mode");
      }

      // For my-agent mode, we'd call the agent's chat endpoint
      // For demo, use generic AI with a note
      this.log(
        context,
        "info",
        "agent",
        `Using agent: ${agentId} (demo mode)`,
      );
    }

    // Call AI using Vercel AI SDK
    this.log(context, "info", "agent", `Calling ${model}...`);

    const result = await generateText({
      model: openai(model),
      prompt: finalPrompt,
    });

    return {
      type: "agent",
      mode,
      model,
      prompt: finalPrompt,
      response: result.text,
      usage: result.usage,
    };
  }

  /**
   * Execute image node - generates images
   */
  private async executeImageNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const model = (config.model as string) ?? "fal-ai/flux/schnell";
    let prompt = (config.prompt as string) ?? "A beautiful landscape";
    const width = (config.width as number) ?? 1024;
    const height = (config.height as number) ?? 1024;
    const usePromptFromNode = config.usePromptFromNode as string | undefined;

    // Get prompt from previous node if specified
    if (usePromptFromNode) {
      const previousOutput = context.nodeOutputs.get(usePromptFromNode);
      if (previousOutput?.output) {
        const prevData = previousOutput.output as Record<string, unknown>;
        if (prevData.response) {
          prompt = prevData.response as string;
        }
      }
    }

    // TODO: Integrate with FAL.ai for actual image generation
    return {
      type: "image",
      model,
      prompt,
      width,
      height,
      imageUrl: "[Image URL placeholder]",
    };
  }

  /**
   * Execute output node - handles results
   */
  private async executeOutputNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const outputType = (config.type as string) ?? "display";

    // Collect all previous outputs
    const allOutputs = this.collectOutputs(context);

    if (outputType === "webhook") {
      const webhookUrl = config.webhookUrl as string;
      if (webhookUrl) {
        // TODO: Send to webhook
        this.log(
          context,
          "info",
          "output",
          `Would send to webhook: ${webhookUrl}`,
        );
      }
    }

    if (outputType === "save" && config.saveToGallery) {
      // TODO: Save generated images to gallery
      this.log(context, "info", "output", "Would save to gallery");
    }

    return {
      type: "output",
      outputType,
      data: allOutputs,
    };
  }

  /**
   * Get topological execution order
   */
  private getExecutionOrder(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
  ): WorkflowNode[] {
    // Build adjacency list
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize
    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    // Count in-degrees
    for (const edge of edges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
      adjacency.get(edge.source)?.push(edge.target);
    }

    // Kahn's algorithm
    const queue: string[] = [];
    const result: WorkflowNode[] = [];
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Start with nodes with no dependencies
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const node = nodeMap.get(nodeId);
      if (node) {
        result.push(node);
      }

      for (const neighbor of adjacency.get(nodeId) ?? []) {
        inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result;
  }

  /**
   * Collect outputs from all nodes
   */
  private collectOutputs(
    context: WorkflowExecutionContext,
  ): Record<string, unknown> {
    const outputs: Record<string, unknown> = {};
    for (const [nodeId, output] of context.nodeOutputs) {
      outputs[nodeId] = output.output;
    }
    return outputs;
  }

  /**
   * Add execution log
   */
  private log(
    context: WorkflowExecutionContext,
    level: "info" | "error" | "warn",
    nodeId: string,
    message: string,
    data?: unknown,
  ): void {
    context.logs.push({
      timestamp: new Date(),
      nodeId,
      level,
      message,
      data,
    });

    logger.info(`[Workflow:${context.workflowId}] [${nodeId}] ${message}`, data);
  }

  /**
   * Delay helper for retry backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const workflowExecutorService = new WorkflowExecutorService();
