import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { requireAuth } from '@/lib/auth';
import { addMessageToConversation, getNextSequenceNumber } from '@/lib/queries/conversations';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { messages, id }: { messages: UIMessage[]; id?: string } = body;

    const selectedModel = id || "gpt-4o";
    const lastMessage = messages[messages.length - 1];
    const conversationId = lastMessage?.metadata ? (lastMessage.metadata as { conversationId?: string }).conversationId : undefined;

    const result = streamText({
      model: selectedModel,
      system: `You are a helpful AI assistant powered by ElizaOS. You provide clear, accurate, and helpful responses.
      You are knowledgeable about AI agents, development, and technology.`,
      messages: convertToModelMessages(messages),
      onFinish: async ({ text, usage }) => {
        if (!conversationId) return;

        try {
          const userMessage = messages[messages.length - 1];
          const userSequence = await getNextSequenceNumber(conversationId);

          await addMessageToConversation({
            conversation_id: conversationId,
            role: 'user',
            content: userMessage.parts.map(p => p.type === 'text' ? p.text : '').join(''),
            sequence_number: userSequence,
            model: selectedModel,
            tokens: usage?.inputTokens || 0,
            cost: 0,
          });

          const assistantSequence = await getNextSequenceNumber(conversationId);

          await addMessageToConversation({
            conversation_id: conversationId,
            role: 'assistant',
            content: text,
            sequence_number: assistantSequence,
            model: selectedModel,
            tokens: usage?.outputTokens || 0,
            cost: 0,
          });
        } catch (error) {
          console.error('[CHAT API] Error persisting messages:', error);
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('[CHAT API] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process chat' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
