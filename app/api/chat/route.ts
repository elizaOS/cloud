import { streamText, type UIMessage, convertToModelMessages } from "ai";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: "gpt-4o",
    system: `You are a helpful AI assistant powered by ElizaOS. You provide clear, accurate, and helpful responses. 
    You are knowledgeable about AI agents, development, and technology.`,
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
