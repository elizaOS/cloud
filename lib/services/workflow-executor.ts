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
import { twitterProvider } from "./social-media/providers/twitter";
import { telegramProvider } from "./social-media/providers/telegram";
import nodemailer from "nodemailer";

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
      case "mcp":
        return this.executeMcpNode(config, context);
      case "twitter":
        return this.executeTwitterNode(config, context);
      case "telegram":
        return this.executeTelegramNode(config, context);
      case "email":
        return this.executeEmailNode(config, context);
      case "app-query":
        return this.executeAppQueryNode(config, context);
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
   * Execute agent node - calls AI with user's agent character
   */
  private async executeAgentNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const agentId = config.agentId as string;
    const agentName = config.agentName as string;
    const prompt = (config.prompt as string) ?? "";

    if (!agentId) {
      throw new Error("No agent selected. Please configure the agent node and select one of your agents.");
    }

    // Build context from trigger and previous nodes
    let contextData = "";
    if (context.triggerInput) {
      contextData += `Trigger Input: ${JSON.stringify(context.triggerInput)}\n`;
    }

    for (const [nodeId, output] of context.nodeOutputs) {
      const data = output.output as Record<string, unknown>;
      if (data?.response) {
        contextData += `Previous output (${nodeId}): ${data.response}\n`;
      }
    }

    const finalPrompt = contextData
      ? `${prompt}\n\nContext:\n${contextData}`
      : prompt;

    this.log(context, "info", "agent", `Calling agent: ${agentName ?? agentId}`);

    // Fetch character data to build system prompt
    const { charactersService } = await import("@/lib/services/characters/characters");
    const character = await charactersService.getById(agentId);
    
    if (!character) {
      throw new Error(`Agent "${agentName}" not found. It may have been deleted.`);
    }

    // Build system prompt from character
    const bioText = Array.isArray(character.bio)
      ? character.bio.join("\n")
      : character.bio ?? "";
    const systemPrompt = character.system ?? `You are ${character.name}. ${bioText}`;

    // Call AI directly using Vercel AI SDK
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      prompt: finalPrompt,
    });

    const agentResponse = result.text;

    this.log(context, "info", "agent", `Agent responded (${agentResponse.length} chars)`);

    return {
      type: "agent",
      agentId,
      agentName: character.name,
      prompt: finalPrompt,
      response: agentResponse,
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
   * Execute Discord node - sends message to Discord via webhook
   * Supports text messages, images, and audio attachments
   */
  private async executeDiscordNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const webhookUrl = config.webhookUrl as string | undefined;
    let message = (config.message as string) ?? "";

    if (!webhookUrl) {
      throw new Error("Discord Webhook URL is required. Get one from Discord Server Settings → Integrations → Webhooks");
    }

    // Validate webhook URL format
    if (!webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
      throw new Error("Invalid Discord Webhook URL. It should start with https://discord.com/api/webhooks/");
    }

    // Auto-detect media from previous nodes (audio from TTS, images from image node)
    let audioUrl: string | undefined;
    let imageUrl: string | undefined;
    
    for (const [, output] of context.nodeOutputs) {
      const data = output.output as Record<string, unknown>;
      if (data?.type === "tts" && data?.audioUrl) {
        audioUrl = data.audioUrl as string;
      }
      if (data?.type === "image" && data?.imageUrl) {
        imageUrl = data.imageUrl as string;
      }
    }

    // Auto-compose message from previous outputs if not specified
    if (!message) {
      const outputs = this.collectOutputs(context);
      for (const [nodeId, output] of Object.entries(outputs)) {
        const data = output as Record<string, unknown>;
        if (data?.response) {
          message += `**${nodeId}:**\n${data.response}\n\n`;
        }
      }
    }

    if (!message && !audioUrl && !imageUrl) {
      message = `Workflow ${context.workflowId} completed at ${new Date().toISOString()}`;
    }

    this.log(context, "info", "discord", `Sending message via Discord webhook...`);

    let attachedFiles: string[] = [];

    // If we have audio or images, send as multipart/form-data with file attachment
    if (audioUrl || imageUrl) {
      const formData = new FormData();
      
      // Add message content
      const payload: Record<string, unknown> = {};
      if (message) {
        payload.content = message;
      }
      formData.append("payload_json", JSON.stringify(payload));

      // Attach audio file if present
      if (audioUrl) {
        this.log(context, "info", "discord", "Attaching audio file...");
        const audioResponse = await fetch(audioUrl);
        const audioBuffer = await audioResponse.arrayBuffer();
        formData.append("files[0]", new Blob([audioBuffer], { type: "audio/mpeg" }), "audio.mp3");
        attachedFiles.push("audio.mp3");
      }

      // Attach image file if present (as second file if audio exists)
      if (imageUrl) {
        this.log(context, "info", "discord", "Attaching image file...");
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        const fileIndex = audioUrl ? 1 : 0;
        formData.append(`files[${fileIndex}]`, new Blob([imageBuffer], { type: "image/jpeg" }), "image.jpg");
        attachedFiles.push("image.jpg");
      }

      const response = await fetch(webhookUrl, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Discord webhook failed: ${response.status} - ${errorText}`);
      }
    } else {
      // Simple text-only message (most common case - fast path)
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Discord webhook failed: ${response.status} - ${errorText}`);
      }
    }

    this.log(context, "info", "discord", "Message sent to Discord successfully");

    return {
      type: "discord",
      webhookConfigured: true,
      messageSent: true,
      messagePreview: message?.slice(0, 100) ?? "",
      attachedFiles,
    };
  }

  /**
   * Execute MCP node - calls an MCP tool
   */
  private async executeMcpNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const mcpServer = (config.mcpServer as string) ?? "";
    const toolName = (config.toolName as string) ?? "";
    let toolArgs = (config.toolArgs as Record<string, unknown>) ?? {};

    if (!mcpServer || !toolName) {
      throw new Error("MCP server and tool name are required");
    }

    // Map MCP server IDs to their endpoints
    const mcpEndpoints: Record<string, string> = {
      crypto: "/api/mcps/crypto/mcp",
      time: "/api/mcps/time/mcp",
      weather: "/api/mcps/weather/mcp",
    };

    const endpoint = mcpEndpoints[mcpServer];
    if (!endpoint) {
      throw new Error(`Unknown MCP server: ${mcpServer}`);
    }

    // Substitute placeholders in tool arguments with previous node outputs
    const processedArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(toolArgs)) {
      if (typeof value === "string" && value.startsWith("{{") && value.endsWith("}}")) {
        const nodeId = value.slice(2, -2);
        const nodeOutput = context.nodeOutputs.get(nodeId);
        if (nodeOutput) {
          const data = nodeOutput.output as Record<string, unknown>;
          processedArgs[key] = data?.response ?? data;
        } else {
          processedArgs[key] = value;
        }
      } else {
        processedArgs[key] = value;
      }
    }

    this.log(context, "info", "mcp", `Calling ${mcpServer}/${toolName}...`);

    // Build JSON-RPC request
    const mcpRequest = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: toolName,
        arguments: processedArgs,
      },
      id: `workflow-${context.workflowId}-${Date.now()}`,
    };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mcpRequest),
    });

    if (!response.ok) {
      throw new Error(`MCP call failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(`MCP error: ${result.error.message ?? JSON.stringify(result.error)}`);
    }

    this.log(context, "info", "mcp", `MCP tool ${toolName} completed`);

    // Extract the actual content from MCP response
    const content = result.result?.content?.[0]?.text;
    let parsedContent: unknown = content;
    if (content) {
      try {
        parsedContent = JSON.parse(content);
      } catch {
        parsedContent = content;
      }
    }

    return {
      type: "mcp",
      mcpServer,
      toolName,
      args: processedArgs,
      response: parsedContent,
      raw: result,
    };
  }

  /**
   * Execute Twitter node - posts to Twitter/X via API credentials
   */
  private async executeTwitterNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const action = (config.action as string) ?? "post";
    let tweetText = (config.tweetText as string) ?? "";
    const replyToTweetId = config.replyToTweetId as string | undefined;
    const targetTweetId = config.targetTweetId as string | undefined;

    // Get Twitter credentials from node config
    const apiKey = config.apiKey as string | undefined;
    const apiSecret = config.apiSecret as string | undefined;
    const accessToken = config.accessToken as string | undefined;
    const accessTokenSecret = config.accessTokenSecret as string | undefined;

    if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
      throw new Error(
        "Twitter API credentials not configured. Click on the Twitter node and enter your API credentials.",
      );
    }

    // Replace placeholders with previous node outputs
    const outputs = this.collectOutputs(context);
    for (const [nodeId, output] of Object.entries(outputs)) {
      const data = output as Record<string, unknown>;
      if (data?.response) {
        tweetText = tweetText.replace(`{{${nodeId}}}`, String(data.response));
      }
    }

    // Auto-use previous agent response if no text specified
    if (!tweetText && (action === "post" || action === "reply")) {
      for (const [, output] of context.nodeOutputs) {
        const data = output.output as Record<string, unknown>;
        if (data?.type === "agent" && data?.response) {
          tweetText = String(data.response).slice(0, 280);
          this.log(context, "info", "twitter", "Using agent response as tweet text");
          break;
        }
      }
    }

    const credentials = { accessToken };

    this.log(context, "info", "twitter", `Executing Twitter action: ${action}`);

    let postId: string | undefined;
    let postUrl: string | undefined;

    switch (action) {
      case "post": {
        if (!tweetText) {
          throw new Error("Tweet text is required for posting");
        }
        const postResult = await twitterProvider.createPost(credentials, { text: tweetText });
        if (!postResult.success) {
          throw new Error(`Twitter post failed: ${postResult.error}`);
        }
        postId = postResult.postId;
        postUrl = postResult.postUrl;
        break;
      }

      case "reply": {
        if (!tweetText || !replyToTweetId) {
          throw new Error("Tweet text and reply-to ID are required for replying");
        }
        const replyResult = await twitterProvider.createPost(credentials, { 
          text: tweetText, 
          replyToId: replyToTweetId,
        });
        if (!replyResult.success) {
          throw new Error(`Twitter reply failed: ${replyResult.error}`);
        }
        postId = replyResult.postId;
        postUrl = replyResult.postUrl;
        break;
      }

      case "like": {
        if (!targetTweetId) {
          throw new Error("Target tweet ID is required for liking");
        }
        const likeResult = await twitterProvider.likePost!(credentials, targetTweetId);
        if (!likeResult.success) {
          throw new Error(`Twitter like failed: ${likeResult.error}`);
        }
        break;
      }

      case "retweet": {
        if (!targetTweetId) {
          throw new Error("Target tweet ID is required for retweeting");
        }
        const retweetResult = await twitterProvider.repost!(credentials, targetTweetId);
        if (!retweetResult.success) {
          throw new Error(`Twitter retweet failed: ${retweetResult.error}`);
        }
        postId = retweetResult.postId;
        break;
      }

      default:
        throw new Error(`Unknown Twitter action: ${action}`);
    }

    this.log(context, "info", "twitter", `Twitter ${action} completed successfully`);

    return {
      type: "twitter",
      action,
      success: true,
      postId,
      postUrl,
      tweetText: tweetText?.slice(0, 100),
    };
  }

  /**
   * Execute Telegram node - sends message to Telegram via bot
   * Requires: Bot Token (from @BotFather) and Chat ID
   */
  private async executeTelegramNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const botToken = config.botToken as string | undefined;
    const chatId = config.chatId as string | undefined;
    let message = (config.message as string) ?? "";

    if (!botToken) {
      throw new Error("Telegram Bot Token is required. Get one from @BotFather on Telegram.");
    }

    if (!chatId) {
      throw new Error("Telegram Chat ID is required. This is the channel/group/user ID to send messages to.");
    }

    // Auto-compose message from previous outputs if not specified
    if (!message) {
      for (const [, output] of context.nodeOutputs) {
        const data = output.output as Record<string, unknown>;
        if (data?.type === "agent" && data?.response) {
          message = String(data.response);
          this.log(context, "info", "telegram", "Using agent response as message");
          break;
        }
      }
    }

    if (!message) {
      message = `Workflow completed at ${new Date().toISOString()}`;
    }

    // Check for image from previous nodes
    let imageUrl: string | undefined;
    for (const [, output] of context.nodeOutputs) {
      const data = output.output as Record<string, unknown>;
      if (data?.type === "image" && data?.imageUrl) {
        imageUrl = data.imageUrl as string;
      }
    }

    this.log(context, "info", "telegram", `Sending message to Telegram chat ${chatId}...`);

    const credentials = { botToken };
    
    const result = await telegramProvider.createPost(
      credentials,
      { 
        text: message,
        media: imageUrl ? [{ url: imageUrl, type: "image" as const, mimeType: "image/jpeg" }] : undefined,
      },
      { telegram: { chatId } }
    );

    if (!result.success) {
      throw new Error(`Telegram send failed: ${result.error}`);
    }

    this.log(context, "info", "telegram", "Message sent to Telegram successfully");

    return {
      type: "telegram",
      success: true,
      chatId,
      messageId: result.postId,
      messagePreview: message.slice(0, 100),
      hasImage: !!imageUrl,
    };
  }

  /**
   * Execute Email node - sends email via user's SMTP credentials
   */
  private async executeEmailNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const toEmail = config.toEmail as string | undefined;
    const subject = (config.subject as string) ?? "Workflow Notification";
    let body = (config.body as string) ?? "";

    // SMTP credentials from node config
    const smtpHost = config.smtpHost as string | undefined;
    const smtpPort = (config.smtpPort as number) ?? 587;
    const smtpUser = config.smtpUser as string | undefined;
    const smtpPassword = config.smtpPassword as string | undefined;
    const fromEmail = (config.fromEmail as string) ?? smtpUser;

    if (!smtpHost || !smtpPassword) {
      throw new Error("SMTP credentials are required. Click Configure in the Email node to set up your SMTP server (Gmail, SendGrid, etc.).");
    }

    if (!toEmail) {
      throw new Error("Recipient email address is required.");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toEmail)) {
      throw new Error("Invalid recipient email address format.");
    }

    if (!fromEmail || !emailRegex.test(fromEmail)) {
      throw new Error("Invalid or missing 'From Email' address.");
    }

    // Auto-compose body from previous outputs if not specified
    if (!body) {
      for (const [, output] of context.nodeOutputs) {
        const data = output.output as Record<string, unknown>;
        if (data?.type === "agent" && data?.response) {
          body = String(data.response);
          this.log(context, "info", "email", "Using agent response as email body");
          break;
        }
      }
    }

    if (!body) {
      // Build summary from all outputs
      const outputs = this.collectOutputs(context);
      body = `Workflow completed.\n\n`;
      for (const [nodeId, output] of Object.entries(outputs)) {
        const data = output as Record<string, unknown>;
        if (data?.response) {
          body += `${nodeId}: ${String(data.response).slice(0, 500)}\n\n`;
        }
      }
    }

    this.log(context, "info", "email", `Sending email via ${smtpHost} to ${toEmail}...`);

    // Build HTML email
    const htmlBody = `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #FF5800;">Workflow Notification</h2>
        <div style="white-space: pre-wrap; color: #333;">${body}</div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px;">Sent via Eliza Cloud Workflows</p>
      </div>
    `;

    // Create transporter with user's SMTP credentials
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser ?? "apikey",
        pass: smtpPassword,
      },
    });

    await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      subject,
      text: body,
      html: htmlBody,
    });

    this.log(context, "info", "email", "Email sent successfully");

    return {
      type: "email",
      success: true,
      from: fromEmail,
      to: toEmail,
      subject,
      bodyPreview: body.slice(0, 100),
    };
  }

  /**
   * Execute App Query node - queries app data (users, stats, requests, analytics)
   * Returns data that can be used by subsequent nodes (e.g., agent to summarize)
   */
  private async executeAppQueryNode(
    config: Record<string, unknown>,
    context: WorkflowExecutionContext,
  ): Promise<unknown> {
    const appId = config.appId as string | undefined;
    const appName = config.appName as string | undefined;
    const queryType = (config.queryType as string) ?? "stats";
    const limit = (config.limit as number) ?? 50;
    const periodType = (config.periodType as string) ?? "daily";

    if (!appId) {
      throw new Error("No app selected. Configure the App Query node and select one of your apps.");
    }

    this.log(context, "info", "app-query", `Querying ${queryType} for app: ${appName ?? appId}`);

    const { appsRepository } = await import("@/db/repositories");

    let data: unknown;
    let summary: string;

    switch (queryType) {
      case "stats": {
        const stats = await appsRepository.getRequestStats(appId);
        data = stats;
        summary = `App Stats: ${stats.totalRequests} total requests, ${stats.uniqueUsers} unique users, ${stats.totalCredits} credits used, avg ${stats.avgResponseTime ?? 0}ms response time`;
        break;
      }

      case "users": {
        const users = await appsRepository.listAppUsers(appId, limit);
        data = users;
        summary = `Found ${users.length} app users`;
        break;
      }

      case "requests": {
        const { requests, total } = await appsRepository.getRecentRequests(appId, { limit });
        data = { requests, total };
        summary = `Retrieved ${requests.length} of ${total} recent requests`;
        break;
      }

      case "top-visitors": {
        const visitors = await appsRepository.getTopVisitors(appId, limit);
        data = visitors;
        summary = `Top ${visitors.length} visitors by request count`;
        break;
      }

      case "analytics": {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30); // Last 30 days
        const analytics = await appsRepository.getAnalytics(appId, periodType, startDate, endDate);
        data = analytics;
        summary = `${analytics.length} ${periodType} analytics periods for last 30 days`;
        break;
      }

      default:
        throw new Error(`Unknown query type: ${queryType}`);
    }

    this.log(context, "info", "app-query", summary);

    return {
      type: "app-query",
      appId,
      appName,
      queryType,
      summary,
      data,
      response: JSON.stringify(data, null, 2), // For agent nodes to consume
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
