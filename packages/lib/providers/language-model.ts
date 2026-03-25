import { gateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import { getGroqApiModelId, isGroqNativeModel } from "@/lib/models";

let groqClient: ReturnType<typeof createOpenAI> | null = null;

function getGroqClient() {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY environment variable is required");
    }

    groqClient = createOpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }

  return groqClient;
}

export function getLanguageModel(model: string) {
  if (isGroqNativeModel(model)) {
    return getGroqClient().languageModel(getGroqApiModelId(model));
  }

  return gateway.languageModel(model);
}
