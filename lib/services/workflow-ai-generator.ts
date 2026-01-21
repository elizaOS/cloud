/**
 * AI Workflow Generator Service
 * 
 * Uses LLM to generate workflow nodes from natural language descriptions.
 */

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { WorkflowNodeType } from "@/db/schemas";

// ============================================================================
// Types
// ============================================================================

export interface GeneratedNode {
  type: WorkflowNodeType;
  data: Record<string, unknown>;
}

export interface GeneratedWorkflow {
  nodes: GeneratedNode[];
  description: string;
  missingCredentials: string[];
}

export interface ReactFlowWorkflow {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

// ============================================================================
// System Prompt
// ============================================================================

const WORKFLOW_SYSTEM_PROMPT = `You are a workflow builder assistant. When the user describes an automation, you generate a structured workflow.

## Available Node Types

### 1. TRIGGER (always required as first node)
Determines when the workflow runs.
- triggerType: "manual" | "schedule" | "webhook"
- schedule: Cron expression (only for schedule type)
  - "0 9 * * *" = Every day at 9:00 AM
  - "0 */6 * * *" = Every 6 hours
  - "0 0 * * 1" = Every Monday at midnight
  - "*/30 * * * *" = Every 30 minutes

### 2. AGENT
Uses an AI agent to generate text responses.
- agentId: Leave empty (user will select their agent)
- prompt: The prompt/instruction for the agent
The agent can reference previous node outputs using natural language context.

### 3. MCP (External Data APIs)
Fetches real-time data from external services.
- mcpServer: "crypto" | "time" | "weather"
- toolName: The specific tool to call
- toolArgs: Arguments for the tool

Available tools:
- crypto/get_price: Get cryptocurrency price. Args: { coin: "bitcoin" | "ethereum" | "solana" | etc }
- crypto/get_market_data: Get detailed market data. Args: { coin: string }
- crypto/list_trending: Get trending cryptocurrencies. Args: {}
- time/get_current_time: Get current time. Args: { timezone: "UTC" | "America/New_York" | etc }
- weather/get_current_weather: Get weather. Args: { city: string, units: "fahrenheit" | "celsius" }
- weather/get_weather_forecast: Get forecast. Args: { city: string, days: number }

### 4. IMAGE
Generates images using AI.
- prompt: Description of the image to generate
- model: "fal-ai/flux/schnell" (fast) or "fal-ai/flux/dev" (quality)
- width: Image width (default 1024)
- height: Image height (default 1024)

### 5. OUTPUT
Saves results and images to gallery.
- saveToGallery: true | false (saves any generated images)
- outputType: "display" | "save" | "webhook"

### 6. TELEGRAM
Sends messages to Telegram.
- botToken: "{{ASK_USER}}" - User needs to provide
- chatId: "{{ASK_USER}}" - User needs to provide  
- message: The message text (can reference previous outputs)

### 7. DISCORD
Sends messages to Discord via webhook.
- webhookUrl: "{{ASK_USER}}" - User needs to provide
- message: The message text

### 8. TWITTER
Posts to Twitter/X.
- action: "post" | "reply" | "like" | "retweet"
- tweetText: The tweet content (max 280 chars)
Note: Requires Twitter API credentials

### 9. EMAIL
Sends emails via SMTP.
- toEmail: Recipient email address
- subject: Email subject
- body: Email body text
Note: Requires SMTP configuration

### 10. TTS (Text-to-Speech)
Converts text to audio.
- text: Text to convert (or use previous agent output)
- voiceId: ElevenLabs voice ID (default: Rachel)

### 11. HTTP
Makes HTTP requests to external APIs.
- url: The URL to call
- method: "GET" | "POST" | "PUT" | "DELETE"
- headers: Optional headers object
- body: Optional request body

### 12. CONDITION
Branches based on content analysis.
- operator: "contains" | "equals" | "startsWith" | "endsWith" | "regex"
- value: The value to check for
Checks the previous node's output.

### 13. DELAY
Pauses execution.
- delaySeconds: Number of seconds to wait

### 14. APP-QUERY
Queries data from user's apps.
- appId: Leave empty (user will select)
- queryType: "stats" | "users" | "requests" | "analytics"

## Rules
1. Always start with a trigger node
2. Order nodes logically - data flows from top to bottom
3. Agent nodes automatically receive context from previous nodes
4. Mark credentials the user needs to provide as "{{ASK_USER}}"
5. Keep prompts clear and specific
6. For scheduled workflows, use appropriate cron expressions
7. If the user mentions posting to social media without specifying, prefer Telegram (easiest setup)

## Examples

User: "Every morning, get the bitcoin price and post it to telegram"
Result:
- trigger: schedule "0 9 * * *"
- mcp: crypto/get_price with coin "bitcoin"
- agent: "Summarize this Bitcoin price update in a friendly way"
- telegram: message references agent output

User: "Generate an image of a sunset and save it"
Result:
- trigger: manual
- image: prompt "A beautiful sunset over the ocean, vibrant colors"
- output: saveToGallery true`;

// ============================================================================
// Schema
// ============================================================================

const nodeDataSchema = z.object({
  // Trigger
  triggerType: z.enum(["manual", "schedule", "webhook"]).nullable(),
  schedule: z.string().nullable(),
  
  // Agent
  agentId: z.string().nullable(),
  prompt: z.string().nullable(),
  
  // MCP
  mcpServer: z.enum(["crypto", "time", "weather"]).nullable(),
  toolName: z.string().nullable(),
  // Common MCP tool arguments
  coin: z.string().nullable().describe("Cryptocurrency name for crypto tools (bitcoin, ethereum, etc)"),
  city: z.string().nullable().describe("City name for weather tools"),
  timezone: z.string().nullable().describe("Timezone for time tools (UTC, America/New_York, etc)"),
  units: z.enum(["fahrenheit", "celsius"]).nullable().describe("Temperature units for weather"),
  days: z.number().nullable().describe("Number of days for weather forecast"),
  
  // Image
  model: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  
  // Output
  saveToGallery: z.boolean().nullable(),
  outputType: z.enum(["display", "save", "webhook"]).nullable(),
  
  // Telegram
  botToken: z.string().nullable(),
  chatId: z.string().nullable(),
  message: z.string().nullable(),
  
  // Discord
  webhookUrl: z.string().nullable(),
  
  // Twitter
  action: z.enum(["post", "reply", "like", "retweet"]).nullable(),
  tweetText: z.string().nullable(),
  
  // Email
  toEmail: z.string().nullable(),
  subject: z.string().nullable(),
  body: z.string().nullable(),
  
  // TTS
  text: z.string().nullable(),
  voiceId: z.string().nullable(),
  
  // HTTP
  url: z.string().nullable(),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).nullable(),
  contentType: z.string().nullable().describe("Content-Type header value"),
  authorization: z.string().nullable().describe("Authorization header value"),
  httpBody: z.string().nullable().describe("Request body as string"),
  
  // Condition
  operator: z.enum(["contains", "equals", "startsWith", "endsWith", "regex"]).nullable(),
  value: z.string().nullable(),
  
  // Delay
  delaySeconds: z.number().nullable(),
  
  // App Query
  appId: z.string().nullable(),
  queryType: z.enum(["stats", "users", "requests", "analytics"]).nullable(),
});

