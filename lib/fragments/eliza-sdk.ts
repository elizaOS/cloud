/**
 * Eliza Cloud SDK Reference
 * 
 * Compact, comprehensive API reference for AI App Builder.
 * Provides easy-to-use patterns for all Eliza Cloud services.
 */

/**
 * Complete Eliza Cloud SDK documentation for Claude
 */
export const ELIZA_SDK_REFERENCE = `
## 🚀 Eliza Cloud SDK - Quick Reference

All APIs use: \`Authorization: Bearer YOUR_API_KEY\` or \`X-Api-Key: YOUR_API_KEY\`
Base URL: Use relative paths (e.g., \`/api/v1/...\`) for client-side code.

---

### 📁 Create: lib/eliza.ts (API Client)

\`\`\`typescript
// lib/eliza.ts - Core API client
const API_BASE = '';  // Use relative paths

interface ElizaConfig {
  apiKey: string;
}

class ElizaClient {
  constructor(private config: ElizaConfig) {}

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(\`\${API_BASE}\${path}\`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.config.apiKey,
        ...options.headers,
      },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // ========== AI COMPLETIONS ==========
  async chat(messages: Array<{role: string; content: string}>, options?: {
    model?: string;
    stream?: boolean;
    temperature?: number;
  }) {
    return this.fetch('/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ messages, model: options?.model || 'gpt-4o', ...options }),
    });
  }

  async *chatStream(messages: Array<{role: string; content: string}>, model = 'gpt-4o') {
    const res = await fetch('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': this.config.apiKey },
      body: JSON.stringify({ messages, model, stream: true }),
    });
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split('\\n')) {
        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
          try { yield JSON.parse(line.slice(6)); } catch {}
        }
      }
    }
  }

  // ========== IMAGE GENERATION ==========
  async generateImage(prompt: string, options?: {
    model?: string;
    width?: number;
    height?: number;
  }) {
    return this.fetch<{url: string; id: string}>('/api/v1/generate-image', {
      method: 'POST',
      body: JSON.stringify({ prompt, ...options }),
    });
  }

  // ========== VIDEO GENERATION ==========
  async generateVideo(prompt: string, options?: {
    model?: string;
    duration?: number;
  }) {
    return this.fetch<{jobId: string; status: string}>('/api/v1/generate-video', {
      method: 'POST',
      body: JSON.stringify({ prompt, model: options?.model || 'runway-gen3', ...options }),
    });
  }

  // ========== STORAGE ==========
  async uploadFile(file: File | Blob, filename: string) {
    const formData = new FormData();
    formData.append('file', file, filename);
    const res = await fetch('/api/v1/storage/upload', {
      method: 'POST',
      headers: { 'X-Api-Key': this.config.apiKey },
      body: formData,
    });
    return res.json() as Promise<{id: string; url: string; cid?: string}>;
  }

  async listFiles(options?: { limit?: number; cursor?: string }) {
    const params = new URLSearchParams(options as Record<string, string>);
    return this.fetch<{items: Array<{id: string; url: string; pathname: string}>}>(\`/api/v1/storage?\${params}\`);
  }

  // ========== CREDITS & BILLING ==========
  async getBalance() {
    return this.fetch<{balance: number; organizationId: string}>('/api/v1/credits/balance');
  }

  async getUsage(options?: { limit?: number }) {
    const params = new URLSearchParams(options as Record<string, string>);
    return this.fetch<{usage: Array<{type: string; cost: number; createdAt: string}>}>(\`/api/v1/usage?\${params}\`);
  }

  // ========== AGENTS ==========
  async listAgents() {
    return this.fetch<{agents: Array<{id: string; name: string; bio: string}>}>('/api/v1/agents');
  }

  async chatWithAgent(agentId: string, message: string, roomId?: string) {
    return this.fetch<{response: string; roomId: string}>('/api/v1/agents/chat', {
      method: 'POST',
      body: JSON.stringify({ agentId, message, roomId }),
    });
  }

  // ========== MEMORY ==========
  async saveMemory(content: string, roomId: string, type: 'fact' | 'preference' | 'context' = 'fact') {
    return this.fetch<{memoryId: string}>('/api/v1/memory', {
      method: 'POST',
      body: JSON.stringify({ content, roomId, type }),
    });
  }

  async searchMemories(query: string, options?: { roomId?: string; limit?: number }) {
    return this.fetch<{memories: Array<{id: string; content: string; score: number}>}>('/api/v1/memory/search', {
      method: 'POST',
      body: JSON.stringify({ query, ...options }),
    });
  }

  // ========== N8N WORKFLOWS ==========
  async listWorkflows() {
    return this.fetch<{workflows: Array<{id: string; name: string; status: string}>}>('/api/v1/n8n/workflows');
  }

  async executeWorkflow(workflowId: string, data: Record<string, unknown>) {
    return this.fetch<{executionId: string; status: string}>(\`/api/v1/n8n/workflows/\${workflowId}/execute\`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    });
  }

  async triggerWebhook(webhookKey: string, data: Record<string, unknown>) {
    return this.fetch<{success: boolean}>(\`/api/v1/n8n/webhooks/\${webhookKey}\`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ========== A2A (Agent-to-Agent) ==========
  async callA2A(skill: string, params: Record<string, unknown>) {
    return this.fetch('/api/a2a', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'message/send',
        params: {
          message: {
            role: 'user',
            parts: [
              { type: 'data', data: { skill, ...params } },
            ],
          },
        },
        id: crypto.randomUUID(),
      }),
    });
  }

  // ========== CONVERSATIONS ==========
  async createConversation(title: string, model = 'gpt-4o') {
    return this.fetch<{id: string; title: string}>('/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({ title, model }),
    });
  }

  async getConversation(id: string) {
    return this.fetch<{id: string; messages: Array<{role: string; content: string}>}>(\`/api/v1/conversations/\${id}\`);
  }

  // ========== SECRETS ==========
  async listSecrets() {
    return this.fetch<{secrets: Array<{id: string; name: string; description?: string; createdAt: string}>}>('/api/v1/secrets');
  }

  async getSecret(name: string) {
    return this.fetch<{name: string; value?: string; found: boolean}>(\`/api/v1/secrets?name=\${encodeURIComponent(name)}\`);
  }

  async createSecret(name: string, value: string, description?: string) {
    return this.fetch<{id: string; name: string}>('/api/v1/secrets', {
      method: 'POST',
      body: JSON.stringify({ name, value, description }),
    });
  }

  // ========== PLATFORM CREDENTIALS (OAuth) ==========
  async listCredentials(platform?: string) {
    const params = platform ? \`?platform=\${platform}\` : '';
    return this.fetch<{credentials: Array<{
      id: string;
      platform: string;
      platformUsername?: string;
      platformDisplayName?: string;
      status: string;
      scopes: string[];
      linkedAt?: string;
    }>}>(\`/api/v1/credentials\${params}\`);
  }

  async createCredentialLink(platform: 'discord' | 'twitter' | 'google' | 'gmail' | 'github' | 'slack', options?: {
    scopes?: string[];
    callbackUrl?: string;
  }) {
    return this.fetch<{sessionId: string; linkUrl: string; hostedLinkUrl: string; expiresAt: string}>('/api/v1/credentials', {
      method: 'POST',
      body: JSON.stringify({ platform, ...options }),
    });
  }

  async getCredentialToken(credentialId: string) {
    return this.fetch<{accessToken: string; refreshToken?: string; expiresAt?: string}>(\`/api/v1/credentials/\${credentialId}/token\`);
  }
}

export const eliza = (apiKey: string) => new ElizaClient({ apiKey });
export type { ElizaClient };
\`\`\`

---

### 🪝 Create: hooks/use-eliza.ts (React Hook)

\`\`\`typescript
// hooks/use-eliza.ts
'use client';
import { useState, useCallback, useMemo } from 'react';
import { eliza, type ElizaClient } from '@/lib/eliza';

export function useEliza(apiKey: string) {
  const client = useMemo(() => eliza(apiKey), [apiKey]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async <T>(fn: (client: ElizaClient) => Promise<T>): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      return await fn(client);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { client, call, loading, error };
}
\`\`\`

---

### 🔑 Environment Variables

\`\`\`typescript
// Use in app: process.env.NEXT_PUBLIC_ELIZA_API_KEY
// Or prompt user to enter their API key
\`\`\`

---

## 📋 API Quick Reference

| Service | Endpoint | Method | Description |
|---------|----------|--------|-------------|
| **Chat** | /api/v1/chat/completions | POST | AI chat (streaming supported) |
| **Image** | /api/v1/generate-image | POST | Generate images |
| **Video** | /api/v1/generate-video | POST | Generate videos (async) |
| **Storage** | /api/v1/storage/upload | POST | Upload files |
| **Storage** | /api/v1/storage | GET | List files |
| **Credits** | /api/v1/credits/balance | GET | Check balance |
| **Credits** | /api/v1/credits/topup | POST | Add credits (x402) |
| **Agents** | /api/v1/agents | GET | List agents |
| **Agents** | /api/v1/agents/chat | POST | Chat with agent |
| **Memory** | /api/v1/memory | POST | Save memory |
| **Memory** | /api/v1/memory/search | POST | Search memories |
| **Workflows** | /api/v1/n8n/workflows | GET/POST | Manage workflows |
| **Workflows** | /api/v1/n8n/workflows/:id/execute | POST | Execute workflow |
| **Webhooks** | /api/v1/n8n/webhooks/:key | POST | Trigger webhook |
| **A2A** | /api/a2a | POST | Call A2A skills |

---

## 🎯 A2A Skills Available

Call via \`client.callA2A('skill_name', params)\`:

| Skill | Description | Key Params |
|-------|-------------|------------|
| chat_completion | Generate text | messages, model |
| image_generation | Create images | prompt, aspectRatio |
| video_generation | Create videos | prompt, duration |
| check_balance | Get credit balance | - |
| get_usage | Get usage history | limit |
| list_agents | List AI agents | limit |
| chat_with_agent | Chat with agent | agentId, message |
| save_memory | Store memory | content, roomId, type |
| retrieve_memories | Search memories | query, roomId |
| list_containers | List deployments | status |
| storage_upload | Upload to storage | content (base64), filename |
| storage_list | List stored files | limit, cursor |
| n8n_list_workflows | List workflows | status |
| n8n_create_workflow | Create workflow | name, workflowData |
| generate_fragment | Generate code | prompt, template |
| marketplace_discover | Search agents/MCPs | query, types, tags |

---

## 🔧 N8N Workflow Integration

\`\`\`typescript
// Execute an existing workflow
const result = await client.executeWorkflow('workflow-id', {
  input: 'your data',
  parameters: { key: 'value' },
});

// Trigger via webhook (no auth required for webhook URL)
await fetch('/api/v1/n8n/webhooks/your-webhook-key', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: 'your payload' }),
});

// Create a workflow programmatically
const workflow = await client.callA2A('n8n_create_workflow', {
  name: 'My Workflow',
  description: 'Automated task',
  workflowData: {
    nodes: [...],
    connections: {...},
  },
});
\`\`\`

---

## 💾 Storage Patterns

\`\`\`typescript
// Upload with drag-and-drop
async function handleDrop(files: FileList) {
  for (const file of files) {
    const { url, id } = await client.uploadFile(file, file.name);
    console.log('Uploaded:', url);
  }
}

// List and display files
const { items } = await client.listFiles({ limit: 20 });
items.map(f => <img key={f.id} src={f.url} alt={f.pathname} />);
\`\`\`

---

## 💳 Credits & Billing

\`\`\`typescript
// Check before expensive operations
const { balance } = await client.getBalance();
if (balance < 5) {
  alert('Low credits! Please top up.');
  return;
}

// Show usage
const { usage } = await client.getUsage({ limit: 10 });
// usage: [{ type: 'chat', cost: 0.02, createdAt: '...' }, ...]
\`\`\`

---

## 🤖 Agent Integration

\`\`\`typescript
// List and select agent
const { agents } = await client.listAgents();
const agent = agents[0];

// Chat with agent (maintains conversation in roomId)
let roomId: string | undefined;
const response = await client.chatWithAgent(agent.id, 'Hello!', roomId);
roomId = response.roomId;  // Save for continuity

// Store important facts
await client.saveMemory('User prefers dark mode', roomId, 'preference');
\`\`\`

---

## 🔐 Secrets Management

\`\`\`typescript
// List all secrets (metadata only)
const { secrets } = await client.listSecrets();
// secrets: [{ id, name, description, createdAt }]

// Get a secret value by name
const { value } = await client.getSecret('OPENAI_API_KEY');

// Create a new secret
await client.createSecret('MY_API_KEY', 'sk-...', 'My API key for external service');
\`\`\`

---

## 🔗 Platform OAuth (Discord, Google, GitHub, etc.)

\`\`\`typescript
// List connected platform accounts
const { credentials } = await client.listCredentials('discord');
// credentials: [{ id, platform, platformUsername, status, scopes }]

// Create a link for user to connect their platform account
const { linkUrl, hostedLinkUrl } = await client.createCredentialLink('discord', {
  scopes: ['identify', 'email'],
  callbackUrl: 'https://myapp.com/callback',
});
// Redirect user to linkUrl or hostedLinkUrl

// After user completes OAuth, get their access token
const { accessToken } = await client.getCredentialToken(credentialId);
// Use accessToken to call platform APIs on behalf of user
\`\`\`

Supported platforms: \`discord\`, \`twitter\`, \`google\`, \`gmail\`, \`github\`, \`slack\`
`;

