/**
 * Eliza Cloud SDK Reference
 *
 * Compact, comprehensive API reference for AI App Builder.
 * Documents the ACTUAL SDK files written to @/lib/eliza and @/hooks/use-eliza on sandbox creation.
 */

/**
 * COMPACT SDK reference for system prompts (~2KB)
 * Full SDK is written to lib/eliza.ts on sandbox creation
 */
export const ELIZA_SDK_COMPACT = `
## Eliza Cloud SDK

**IMPORTANT:** The API is already configured. Use the pre-built SDK at \`@/lib/eliza\`.

### Usage - Just import and use:
\`\`\`typescript
import { chat, chatStream, generateImage, getBalance, listAgents, chatWithAgent } from '@/lib/eliza';

// Chat (non-streaming)
const response = await chat([{ role: 'user', content: 'Hello' }]);

// Streaming chat
for await (const chunk of chatStream([{ role: 'user', content: 'Hello' }])) {
  const content = chunk.choices?.[0]?.delta?.content;
  if (content) console.log(content);
}

// Generate image
const { url } = await generateImage('A sunset over mountains');

// Check balance
const { balance } = await getBalance();
\`\`\`

### Available Functions in @/lib/eliza:
- \`chat(messages, model?)\` - AI chat completion
- \`chatStream(messages, model?)\` - Streaming chat (async generator)
- \`generateImage(prompt, options?)\` - Generate images
- \`uploadFile(file, filename)\` - Upload to storage
- \`getBalance()\` - Check credits
- \`listAgents()\` - List AI agents
- \`chatWithAgent(agentId, message, roomId?)\` - Chat with agent

### React Hooks in @/hooks/use-eliza:
\`\`\`typescript
import { useChat, useChatStream } from '@/hooks/use-eliza';

function ChatComponent() {
  const { send, loading, error } = useChat();

  const handleSend = async () => {
    const response = await send([{ role: 'user', content: 'Hello' }]);
  };
}

function StreamingChat() {
  const { stream, loading } = useChatStream();

  const handleStream = async () => {
    for await (const chunk of stream([{ role: 'user', content: 'Hello' }])) {
      // Process streaming chunks
    }
  };
}
\`\`\`

**DO NOT create API key input fields. The API is pre-configured via NEXT_PUBLIC_ELIZA_API_KEY.**
`;

/**
 * Complete Eliza Cloud SDK documentation for Claude
 * This documents the ACTUAL SDK files written to lib/eliza.ts and hooks/use-eliza.ts on sandbox creation
 */
