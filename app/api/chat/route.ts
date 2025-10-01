import { streamText, type UIMessage, convertToModelMessages } from "ai";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json();
  const { messages, id }: { messages: UIMessage[]; id?: string } = body;
  
  // Use id as model name, or default to gpt-4o
  const selectedModel = id || "gpt-4o";

  const result = streamText({
    model: selectedModel,
    system: `You are a helpful AI assistant powered by ElizaOS. You provide clear, accurate, and helpful responses. 
    You are knowledgeable about AI agents, development, and technology.`,
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