/**
 * Compact system prompt addon for the App Builder
 */
export const ELIZA_INTEGRATION_PROMPT = `
## Eliza Cloud Integration

Your apps have FULL ACCESS to the Eliza Cloud platform. Always create \`lib/eliza.ts\` and \`hooks/use-eliza.ts\` first, then use them throughout your app.

### Quick Start Pattern:
1. Create \`lib/eliza.ts\` - API client (see SDK reference)
2. Create \`hooks/use-eliza.ts\` - React hook wrapper
3. Use \`const { client, call, loading } = useEliza(apiKey)\` in components
4. Call services: \`await call(c => c.chat(messages))\`

### Available Services:
- **AI**: chat (streaming), images, videos
- **Storage**: upload files, list/retrieve
- **Agents**: list agents, chat with agents, memory
- **Billing**: check credits, usage tracking
- **Workflows**: list/create/execute n8n workflows, webhooks
- **Secrets**: encrypted key-value storage for API keys
- **Credentials**: OAuth connections (Discord, Google, GitHub, etc.)
- **A2A**: call any A2A skill directly

### API Key:
- Use \`process.env.NEXT_PUBLIC_ELIZA_API_KEY\` if available
- Or let users input their key (store in localStorage)

### Auth Header:
All requests: \`X-Api-Key: YOUR_API_KEY\` or \`Authorization: Bearer YOUR_API_KEY\`

When building apps that need data persistence, use the Storage API instead of localStorage for cross-device sync.
For AI features, always use our chat/image/video APIs - they handle model routing, billing, and rate limiting.
For automation, use n8n workflows - they can be triggered via webhooks or executed directly.
`;