export const ELIZA_SDK_REFERENCE = `
## Eliza Cloud SDK - Quick Reference

### IMPORTANT - READ FIRST:
- **@/lib/eliza** and **@/hooks/use-eliza** are **PRE-BUILT** and ready to use
- **DO NOT recreate, overwrite, or modify these files** - they are already configured
- **DO NOT create API key input fields, prompts, or configuration screens**
- **DO NOT ask users to enter or provide an API key** - it's already set via environment variables
- The API key is injected automatically via \`NEXT_PUBLIC_ELIZA_API_KEY\` environment variable
- Just import and use the functions directly

All APIs use: \`X-Api-Key\` header (automatically included by the SDK).
Base URL: Use relative paths (e.g., \`/api/v1/...\`) for client-side code.

---

### PRE-BUILT: @/lib/eliza (API Functions) - DO NOT RECREATE

The SDK exports simple functions that handle authentication automatically:

\`\`\`typescript
import { chat, chatStream, generateImage, uploadFile, getBalance, listAgents, chatWithAgent } from '@/lib/eliza';

// ========== AI CHAT ==========
// Non-streaming chat
const response = await chat(
  [{ role: 'user', content: 'Hello!' }],
  'gpt-4o' // optional model
);

// Streaming chat (async generator)
for await (const chunk of chatStream([{ role: 'user', content: 'Hello!' }])) {
  const content = chunk.choices?.[0]?.delta?.content;
  if (content) {
    // Append content to UI
  }
}

// ========== IMAGE GENERATION ==========
const { url, id } = await generateImage('A sunset over mountains', {
  model: 'dall-e-3',  // optional
  width: 1024,        // optional
  height: 1024        // optional
});

// ========== STORAGE ==========
const { id, url } = await uploadFile(file, 'filename.png');

// ========== CREDITS ==========
const { balance } = await getBalance();

// ========== AGENTS ==========
const { agents } = await listAgents();
// agents: [{ id, name, bio }, ...]

const { response, roomId } = await chatWithAgent(
  agentId,
  'Hello agent!',
  existingRoomId // optional, for conversation continuity
);
\`\`\`

### Function Signatures:
\`\`\`typescript
type ChatMessage = { role: string; content: string };

// AI Chat
async function chat(messages: ChatMessage[], model?: string): Promise<any>;
async function* chatStream(messages: ChatMessage[], model?: string): AsyncGenerator<any>;

// Image Generation
async function generateImage(prompt: string, options?: {
  model?: string;
  width?: number;
  height?: number;
}): Promise<{ url: string; id: string }>;

// Storage
async function uploadFile(file: File | Blob, filename: string): Promise<{ id: string; url: string }>;

// Credits
async function getBalance(): Promise<{ balance: number }>;

// Agents
async function listAgents(): Promise<{ agents: Array<{ id: string; name: string; bio: string }> }>;
async function chatWithAgent(agentId: string, message: string, roomId?: string): Promise<{ response: string; roomId: string }>;
\`\`\`

---

### PRE-BUILT: @/hooks/use-eliza (React Hooks) - DO NOT RECREATE

\`\`\`typescript
import { useChat, useChatStream } from '@/hooks/use-eliza';

// ========== useChat - For non-streaming responses ==========
function ChatComponent() {
  const { send, loading, error } = useChat();
  const [response, setResponse] = useState('');

  const handleSend = async () => {
    const result = await send([{ role: 'user', content: 'Hello!' }]);
    if (result) {
      setResponse(result.choices[0].message.content);
    }
  };

  return (
    <div>
      <button onClick={handleSend} disabled={loading}>
        {loading ? 'Sending...' : 'Send'}
      </button>
      {error && <p className="text-red-500">{error}</p>}
      {response && <p>{response}</p>}
    </div>
  );
}

// ========== useChatStream - For streaming responses ==========
function StreamingChat() {
  const { stream, loading } = useChatStream();
  const [content, setContent] = useState('');

  const handleStream = async () => {
    setContent('');
    for await (const chunk of stream([{ role: 'user', content: 'Hello!' }])) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        setContent(prev => prev + delta);
      }
    }
  };

  return (
    <div>
      <button onClick={handleStream} disabled={loading}>
        {loading ? 'Streaming...' : 'Start Stream'}
      </button>
      <p>{content}</p>
    </div>
  );
}
\`\`\`

### Hook Signatures:
\`\`\`typescript
type ChatMessage = { role: string; content: string };

// useChat - returns send function for non-streaming chat
function useChat(): {
  send: (messages: ChatMessage[]) => Promise<any | null>;
  loading: boolean;
  error: string | null;
};

// useChatStream - returns stream generator for streaming chat
function useChatStream(): {
  stream: (messages: ChatMessage[]) => AsyncGenerator<any>;
  loading: boolean;
};
\`\`\`

---

### Environment Variables (ALREADY CONFIGURED)

\`\`\`typescript
// API key is ALREADY SET - do not ask users for it!
// The SDK reads from: process.env.NEXT_PUBLIC_ELIZA_API_KEY
// You do NOT need to handle API key configuration - it's done automatically.
\`\`\`

### NEVER DO THESE:
- Create API key input fields or forms
- Ask users to "enter your API key"
- Create settings/config pages for API keys
- Recreate @/lib/eliza or @/hooks/use-eliza
- Import API keys from user input
- Create ElizaClient classes (the SDK uses simple functions)

---

## Common Patterns

### Complete Chat App Example:
\`\`\`tsx
'use client';
import { useState } from 'react';
import { useChatStream } from '@/hooks/use-eliza';

type Message = { role: 'user' | 'assistant'; content: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const { stream, loading } = useChatStream();

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    const assistantMessage: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMessage]);

    for await (const chunk of stream([...messages, userMessage])) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + delta
          };
          return updated;
        });
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div className={\`inline-block p-3 rounded-lg \${
              m.role === 'user' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-white'
            }\`}>
              {m.content}
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-gray-800">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
\`\`\`

### Image Generation Example:
\`\`\`tsx
import { generateImage } from '@/lib/eliza';

async function handleGenerateImage(prompt: string) {
  const { url } = await generateImage(prompt);
  return url;
}
\`\`\`

### Agent Chat Example:
\`\`\`tsx
import { listAgents, chatWithAgent } from '@/lib/eliza';

const { agents } = await listAgents();
const agent = agents[0];

let roomId: string | undefined;
const { response, roomId: newRoomId } = await chatWithAgent(agent.id, 'Hello!', roomId);
roomId = newRoomId;  // Save for conversation continuity
\`\`\`

### File Upload Example:
\`\`\`tsx
import { uploadFile } from '@/lib/eliza';

async function handleFileUpload(file: File) {
  const { url, id } = await uploadFile(file, file.name);
  return url;
}
\`\`\`

### Credits Check Example:
\`\`\`tsx
import { getBalance } from '@/lib/eliza';

const { balance } = await getBalance();
if (balance < 5) {
  alert('Low credits!');
}
\`\`\`
`;

