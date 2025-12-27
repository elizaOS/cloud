/**
 * Moderation Test Endpoint
 *
 * Developer-friendly endpoint to test moderation without affecting real data.
 * Only available in development or with admin access.
 *
 * Usage:
 *   POST /api/v1/moderation/test
 *   { "type": "text", "content": "test content" }
 *
 *   POST /api/v1/moderation/test
 *   { "type": "image", "url": "https://example.com/image.jpg" }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { MODERATION_CONFIG } from "@/lib/services/moderation";

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY;
const THRESHOLDS = MODERATION_CONFIG.THRESHOLDS;

const TestTextSchema = z.object({
  type: z.literal("text"),
  content: z.string().min(1).max(32000),
});

const TestImageSchema = z.object({
  type: z.literal("image"),
  url: z.string().url().optional(),
  base64: z.string().optional(),
});

const TestSchema = z.union([TestTextSchema, TestImageSchema]);

interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
  flaggedCategories: string[];
  severity: "clean" | "low" | "medium" | "high" | "critical";
  action: "none" | "warning" | "content_deleted" | "suspended";
}

function analyzeScores(scores: Record<string, number>): ModerationResult {
  const flaggedCategories: string[] = [];
  let maxSeverity = "clean";
  const severityOrder = ["clean", "low", "medium", "high", "critical"];

  for (const [category, config] of Object.entries(THRESHOLDS)) {
    const score = scores[category];
    if (score !== undefined && score >= config.threshold) {
      flaggedCategories.push(category);
      if (
        severityOrder.indexOf(config.severity) >
        severityOrder.indexOf(maxSeverity)
      ) {
        maxSeverity = config.severity;
      }
    }
  }

  let action: "none" | "warning" | "content_deleted" | "suspended" = "none";
  if (maxSeverity === "critical" || maxSeverity === "high") {
    action = "content_deleted";
  } else if (maxSeverity === "medium" || maxSeverity === "low") {
    action = "warning";
  }

  return {
    flagged: flaggedCategories.length > 0,
    categories: Object.fromEntries(flaggedCategories.map((c) => [c, true])),
    categoryScores: scores,
    flaggedCategories,
    severity: maxSeverity as ModerationResult["severity"],
    action,
  };
}

export async function POST(request: NextRequest) {
  // Only allow in development or with special header
  const isDev = process.env.NODE_ENV === "development";
  const hasTestHeader = request.headers.get("X-Moderation-Test") === "true";

  if (!isDev && !hasTestHeader) {
    return NextResponse.json(
      {
        error:
          "Test endpoint only available in development or with X-Moderation-Test header",
      },
      { status: 403 },
    );
  }

  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 },
    );
  }

  const body = await request.json();
  const parsed = TestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request",
        details: parsed.error.issues,
        usage: {
          text: { type: "text", content: "string to moderate" },
          image: { type: "image", url: "https://..." },
          imageBase64: { type: "image", base64: "base64 encoded image data" },
        },
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  let inputPayload: unknown;

  if (input.type === "text") {
    inputPayload = input.content;
  } else {
    if (!input.url && !input.base64) {
      return NextResponse.json(
        { error: "Image requires url or base64" },
        { status: 400 },
      );
    }
    if (input.url) {
      inputPayload = [{ type: "image_url", image_url: { url: input.url } }];
    } else {
      inputPayload = [
        {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${input.base64}` },
        },
      ];
    }
  }

  logger.info("[Moderation Test] Running test", { type: input.type });

  const startTime = Date.now();

  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: inputPayload,
    }),
  });

  const latencyMs = Date.now() - startTime;

  if (!res.ok) {
    const error = await res.text();
    return NextResponse.json(
      { error: "OpenAI API error", status: res.status, details: error },
      { status: 502 },
    );
  }

  const data = await res.json();
  const result = data.results?.[0];

  if (!result) {
    return NextResponse.json(
      { error: "No results from OpenAI" },
      { status: 500 },
    );
  }

  const analysis = analyzeScores(result.category_scores);

  return NextResponse.json({
    success: true,
    inputType: input.type,
    latencyMs,
    model: "omni-moderation-latest",
    raw: {
      flagged: result.flagged,
      categories: result.categories,
      categoryScores: result.category_scores,
    },
    analysis: {
      ...analysis,
      thresholdsUsed: THRESHOLDS,
    },
    documentation: {
      severityLevels: {
        clean: "No issues detected",
        low: "Minor issues (not actionable)",
        medium: "Moderate issues - user gets warning",
        high: "Serious issues - content deleted",
        critical:
          "Critical issues (CSAM, etc) - content deleted, user may be banned",
      },
      categories: {
        "sexual/minors": "CSAM - threshold 0.1 (very strict)",
        "self-harm/instructions": "Self-harm instructions - threshold 0.3",
        "self-harm/intent": "Self-harm intent - threshold 0.4",
        "self-harm": "General self-harm - threshold 0.5",
        "violence/graphic": "Graphic violence - threshold 0.7",
        "illicit/violent": "Illicit violent content - threshold 0.5",
      },
    },
  });
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/v1/moderation/test",
    description: "Test endpoint for content moderation",
    methods: {
      POST: {
        description: "Test content against moderation API",
        examples: [
          {
            description: "Test text content",
            body: { type: "text", content: "Hello world" },
          },
          {
            description: "Test image by URL",
            body: { type: "image", url: "https://example.com/image.jpg" },
          },
          {
            description: "Test image by base64",
            body: { type: "image", base64: "base64_encoded_image_data" },
          },
        ],
        headers: {
          "X-Moderation-Test": "Required in production (set to 'true')",
        },
      },
    },
    thresholds: THRESHOLDS,
    categories: [
      "sexual/minors (CSAM) - CRITICAL",
      "self-harm/instructions - HIGH",
      "self-harm/intent - HIGH",
      "self-harm - MEDIUM",
      "violence/graphic - MEDIUM",
      "illicit/violent - HIGH",
    ],
  });
}
