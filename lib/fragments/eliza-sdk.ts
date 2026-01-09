/**
 * Eliza Cloud SDK Reference
 *
 * Documents the SDK files in cloud-apps-template.
 * Used by knowledge-context.ts for AI App Builder prompts.
 */

/**
 * COMPACT SDK reference (~1.5KB)
 */
export const ELIZA_SDK_COMPACT = `
## Eliza SDK (PRE-BUILT in @/lib/eliza and @/hooks/use-eliza)

### Functions:
- \`chat(messages, model?)\` - AI chat
- \`chatStream(messages, model?)\` - Streaming chat
- \`generateImage(prompt, options?)\` - Image generation
- \`generateVideo(prompt, options?)\` - Video generation
- \`listAgents()\` - List agents
- \`chatWithAgent(agentId, message, roomId?)\` - Agent chat
- \`uploadFile(file, filename)\` - File upload
- \`getBalance()\` - Get credits

### Hooks:
- \`useChat()\` - { send, loading, error }
- \`useChatStream()\` - { stream, loading }
- \`useImageGeneration()\` - { generate, loading, imageUrl }
- \`useAgents()\` - { agents, chatWith }
- \`useCredits(interval?)\` - { balance, refresh }
- \`useFileUpload()\` - { upload, uploadedUrl }

### Components (@/components/eliza):
- \`ElizaProvider\` - Wrap app (in layout.tsx)
- \`useElizaCredits()\` - { balance, hasLowBalance }
- \`CreditDisplay\` - Show balance
- \`LowBalanceWarning\` - Warning banner

### Analytics (@vercel/analytics/react):
- \`<Analytics />\` - ALWAYS add inside body in layout.tsx for dashboard metrics

**DO NOT recreate these files. DO NOT create API key inputs.**
`;

/**
 * Full SDK reference with examples (~4KB)
 */
export const ELIZA_SDK_REFERENCE = `
## Eliza Cloud SDK Reference

The SDK is pre-configured in the template. Just import and use.

### API Functions - \`@/lib/eliza\`

\`\`\`typescript
import { 
  chat, 
  chatStream, 
  generateImage, 
  generateVideo,
  listAgents, 
  chatWithAgent, 
  uploadFile, 
  getBalance 
} from '@/lib/eliza';

// Chat (non-streaming)
const response = await chat([
  { role: 'user', content: 'Hello!' }
], 'gpt-4o');
console.log(response.choices[0].message.content);

// Streaming chat
for await (const chunk of chatStream([{ role: 'user', content: 'Hello!' }])) {
  const content = chunk.choices?.[0]?.delta?.content;
  if (content) process.stdout.write(content);
}

// Generate image
const { url } = await generateImage('A sunset', { width: 1024 });

// Generate video
const { url } = await generateVideo('Clouds moving');

// List agents
const { agents } = await listAgents();

// Chat with agent
const { response, roomId } = await chatWithAgent('agent-id', 'Hello!');

// Upload file
const { url } = await uploadFile(file, 'document.pdf');

// Check balance
const { balance } = await getBalance();
\`\`\`

### React Hooks - \`@/hooks/use-eliza\`

\`\`\`typescript
import {
  useChat,
  useChatStream,
  useImageGeneration,
  useAgents,
  useCredits,
  useFileUpload
} from '@/hooks/use-eliza';

// useChat - non-streaming
const { send, loading, error } = useChat();
const response = await send([{ role: 'user', content: 'Hello' }]);

// useChatStream - streaming
const { stream, loading } = useChatStream();
for await (const chunk of stream([{ role: 'user', content: 'Hello' }])) {
  // Handle chunk
}

// useImageGeneration
const { generate, imageUrl, loading } = useImageGeneration();
await generate('A landscape');

// useAgents - auto-fetches on mount
const { agents, chatWith, loading } = useAgents();
const result = await chatWith(agents[0].id, 'Hello!');

// useCredits - with optional auto-refresh
const { balance, refresh, loading } = useCredits(30000);

// useFileUpload
const { upload, uploadedUrl, loading } = useFileUpload();
await upload(file);
\`\`\`

### Context Components - \`@/components/eliza\`

\`\`\`typescript
import { 
  ElizaProvider,
  useEliza,
  useElizaCredits,
  CreditDisplay,
  LowBalanceWarning
} from '@/components/eliza';

// ElizaProvider - already in layout.tsx
// Provides credits context

// Analytics - ALWAYS add in layout.tsx for dashboard metrics
import { Analytics } from '@vercel/analytics/react';
// <Analytics /> inside body, after ElizaProvider

// useElizaCredits - credit balance from context
const { balance, hasLowBalance, refresh } = useElizaCredits();

// CreditDisplay - inline balance display
<CreditDisplay showWarning />

// LowBalanceWarning - warning banner
<LowBalanceWarning message="Credits low!" />
\`\`\`

### FORBIDDEN - Never Do These:
- Create or modify \`@/lib/eliza.ts\`
- Create or modify \`@/hooks/use-eliza.ts\`
- Create API key input fields
- Ask users to enter API keys
- Create settings pages for credentials
`;

/**
 * Integration prompt for Claude
 */
export const ELIZA_INTEGRATION_PROMPT = `
## Eliza Cloud Integration

### CRITICAL:
1. SDK files are PRE-BUILT - DO NOT recreate them
2. API key is PRE-CONFIGURED - DO NOT create input fields for it
3. ElizaProvider is in layout.tsx - DO NOT add it again
4. Analytics from @vercel/analytics/react - ALWAYS add \`<Analytics />\` in layout.tsx

### Quick Start:
\`\`\`typescript
// API calls
import { chat, generateImage } from '@/lib/eliza';

// React hooks
import { useChat, useChatStream, useCredits } from '@/hooks/use-eliza';

// Context hooks
import { useElizaCredits, CreditDisplay } from '@/components/eliza';
\`\`\`

### Available CSS Utilities (globals.css):
- \`.btn-eliza\` - Orange primary button
- \`.btn-eliza-outline\` - Outlined button
- \`.card-eliza\` - Dark card container
- \`.input-eliza\` - Text input
- \`.prose-eliza\` - Markdown content styling

**NEVER ask users to configure API keys. Everything is pre-configured.**
`;