/**
 * Compact system prompt addon for the App Builder
 */
export const ELIZA_INTEGRATION_PROMPT = `
## Eliza Cloud Integration

Your apps have FULL ACCESS to the Eliza Cloud platform.

### CRITICAL - MUST READ:
1. **@/lib/eliza** and **@/hooks/use-eliza** are **ALREADY CREATED** - DO NOT recreate them
2. **API key is PRE-CONFIGURED** via NEXT_PUBLIC_ELIZA_API_KEY - DO NOT ask users for it
3. **NEVER create API key input fields, forms, or configuration screens**
4. **NEVER tell users to "set your API key"** - it's already done

### Forbidden Actions:
- Creating or modifying \`@/lib/eliza\` (already exists)
- Creating or modifying \`@/hooks/use-eliza\` (already exists)
- Adding API key input fields
- Creating settings pages for API configuration
- Prompting users to enter credentials
- Creating ElizaClient classes (SDK uses simple functions)

### Quick Start - Functions:
\`\`\`typescript
import { chat, chatStream, generateImage, uploadFile, getBalance, listAgents, chatWithAgent } from '@/lib/eliza';

// Non-streaming chat
const response = await chat([{ role: 'user', content: 'Hello' }]);

// Streaming chat
for await (const chunk of chatStream([{ role: 'user', content: 'Hello' }])) {
  const content = chunk.choices?.[0]?.delta?.content;
  if (content) { /* append to UI */ }
}

// Generate image
const { url } = await generateImage('A beautiful sunset');
\`\`\`

### Quick Start - React Hooks:
\`\`\`typescript
import { useChat, useChatStream } from '@/hooks/use-eliza';

// useChat - for non-streaming
const { send, loading, error } = useChat();
const response = await send([{ role: 'user', content: 'Hello' }]);

// useChatStream - for streaming
const { stream, loading } = useChatStream();
for await (const chunk of stream([{ role: 'user', content: 'Hello' }])) {
  // Process streaming chunks
}
\`\`\`

### Available Functions (@/lib/eliza):
- \`chat(messages, model?)\` - AI chat completion
- \`chatStream(messages, model?)\` - Streaming responses (async generator)
- \`generateImage(prompt, options?)\` - Generate images
- \`uploadFile(file, filename)\` - Storage upload
- \`getBalance()\` - Check credits ({ balance })
- \`listAgents()\` - List AI agents ({ agents })
- \`chatWithAgent(agentId, message, roomId?)\` - Agent chat ({ response, roomId })

### Available Hooks (@/hooks/use-eliza):
- \`useChat()\` - Returns { send, loading, error }
- \`useChatStream()\` - Returns { stream, loading }

**NEVER create API key input fields or configuration screens. Everything is pre-configured.**
`;
