import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { z } from "zod";

const EDIT_CHAT_MODEL = "anthropic/claude-sonnet-4.5";

const RequestSchema = z.object({
  workflowId: z.string().uuid(),
  currentWorkflow: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    status: z.string(),
    version: z.number(),
    tags: z.array(z.string()),
    workflowData: z.record(z.unknown()),
  }),
  message: z.string().min(1).max(10000),
  history: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ).optional().default([]),
});

const SYSTEM_PROMPT = `You are an expert n8n workflow editor assistant. Your job is to help users modify their n8n workflows through natural language.

When a user requests changes, analyze their request and respond with:
1. A clear explanation of what changes you'll make
2. The actual proposed changes in a structured format

IMPORTANT RULES:
- Only propose changes that are explicitly requested or clearly implied
- Preserve existing nodes/connections unless the user asks to modify them
- Use standard n8n node types (n8n-nodes-base.*)
- Generate unique node IDs for new nodes
- Ensure connections reference valid node IDs
- Keep explanations concise and actionable

For workflow data changes, provide a complete "workflowData" object with nodes and connections.
For metadata changes (name, description, status), provide those fields.

RESPONSE FORMAT:
Always respond with valid JSON in this structure:
{
  "message": "Human-readable explanation of the changes",
  "proposedChanges": {
    "workflowData": { ... },  // Optional: only if nodes/connections change
    "name": "...",            // Optional: only if name changes
    "description": "...",     // Optional: only if description changes
    "status": "..."           // Optional: only if status changes (draft/active/archived)
  }
}

If the user asks a question or you need clarification, respond with just:
{
  "message": "Your response or question"
}

AVAILABLE NODE TYPES (common ones):
- n8n-nodes-base.start (workflow entry point)
- n8n-nodes-base.httpRequest (HTTP API calls)
- n8n-nodes-base.if (conditional branching)
- n8n-nodes-base.switch (multi-way branching)
- n8n-nodes-base.set (set/transform data)
- n8n-nodes-base.code (JavaScript/Python code)
- n8n-nodes-base.webhook (webhook trigger)
- n8n-nodes-base.cron (scheduled trigger)
- n8n-nodes-base.merge (merge data from branches)
- n8n-nodes-base.splitInBatches (batch processing)
- n8n-nodes-base.wait (delay execution)
- n8n-nodes-base.noOp (no operation, for testing)`;

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const validation = RequestSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: validation.error.format() },
      { status: 400 }
    );
  }

  const { workflowId, currentWorkflow, message, history } = validation.data;

  const existingWorkflow = await n8nWorkflowsService.getWorkflow(workflowId);
  if (!existingWorkflow || existingWorkflow.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Workflow not found" },
      { status: 404 }
    );
  }

  const workflowContext = `Current Workflow:
Name: ${currentWorkflow.name}
Description: ${currentWorkflow.description || "No description"}
Status: ${currentWorkflow.status}
Version: ${currentWorkflow.version}
Tags: ${currentWorkflow.tags.join(", ") || "None"}

Current Workflow Data:
${JSON.stringify(currentWorkflow.workflowData, null, 2)}`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: `Here is the workflow I want to edit:\n\n${workflowContext}` },
    { role: "assistant", content: "I've analyzed your workflow. What changes would you like to make?" },
  ];

  for (const msg of history.slice(-10)) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: "user", content: message });

  const response = await generateText({
    model: gateway(EDIT_CHAT_MODEL),
    maxTokens: 4096,
    system: SYSTEM_PROMPT,
    messages,
  });

  const textContent = response.text;
  if (!textContent) {
    return NextResponse.json({ success: false, error: "No response from AI" }, { status: 500 });
  }

  let parsedResponse: { message: string; proposedChanges?: Record<string, unknown> };
  try {
    parsedResponse = JSON.parse(textContent);
  } catch {
    const firstBrace = textContent.indexOf("{");
    if (firstBrace !== -1) {
      let depth = 0, endIndex = -1;
      for (let i = firstBrace; i < textContent.length; i++) {
        if (textContent[i] === "{") depth++;
        if (textContent[i] === "}") depth--;
        if (depth === 0) { endIndex = i; break; }
      }
      if (endIndex !== -1) {
        try {
          parsedResponse = JSON.parse(textContent.slice(firstBrace, endIndex + 1));
        } catch {
          parsedResponse = { message: textContent };
        }
      } else {
        parsedResponse = { message: textContent };
      }
    } else {
      parsedResponse = { message: textContent };
    }
  }

  if (parsedResponse.proposedChanges?.workflowData) {
    const workflowData = parsedResponse.proposedChanges.workflowData as Record<string, unknown>;
    const validationResult = await n8nWorkflowsService.validateWorkflow(workflowData);
    
    if (!validationResult.valid) {
      parsedResponse.message += `\n\n⚠️ Note: The proposed workflow has some validation warnings:\n${validationResult.errors.join("\n")}`;
    }
  }

  return NextResponse.json({
    success: true,
    message: parsedResponse.message,
    proposedChanges: parsedResponse.proposedChanges,
  });
}

