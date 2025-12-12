/**
 * Agent ERC-8004 Registration File
 *
 * Returns the ERC-8004 registration file for an individual agent.
 * This is used when registering agents via HTTP (instead of IPFS).
 *
 * GET /api/agents/{id}/registration.json
 *
 * The registration file contains:
 * - Agent name and description
 * - A2A and MCP endpoints
 * - Monetization settings
 * - OASF skills and domains
 */

import { NextRequest, NextResponse } from "next/server";
import { charactersService } from "@/lib/services/characters/characters";
import { X402_ENABLED } from "@/lib/config/x402";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const character = await charactersService.getById(id);
  if (!character) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Only public agents can have registration files
  if (!character.is_public) {
    return NextResponse.json({ error: "Agent is not public" }, { status: 403 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  const bioText = Array.isArray(character.bio)
    ? character.bio.join("\n")
    : character.bio;

  // Build OASF skills based on character
  const skills: string[] = [];
  if (character.topics?.includes("coding")) {
    skills.push("software_engineering/code_generation");
  }
  if (character.topics?.includes("writing")) {
    skills.push("natural_language_processing/text_generation");
  }
  if (character.topics?.includes("analysis")) {
    skills.push("advanced_reasoning_planning/logical_reasoning");
  }
  if (skills.length === 0) {
    skills.push("natural_language_processing/text_generation");
  }

  // Build domains based on category
  const domains: string[] = [];
  const categoryToDomain: Record<string, string> = {
    assistant: "technology/artificial_intelligence",
    creative: "arts_entertainment/creative_industries",
    business: "finance_and_business/business_consulting",
    education: "education_learning/online_learning",
    gaming: "arts_entertainment/gaming",
  };
  if (character.category && categoryToDomain[character.category]) {
    domains.push(categoryToDomain[character.category]);
  } else {
    domains.push("technology/artificial_intelligence");
  }

  const registrationFile = {
    name: character.name,
    description: bioText,
    image: character.avatar_url || `${baseUrl}/default-avatar.png`,
    version: "1.0.0",
    active: true,

    // ERC-8004 endpoints
    endpoints: {
      a2a: `${baseUrl}/api/agents/${id}/a2a`,
      mcp: `${baseUrl}/api/agents/${id}/mcp`,
    },

    // Trust configuration
    trust: {
      reputation: true,
      cryptoEconomic: X402_ENABLED,
      humanity: false,
    },

    // OASF taxonomy
    skills: skills.map((skill) => ({ skill, required: false })),
    domains: domains.map((domain) => ({ domain, required: false })),

    // Metadata
    metadata: {
      platform: "eliza-cloud",
      characterId: id,
      creatorOrganizationId: character.organization_id,
      category: character.category || "assistant",
      tags: character.tags || [],
      monetizationEnabled: character.monetization_enabled,
      inferenceMarkupPercentage: Number(
        character.inference_markup_percentage || 0,
      ),
      protocols: {
        a2a: character.a2a_enabled,
        mcp: character.mcp_enabled,
      },
    },

    // Payment information (if monetization enabled)
    ...(character.monetization_enabled && {
      pricing: {
        type: "token-based",
        currency: "USD",
        markupPercentage: Number(character.inference_markup_percentage || 0),
        description: `Base inference cost + ${character.inference_markup_percentage || 0}% creator markup`,
        paymentMethods: X402_ENABLED
          ? ["api_key_credits", "x402"]
          : ["api_key_credits"],
      },
    }),
  };

  return NextResponse.json(registrationFile, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