const generatedWorkflowSchema = z.object({
  nodes: z.array(z.object({
    type: z.enum([
      "trigger", "agent", "image", "output", "delay", "http", 
      "condition", "tts", "discord", "mcp", "twitter", "telegram", 
      "email", "app-query"
    ]),
    data: nodeDataSchema,
  })),
  description: z.string().describe("A brief description of what this workflow does"),
  missingCredentials: z.array(z.string()).describe("List of credentials the user needs to provide, e.g. ['telegram.botToken', 'telegram.chatId']"),
});

// ============================================================================
// Service
// ============================================================================

class WorkflowAIGeneratorService {
  /**
   * Generate a workflow from a natural language description
   * @param userPrompt The user's request
   * @param currentWorkflow Optional - the current workflow to modify (for edit requests)
   */
  async generate(userPrompt: string, currentWorkflow?: GeneratedWorkflow): Promise<GeneratedWorkflow> {
    let prompt = userPrompt;
    
    // If there's a current workflow, include it as context for modifications
    if (currentWorkflow && currentWorkflow.nodes.length > 0) {
      const workflowSummary = currentWorkflow.nodes.map((node, i) => {
        const data = node.data;
        let details = "";
        
        if (node.type === "trigger") {
          details = `triggerType: ${data.triggerType ?? "manual"}${data.schedule ? `, schedule: "${data.schedule}"` : ""}`;
        } else if (node.type === "mcp") {
          details = `${data.mcpServer}/${data.toolName}${data.coin ? `, coin: ${data.coin}` : ""}`;
        } else if (node.type === "agent") {
          details = `prompt: "${data.prompt ?? ""}"`;
        } else if (node.type === "telegram") {
          details = `message: "${data.message ?? ""}"`;
        } else if (node.type === "image") {
          details = `prompt: "${data.prompt ?? ""}"`;
        }
        
        return `${i + 1}. ${node.type.toUpperCase()}${details ? ` (${details})` : ""}`;
      }).join("\n");
      
      prompt = `CURRENT WORKFLOW (modify this, don't start from scratch):
${workflowSummary}

USER REQUEST: ${userPrompt}

Important: Keep all existing nodes and only modify what the user specifically asked to change. Return the COMPLETE modified workflow with all nodes.`;
    }
    
    const result = await generateObject({
      model: openai("gpt-4o"),
      system: WORKFLOW_SYSTEM_PROMPT,
      prompt,
      schema: generatedWorkflowSchema,
    });

    return result.object as GeneratedWorkflow;
  }

  /**
   * Convert generated workflow to ReactFlow format with positions
   */
  convertToReactFlow(workflow: GeneratedWorkflow): ReactFlowWorkflow {
    const NODE_SPACING_Y = 150;
    const CENTER_X = 400;
    const START_Y = 100;

    const nodes = workflow.nodes.map((node, index) => {
      const id = `${node.type}-${Date.now()}-${index}`;
      return {
        id,
        type: node.type,
        position: { 
          x: CENTER_X, 
          y: START_Y + (index * NODE_SPACING_Y) 
        },
        data: {
          ...node.data,
          label: this.getNodeLabel(node.type),
        },
      };
    });

    const edges = nodes.slice(1).map((node, index) => ({
      id: `edge-${Date.now()}-${index}`,
      source: nodes[index].id,
      target: node.id,
    }));

    return { nodes, edges };
  }

  /**
   * Get display label for a node type
   */
  private getNodeLabel(type: WorkflowNodeType): string {
    const labels: Record<WorkflowNodeType, string> = {
      trigger: "Trigger",
      agent: "AI Agent",
      image: "Generate Image",
      output: "Output",
      delay: "Delay",
      http: "HTTP Request",
      condition: "Condition",
      tts: "Text to Speech",
      discord: "Discord",
      mcp: "External Data",
      twitter: "Twitter",
      telegram: "Telegram",
      email: "Email",
      "app-query": "App Query",
    };
    return labels[type] ?? type;
  }
}

export const workflowAIGeneratorService = new WorkflowAIGeneratorService();
