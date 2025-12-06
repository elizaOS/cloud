/**
 * AI-powered room title generation
 * Generates a concise 1-liner title from the first user message
 */

import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { logger } from "@/lib/utils/logger";

export async function generateRoomTitle(
  firstUserMessage: string,
): Promise<string> {
  // Generate a short, concise title using AI gateway
  const { text } = await generateText({
    model: gateway.languageModel("gpt-4o-mini"),
    system: `You are a title generator. Extract the CORE TOPIC and create a 4-6 word Title Case summary. DO NOT use words like "help", "need", "want", "how to". Just state the topic directly.`,
    prompt: `Message: "${firstUserMessage}"

Extract the core topic and create a proper title:

BAD (don't do): "Help Planning Trip to Hawaii", "Need Advice on Coworkers"
GOOD (do this): "Planning Hawaii Vacation", "Workplace Relationship Advice"

More examples:
"Can you help me write a Python script?" → Python Script Development
"I need advice on dealing with coworkers" → Workplace Relationship Advice  
"i need help planning a trip to hawaii" → Planning Hawaii Vacation
"What's the best way to learn ML?" → Machine Learning Introduction
"help me debug my react app" → React App Debugging
"I want to learn about investing" → Investment Basics Guide

Your title (4-6 words, Title Case, topic only):`,
    temperature: 0.2,
    maxOutputTokens: 20,
  });

  // Clean up the response and remove common filler words
  let title = text.trim().replace(/^["']|["']$/g, "");

  // Ensure Title Case
  title = title
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  logger.debug("[Room Title] Generated title:", {
    originalMessage: firstUserMessage.substring(0, 100),
    generatedTitle: title,
  });

  return title;
}
