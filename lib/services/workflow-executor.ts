/**
 * Workflow Executor Service
 *
 * Executes workflows by processing nodes in topological order.
 * Handles agent calls, image generation, and output handling.
 */

import { workflowsRepository, generationsRepository } from "@/db/repositories";
import { creditsService } from "./credits";
import { logger } from "@/lib/utils/logger";
import type { Workflow, WorkflowNode, WorkflowEdge } from "@/db/schemas";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { fal } from "@fal-ai/client";
import { ensureElizaCloudUrl, uploadToBlob } from "@/lib/blob";
import { discordService } from "./discord";
import { getElevenLabsService } from "./elevenlabs";

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
      case "delay":
        return this.executeDelayNode(config, context);
      case "http":
        return this.executeHttpNode(config, context);
      case "condition":
        return this.executeConditionNode(config, context);
      case "tts":
        return this.executeTtsNode(config, context);
      case "discord":
        return this.executeDiscordNode(config, context);
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
   * Execute image node - generates images using FAL.ai
   */
  private async executeImageNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const model = (config.model as string) ?? "fal-ai/flux/schnell";
    let prompt = (config.prompt as string) ?? "";
    const width = (config.width as number) ?? 1024;
    const height = (config.height as number) ?? 1024;

    // Auto-detect prompt from previous agent node if not specified
    if (!prompt) {
      for (const [, output] of context.nodeOutputs) {
        const data = output.output as Record<string, unknown>;
        if (data?.type === "agent" && data?.response) {
          prompt = data.response as string;
          this.log(
            context,
            "info",
            "image",
            "Using agent response as image prompt",
          );
          break;
        }
      }
    }

    // Default fallback prompt
    if (!prompt) {
      prompt = "A beautiful landscape";
    }

    this.log(context, "info", "image", `Generating image with ${model}...`);
    this.log(context, "info", "image", `Prompt: ${prompt.slice(0, 100)}...`);

    // Call FAL.ai
    const result = await fal.subscribe(model, {
      input: {
        prompt,
        image_size: { width, height },
      },
    });

    // Extract image URL from result
    const imageUrl =
      result.data?.images?.[0]?.url ??
      result.data?.image?.url ??
      result.data?.url ??
      null;

    if (!imageUrl) {
      throw new Error("FAL.ai did not return an image URL");
    }

    this.log(context, "info", "image", "Image generated successfully");

    return {
      type: "image",
      model,
      prompt,
      width,
      height,
      imageUrl,
    };
  }

  /**
   * Execute output node - handles results and saves to gallery
   */
  private async executeOutputNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const outputType = (config.outputType as string) ?? "display";
    const saveToGallery = (config.saveToGallery as boolean) ?? true; // Default to save

    // Collect all previous outputs
    const allOutputs = this.collectOutputs(context);
    const savedImages: string[] = [];

    // Always save images to gallery (or based on config)
    if (saveToGallery) {
      for (const [nodeId, output] of context.nodeOutputs) {
        const data = output.output as Record<string, unknown>;

        if (data?.type === "image" && data?.imageUrl) {
          this.log(context, "info", "output", `Saving image from ${nodeId} to gallery...`);

          // Proxy FAL.ai URL through our blob storage
          const originalUrl = data.imageUrl as string;
          this.log(context, "info", "output", "Uploading to blob storage...");
          const storageUrl = await ensureElizaCloudUrl(originalUrl, {
            filename: `workflow-${context.workflowId}-${nodeId}.jpg`,
            folder: "workflows",
            userId: context.userId,
            fallbackToOriginal: false,
          });

          await generationsRepository.create({
            organization_id: context.organizationId,
            user_id: context.userId,
            type: "image",
            model: (data.model as string) ?? "fal-ai/flux/schnell",
            provider: "fal",
            prompt: (data.prompt as string) ?? "",
            status: "completed",
            storage_url: storageUrl,
            dimensions: {
              width: (data.width as number) ?? 1024,
              height: (data.height as number) ?? 1024,
            },
            metadata: {
              source: "workflow",
              workflowId: context.workflowId,
              nodeId,
              originalUrl,
            },
            completed_at: new Date(),
          });

          savedImages.push(storageUrl);
          this.log(context, "info", "output", "Image saved to gallery!");
        }
      }
    }

    if (outputType === "webhook") {
      const webhookUrl = config.webhookUrl as string;
      if (webhookUrl) {
        this.log(context, "info", "output", `Sending to webhook: ${webhookUrl}`);
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(allOutputs),
        });
        this.log(context, "info", "output", "Webhook sent successfully");
      }
    }

    return {
      type: "output",
      outputType,
      savedImages,
      data: allOutputs,
    };
  }

  /**
   * Execute delay node - waits for specified time
   */
  private async executeDelayNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const delayMs = ((config.delaySeconds as number) ?? 5) * 1000;

    this.log(context, "info", "delay", `Waiting for ${delayMs / 1000} seconds...`);
    await this.delay(delayMs);
    this.log(context, "info", "delay", "Delay completed");

    return {
      type: "delay",
      delayMs,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Execute HTTP node - makes HTTP requests
   */
  private async executeHttpNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const url = config.url as string;
    const method = (config.method as string) ?? "GET";
    const headers = (config.headers as Record<string, string>) ?? {};
    let body = config.body as string | undefined;

    if (!url) {
      throw new Error("URL is required for HTTP node");
    }

    // Replace placeholders in URL and body with previous node outputs
    const outputs = this.collectOutputs(context);
    for (const [nodeId, output] of Object.entries(outputs)) {
      const data = output as Record<string, unknown>;
      if (data?.response) {
        body = body?.replace(`{{${nodeId}}}`, String(data.response));
      }
    }

    this.log(context, "info", "http", `Making ${method} request to ${url}`);

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      ...(body && method !== "GET" ? { body } : {}),
    });

    const responseText = await response.text();
    let responseData: unknown;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    this.log(context, "info", "http", `Response status: ${response.status}`);

    return {
      type: "http",
      url,
      method,
      status: response.status,
      response: responseData,
    };
  }

  /**
   * Execute condition node - branches based on condition
   */
  private async executeConditionNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const field = (config.field as string) ?? "response";
    const operator = (config.operator as string) ?? "contains";
    const value = (config.value as string) ?? "";

    // Get the latest agent response to check
    let textToCheck = "";
    for (const [, output] of context.nodeOutputs) {
      const data = output.output as Record<string, unknown>;
      if (data?.response) {
        textToCheck = String(data.response);
      }
    }

    let result = false;
    switch (operator) {
      case "contains":
        result = textToCheck.toLowerCase().includes(value.toLowerCase());
        break;
      case "equals":
        result = textToCheck.toLowerCase() === value.toLowerCase();
        break;
      case "startsWith":
        result = textToCheck.toLowerCase().startsWith(value.toLowerCase());
        break;
      case "endsWith":
        result = textToCheck.toLowerCase().endsWith(value.toLowerCase());
        break;
      case "regex":
        result = new RegExp(value, "i").test(textToCheck);
        break;
      default:
        result = textToCheck.toLowerCase().includes(value.toLowerCase());
    }

    this.log(
      context,
      "info",
      "condition",
      `Condition: "${field}" ${operator} "${value}" = ${result}`,
    );

    return {
      type: "condition",
      field,
      operator,
      value,
      result,
      branch: result ? "true" : "false",
    };
  }

  /**
   * Execute TTS node - generates speech from text
   */
  private async executeTtsNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const voiceId = (config.voiceId as string) ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel voice
    let text = (config.text as string) ?? "";

    // Auto-use previous agent response if no text specified
    if (!text) {
      for (const [, output] of context.nodeOutputs) {
        const data = output.output as Record<string, unknown>;
        if (data?.type === "agent" && data?.response) {
          text = String(data.response);
          this.log(context, "info", "tts", "Using agent response as TTS input");
          break;
        }
      }
    }

    if (!text) {
      throw new Error("No text provided for TTS");
    }

    this.log(context, "info", "tts", `Generating speech (${text.length} chars)...`);

    const elevenlabs = getElevenLabsService();
    const audioStream = await elevenlabs.textToSpeech({
      text,
      voiceId,
      modelId: "eleven_monolingual_v1",
    });

    // Convert stream to buffer and upload to blob storage
    const chunks: Uint8Array[] = [];
    const reader = audioStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const audioBuffer = Buffer.concat(chunks);

    const { url: audioUrl } = await uploadToBlob(audioBuffer, {
      filename: `workflow-${context.workflowId}-tts-${Date.now()}.mp3`,
      folder: "workflows/audio",
      userId: context.userId,
      contentType: "audio/mpeg",
    });

    this.log(context, "info", "tts", "Audio generated and uploaded");

    return {
      type: "tts",
      voiceId,
      text: text.slice(0, 100) + (text.length > 100 ? "..." : ""),
      audioUrl,
    };
  }

  /**
   * Execute Discord node - sends message to Discord
   */
  private async executeDiscordNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const channelId = config.channelId as string | undefined;
    let message = (config.message as string) ?? "";

    // Auto-compose message from previous outputs if not specified
    if (!message) {
      const outputs = this.collectOutputs(context);
      for (const [nodeId, output] of Object.entries(outputs)) {
        const data = output as Record<string, unknown>;
        if (data?.response) {
          message += `**${nodeId}:**\n${data.response}\n\n`;
        }
        if (data?.imageUrl) {
          message += `**Image:** ${data.imageUrl}\n`;
        }
      }
    }

    if (!message) {
      message = `Workflow ${context.workflowId} completed at ${new Date().toISOString()}`;
    }

    this.log(context, "info", "discord", `Sending message to Discord...`);

    const sent = await discordService.sendText(message, channelId);

    this.log(
      context,
      sent ? "info" : "warn",
      "discord",
      sent ? "Message sent to Discord" : "Failed to send to Discord (check config)",
    );

    return {
      type: "discord",
      channelId: channelId ?? "default",
      messageSent: sent,
      messagePreview: message.slice(0, 100),
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
