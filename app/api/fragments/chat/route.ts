/**
 * Fragments Chat API
 * Generates code fragments using Eliza Cloud APIs
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { fragmentSchema } from "@/lib/fragments/schema";
import { buildFragmentPrompt } from "@/lib/fragments/prompt";
import templates, { type Templates } from "@/lib/fragments/templates";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { streamObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { CoreMessage } from "ai";

export const maxDuration = 300;

interface ChatRequest {
  messages: CoreMessage[];
  template: Templates | string;
  model?: string;
  config?: {
    temperature?: number;
    maxTokens?: number;
  };
}

function getModel(modelName: string, req: NextRequest, apiKey: string | null) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  
  const customFetch = async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const authHeader = req.headers.get("authorization");
    const cookieHeader = req.headers.get("cookie");
    const headers = new Headers(init?.headers);
    
    if (authHeader) {
      headers.set("Authorization", authHeader);
    }
    
    if (cookieHeader) {
      headers.set("Cookie", cookieHeader);
    }
    
    if (apiKey) {
      headers.set("Authorization", `Bearer ${apiKey}`);
    }
    
    return fetch(url, {
      ...init,
      headers,
    });
  };
  
  const openai = createOpenAI({
    apiKey: apiKey || "session-auth",
    baseURL: `${baseUrl}/api/v1`,
    fetch: customFetch,
  });
  
  return openai(modelName);
}

/**
 * POST /api/fragments/chat
 * Generate code fragment using Eliza Cloud APIs
 */
async function handlePOST(req: NextRequest) {
  try {
    const { user, apiKey } = await requireAuthOrApiKeyWithOrg(req);
    const body: ChatRequest = await req.json();

    const {
      messages,
      template: templateInput,
      model = "gpt-4o",
      config = {},
    } = body;

    const templateMap =
      typeof templateInput === "string" && templateInput === "auto"
        ? templates
        : typeof templateInput === "string"
          ? { [templateInput]: templates[templateInput as keyof Templates] }
          : templateInput;

    if (!templateMap || Object.keys(templateMap).length === 0) {
      return NextResponse.json(
        { error: "Invalid template" },
        { status: 400 }
      );
    }

    const systemPrompt = await buildFragmentPrompt(templateMap, true);

    logger.info("[Fragments Chat] Generating fragment", {
      userId: user.id,
      organizationId: user.organization_id,
      model,
      messageCount: messages.length,
    });

    const languageModel = getModel(model, req, apiKey?.key || null);

    const result = await streamObject({
      model: languageModel,
      schema: fragmentSchema,
      system: systemPrompt,
      messages,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4000,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    logger.error("[Fragments Chat] Error", error);
    return NextResponse.json(
      {
        error:
        error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STRICT);

