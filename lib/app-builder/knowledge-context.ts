/**
 * Knowledge Context Builder for AI App Builder
 *
 * Aggregates context for Claude to build Eliza Cloud apps.
 * Documents the ACTUAL files in cloud-apps-template.
 *
 * Supports tiered context loading to optimize token usage.
 */

import { buildApiContext } from "@/lib/fragments/api-context";
import type { ComponentCategory } from "./component-registry";

// ============================================================================
// TYPES
// ============================================================================

export type ContextTier = "minimal" | "standard" | "comprehensive";

export interface KnowledgeContextConfig {
  tier?: ContextTier;
  templateType?: string;
  includeApis?: string[];
  includeComponents?: ComponentCategory[];
  includePatterns?: PatternType[];
  customInstructions?: string;
}

export interface KnowledgeContext {
  tier: ContextTier;
  sdkReference: string;
  componentCatalog: string;
  apiReference: string;
  patterns: string;
  constraints: string;
  estimatedTokens: number;
}

export type PatternType =
  | "streaming-chat"
  | "agent-chat"
  | "image-generation"
  | "credits-display"
  | "dashboard-layout"
  | "data-fetching"
  | "form-handling";

// ============================================================================
// TIER CONFIGURATIONS
// ============================================================================

const TIER_CONFIG: Record<
  ContextTier,
  {
    tokens: number;
    includes: {
      sdk: "compact" | "full";
      components: "compact" | "full" | "none";
      apis: "none" | "essential" | "full";
      patterns: "none" | "common" | "all";
    };
  }
> = {
  minimal: {
    tokens: 2500,
    includes: {
      sdk: "compact",
      components: "compact",
      apis: "none",
      patterns: "none",
    },
  },
  standard: {
    tokens: 8000,
    includes: {
      sdk: "full",
      components: "compact",
      apis: "essential",
      patterns: "common",
    },
  },
  comprehensive: {
    tokens: 20000,
    includes: {
      sdk: "full",
      components: "full",
      apis: "full",
      patterns: "all",
    },
  },
};

// ============================================================================
// CONSTRAINTS - What NOT to do
// ============================================================================

const CONSTRAINTS = `
## CRITICAL CONSTRAINTS - NEVER DO THESE:

### Files That Are Pre-Built (DO NOT recreate):
- \`@/lib/eliza.ts\` - SDK is pre-configured with all API functions
- \`@/hooks/use-eliza.ts\` - React hooks are pre-built
- \`@/components/eliza/\` - Provider and utilities are ready to use

### API Key Handling:
- **DO NOT** create API key input fields, forms, or configuration screens
- **DO NOT** ask users to "enter your API key" or "set ELIZA_API_KEY"
- **DO NOT** create settings pages for API credentials
- The API key is automatically injected via \`NEXT_PUBLIC_ELIZA_API_KEY\`

### Styling:
- **DO NOT** use Tailwind v3 syntax (@tailwind base/components/utilities)
- **USE** Tailwind v4 syntax: \`@import "tailwindcss";\` in globals.css
- **USE** standard Tailwind classes: \`bg-gray-900\`, \`text-white\`, etc.
- **USE** utility classes in globals.css: \`.btn-eliza\`, \`.card-eliza\`, \`.input-eliza\`

### Architecture:
- **DO NOT** build custom API clients (use \`@/lib/eliza\`)
- **DO NOT** build custom streaming logic (use \`useChatStream\` hook)
- **DO NOT** implement credit checking manually (use \`useElizaCredits\` hook)
- **ALWAYS** wrap app in \`ElizaProvider\` (already in layout.tsx)
`;

// ============================================================================
// SDK REFERENCE - Documents actual @/lib/eliza.ts
// ============================================================================

const SDK_REFERENCE_FULL = `
## Eliza Cloud SDK - \`@/lib/eliza.ts\` (PRE-BUILT)

The SDK is pre-configured. Just import and use:

\`\`\`typescript
import { 
  chat, 
  chatStream, 
  generateImage, 
  generateVideo,
  listAgents, 
  chatWithAgent, 
  uploadFile, 
  getBalance,
  trackPageView 
} from '@/lib/eliza';
\`\`\`

### AI Chat

\`\`\`typescript
// Non-streaming
const response = await chat([
  { role: 'user', content: 'Hello!' }
], 'gpt-4o');
console.log(response.choices[0].message.content);

// Streaming (async generator)
for await (const chunk of chatStream([{ role: 'user', content: 'Hello!' }])) {
  const content = chunk.choices?.[0]?.delta?.content;
  if (content) process.stdout.write(content);
}
\`\`\`

### Image Generation

\`\`\`typescript
const { url, id } = await generateImage('A sunset over mountains', {
  model: 'dall-e-3',
  width: 1024,
  height: 1024
});
\`\`\`

### Video Generation

\`\`\`typescript
const { url, id } = await generateVideo('A timelapse of clouds', {
  duration: 5
});
\`\`\`

### AI Agents

\`\`\`typescript
// List available agents
const { agents } = await listAgents();

// Chat with an agent (maintains conversation via roomId)
let roomId: string | undefined;
const { response, roomId: newRoomId } = await chatWithAgent(
  'agent-123',
  'Hello!',
  roomId
);
roomId = newRoomId; // Save for continued conversation
\`\`\`

### File Upload

\`\`\`typescript
const { url, id } = await uploadFile(file, 'document.pdf');
\`\`\`

### Credits

\`\`\`typescript
const { balance } = await getBalance();
if (balance < 10) console.warn('Low credits!');
\`\`\`

## React Hooks - \`@/hooks/use-eliza.ts\` (PRE-BUILT)

\`\`\`typescript
import {
  useChat,
  useChatStream,
  useImageGeneration,
  useAgents,
  useCredits,
  useFileUpload,
  usePageTracking
} from '@/hooks/use-eliza';
\`\`\`

### useChat - Non-streaming chat

\`\`\`typescript
const { send, loading, error, reset } = useChat();

const handleSend = async () => {
  const response = await send([{ role: 'user', content: input }]);
  if (response) {
    setOutput(response.choices[0].message.content);
  }
};
\`\`\`

### useChatStream - Streaming responses

\`\`\`typescript
const { stream, loading, error } = useChatStream();
const [content, setContent] = useState('');

const handleStream = async () => {
  setContent('');
  for await (const chunk of stream([{ role: 'user', content: input }])) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) setContent(prev => prev + delta);
  }
};
\`\`\`

### useImageGeneration

\`\`\`typescript
const { generate, loading, error, imageUrl, reset } = useImageGeneration();

await generate('A beautiful landscape');
// imageUrl is automatically updated
\`\`\`

### useAgents - List and chat with agents

\`\`\`typescript
const { agents, loading, error, chatWith } = useAgents();

// agents is auto-fetched on mount
const { response } = await chatWith(agents[0].id, 'Hello!');
// Conversation state is tracked automatically
\`\`\`

### useCredits - Balance management

\`\`\`typescript
const { balance, loading, error, refresh } = useCredits(30000); // auto-refresh every 30s

if (balance !== null && balance < 10) {
  showLowBalanceWarning();
}
\`\`\`

### useFileUpload

\`\`\`typescript
const { upload, loading, error, uploadedUrl, reset } = useFileUpload();

const handleUpload = async (file: File) => {
  const url = await upload(file);
  console.log('Uploaded to:', url);
};
\`\`\`
`;

const SDK_REFERENCE_COMPACT = `
## Eliza SDK (PRE-BUILT - DO NOT RECREATE)

### Functions (\`@/lib/eliza\`):
- \`chat(messages, model?)\` - AI chat completion
- \`chatStream(messages, model?)\` - Streaming chat (async generator)
- \`generateImage(prompt, options?)\` - Image generation
- \`generateVideo(prompt, options?)\` - Video generation
- \`listAgents()\` - List AI agents
- \`chatWithAgent(agentId, message, roomId?)\` - Agent chat
- \`uploadFile(file, filename)\` - File upload
- \`getBalance()\` - Get credit balance

### Hooks (\`@/hooks/use-eliza\`):
- \`useChat()\` - { send, loading, error }
- \`useChatStream()\` - { stream, loading, error }
- \`useImageGeneration()\` - { generate, loading, imageUrl }
- \`useAgents()\` - { agents, loading, chatWith }
- \`useCredits(interval?)\` - { balance, loading, refresh }
- \`useFileUpload()\` - { upload, loading, uploadedUrl }
`;

// ============================================================================
// COMPONENT REFERENCE - Documents actual @/components/eliza/
// ============================================================================

const COMPONENT_REFERENCE_FULL = `
## Eliza Components - \`@/components/eliza/\` (PRE-BUILT)

### ElizaProvider
Wraps your app with analytics and credits context. Already in \`layout.tsx\`.

\`\`\`typescript
import { ElizaProvider } from '@/components/eliza';

// In layout.tsx (already configured):
<ElizaProvider 
  creditsRefreshInterval={60000}  // Auto-refresh credits
  lowBalanceThreshold={10}        // Warn below this
  disableAnalytics={false}        // Page tracking
>
  {children}
</ElizaProvider>
\`\`\`

### useEliza - Access full context

\`\`\`typescript
import { useEliza } from '@/components/eliza';

const { credits, appId, isReady } = useEliza();
\`\`\`

### useElizaCredits - Credits management

\`\`\`typescript
import { useElizaCredits } from '@/components/eliza';

const { balance, loading, error, refresh, hasLowBalance } = useElizaCredits();

if (hasLowBalance) {
  // Show warning
}
\`\`\`

### CreditDisplay - Show balance

\`\`\`typescript
import { CreditDisplay } from '@/components/eliza';

// In your header or sidebar:
<CreditDisplay showWarning className="text-sm" />
\`\`\`

### LowBalanceWarning - Warning banner

\`\`\`typescript
import { LowBalanceWarning } from '@/components/eliza';

// Shows automatically when balance is low:
<LowBalanceWarning 
  message="Your credits are running low."
/>
\`\`\`

## Utility CSS Classes (in globals.css)

- \`.btn-eliza\` - Primary orange button
- \`.btn-eliza-outline\` - Outlined button
- \`.card-eliza\` - Dark card with border
- \`.input-eliza\` - Text input field
- \`.prose-eliza\` - Markdown/prose styling
- \`.animate-fade-in\` - Fade in animation
- \`.animate-slide-up\` - Slide up animation
`;

const COMPONENT_REFERENCE_COMPACT = `
## Eliza Components (PRE-BUILT)

### From \`@/components/eliza\`:
- \`ElizaProvider\` - Wrap app (already in layout.tsx)
- \`useEliza()\` - { credits, appId, isReady }
- \`useElizaCredits()\` - { balance, loading, hasLowBalance, refresh }
- \`CreditDisplay\` - Show balance inline
- \`LowBalanceWarning\` - Warning banner

### CSS Utilities (globals.css):
- \`.btn-eliza\` - Primary button
- \`.btn-eliza-outline\` - Outlined button
- \`.card-eliza\` - Card container
- \`.input-eliza\` - Text input
`;

// ============================================================================
// PATTERNS - Real code examples using actual template
// ============================================================================

const PATTERNS: Record<PatternType, { description: string; code: string }> = {
  "streaming-chat": {
    description: "Streaming chat with AI",
    code: `'use client';
import { useState } from 'react';
import { useChatStream } from '@/hooks/use-eliza';
import { Send, Loader2 } from 'lucide-react';

type Message = { role: 'user' | 'assistant'; content: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const { stream, loading } = useChatStream();

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    // Add empty assistant message for streaming
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    for await (const chunk of stream([...messages, userMsg])) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].content += delta;
          return updated;
        });
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={\`flex \${m.role === 'user' ? 'justify-end' : 'justify-start'}\`}>
            <div className={\`max-w-[80%] p-3 rounded-lg \${
              m.role === 'user' 
                ? 'bg-eliza-orange text-white' 
                : 'bg-gray-800 text-gray-200'
            }\`}>
              {m.content || <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-gray-800">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="input-eliza flex-1"
            disabled={loading}
          />
          <button onClick={handleSend} disabled={loading} className="btn-eliza">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}`,
  },

  "agent-chat": {
    description: "Chat with AI agents",
    code: `'use client';
import { useState } from 'react';
import { useAgents } from '@/hooks/use-eliza';
import { Bot, ArrowLeft, Send, Loader2 } from 'lucide-react';

export default function AgentsPage() {
  const { agents, loading, error, chatWith } = useAgents();
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || !selected || sending) return;
    
    setSending(true);
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    setInput('');
    
    const result = await chatWith(selected, input);
    if (result) {
      setMessages(prev => [...prev, { role: 'assistant', content: result.response }]);
    }
    setSending(false);
  };

  if (loading) return <div className="p-8 text-gray-400">Loading agents...</div>;
  if (error) return <div className="p-8 text-red-400">{error}</div>;

  if (selected) {
    const agent = agents.find(a => a.id === selected);
    return (
      <div className="flex flex-col h-screen">
        <header className="p-4 border-b border-gray-800 flex items-center gap-3">
          <button onClick={() => { setSelected(null); setMessages([]); }} className="btn-eliza-outline p-2">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Bot className="h-5 w-5 text-eliza-orange" />
          <span className="font-medium">{agent?.name}</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={\`\${m.role === 'user' ? 'text-right' : ''}\`}>
              <div className={\`inline-block p-3 rounded-lg \${
                m.role === 'user' ? 'bg-eliza-orange' : 'bg-gray-800'
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
              className="input-eliza flex-1"
              placeholder="Message agent..."
            />
            <button onClick={handleSend} disabled={sending} className="btn-eliza">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Choose an Agent</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(agent => (
          <button
            key={agent.id}
            onClick={() => setSelected(agent.id)}
            className="card-eliza text-left hover:border-eliza-orange transition-colors"
          >
            <Bot className="h-8 w-8 text-eliza-orange mb-3" />
            <h3 className="font-medium text-lg">{agent.name}</h3>
            <p className="text-sm text-gray-400 mt-1">{agent.bio}</p>
          </button>
        ))}
      </div>
    </div>
  );
}`,
  },

  "image-generation": {
    description: "Generate images with AI",
    code: `'use client';
import { useState } from 'react';
import { useImageGeneration } from '@/hooks/use-eliza';
import { ImageIcon, Loader2, Download } from 'lucide-react';

export default function ImagePage() {
  const [prompt, setPrompt] = useState('');
  const { generate, loading, error, imageUrl, reset } = useImageGeneration();
  const [history, setHistory] = useState<string[]>([]);

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    
    const url = await generate(prompt);
    if (url) {
      setHistory(prev => [url, ...prev]);
      setPrompt('');
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Image Generator</h1>
      
      <div className="card-eliza mb-6">
        <div className="flex gap-3">
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            placeholder="Describe the image you want to create..."
            className="input-eliza flex-1"
            disabled={loading}
          />
          <button onClick={handleGenerate} disabled={loading} className="btn-eliza">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            Generate
          </button>
        </div>
        
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {imageUrl && (
          <div className="mt-4 relative group">
            <img src={imageUrl} alt="Generated" className="w-full rounded-lg" />
            <a
              href={imageUrl}
              download
              className="absolute top-2 right-2 p-2 bg-gray-900/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-4">History</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {history.map((url, i) => (
              <img key={i} src={url} alt="" className="rounded-lg aspect-square object-cover" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}`,
  },

  "credits-display": {
    description: "Display and manage credits",
    code: `'use client';
import { useElizaCredits, CreditDisplay, LowBalanceWarning } from '@/components/eliza';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';

export default function BillingPage() {
  const { balance, loading, refresh, hasLowBalance } = useElizaCredits();

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Billing & Credits</h1>
      
      <LowBalanceWarning />
      
      <div className="card-eliza">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Current Balance</h2>
          <button 
            onClick={refresh} 
            disabled={loading}
            className="btn-eliza-outline p-2"
          >
            <RefreshCw className={\`h-4 w-4 \${loading ? 'animate-spin' : ''}\`} />
          </button>
        </div>
        
        <div className="text-4xl font-bold text-eliza-orange">
          {balance !== null ? balance.toLocaleString() : '—'}
          <span className="text-lg font-normal text-gray-400 ml-2">credits</span>
        </div>
        
        {hasLowBalance && (
          <div className="mt-4 flex items-center gap-2 text-amber-400 text-sm">
            <TrendingDown className="h-4 w-4" />
            Running low - consider topping up
          </div>
        )}
      </div>

      <div className="card-eliza">
        <h2 className="text-lg font-medium mb-4">Pricing Reference</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Chat (GPT-4o)</span>
            <span>~0.01 credits/message</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Image Generation</span>
            <span>~0.50 credits/image</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Video Generation</span>
            <span>~5.00 credits/video</span>
          </div>
        </div>
      </div>
    </div>
  );
}`,
  },

  "dashboard-layout": {
    description: "Dashboard with navigation",
    code: `'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CreditDisplay } from '@/components/eliza';
import { 
  Home, MessageSquare, Image, Settings, 
  Menu, X, Sparkles 
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/dashboard/chat', label: 'Chat', icon: MessageSquare },
  { href: '/dashboard/images', label: 'Images', icon: Image },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className={\`
        fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800
        transform transition-transform lg:translate-x-0 lg:static
        \${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      \`}>
        <div className="flex items-center gap-3 p-4 border-b border-gray-800">
          <Sparkles className="h-6 w-6 text-eliza-orange" />
          <span className="font-semibold">My App</span>
        </div>
        
        <nav className="p-4 space-y-1">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={\`
                flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                \${pathname === item.href 
                  ? 'bg-eliza-orange/10 text-eliza-orange' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'}
              \`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between p-4 border-b border-gray-800">
          <button 
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden btn-eliza-outline p-2"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <CreditDisplay />
        </header>
        
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}`,
  },

  "data-fetching": {
    description: "Fetch and display data",
    code: `'use client';
import { useAgents, useCredits } from '@/hooks/use-eliza';
import { useElizaCredits } from '@/components/eliza';
import { Bot, Coins, RefreshCw } from 'lucide-react';

export default function DashboardHome() {
  const { agents, loading: agentsLoading } = useAgents();
  const { balance, loading: creditsLoading, refresh } = useElizaCredits();

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Credits Card */}
        <div className="card-eliza">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-eliza-orange" />
              <h2 className="font-medium">Credits</h2>
            </div>
            <button onClick={refresh} disabled={creditsLoading} className="text-gray-400 hover:text-white">
              <RefreshCw className={\`h-4 w-4 \${creditsLoading ? 'animate-spin' : ''}\`} />
            </button>
          </div>
          <p className="text-3xl font-bold">
            {creditsLoading ? '...' : balance?.toLocaleString() ?? '—'}
          </p>
        </div>

        {/* Agents Card */}
        <div className="card-eliza">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="h-5 w-5 text-eliza-orange" />
            <h2 className="font-medium">Available Agents</h2>
          </div>
          <p className="text-3xl font-bold">
            {agentsLoading ? '...' : agents.length}
          </p>
        </div>
      </div>

      {/* Agents List */}
      {!agentsLoading && agents.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-4">Your Agents</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map(agent => (
              <div key={agent.id} className="card-eliza">
                <Bot className="h-6 w-6 text-eliza-orange mb-2" />
                <h3 className="font-medium">{agent.name}</h3>
                <p className="text-sm text-gray-400 mt-1">{agent.bio}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}`,
  },

  "form-handling": {
    description: "Form with AI processing",
    code: `'use client';
import { useState } from 'react';
import { useChat } from '@/hooks/use-eliza';
import { Loader2, Send } from 'lucide-react';

export default function AIFormPage() {
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState('');
  const { send, loading, error } = useChat();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || loading) return;

    const response = await send([
      { role: 'system', content: \`The user's name is \${name || 'Anonymous'}. Be helpful and friendly.\` },
      { role: 'user', content: question }
    ]);

    if (response?.choices?.[0]?.message?.content) {
      setResult(response.choices[0].message.content);
    }
  };

  return (
    <div className="p-8 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Ask AI</h1>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Your Name (optional)
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="John"
            className="input-eliza"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Your Question
          </label>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="What would you like to know?"
            rows={4}
            className="input-eliza resize-none"
            required
          />
        </div>

        <button 
          type="submit" 
          disabled={loading || !question.trim()} 
          className="btn-eliza w-full"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
          ) : (
            <><Send className="h-4 w-4" /> Ask AI</>
          )}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 card-eliza animate-fade-in">
          <h2 className="text-sm font-medium text-gray-400 mb-2">Response</h2>
          <div className="prose-eliza">
            {result}
          </div>
        </div>
      )}
    </div>
  );
}`,
  },
};

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build knowledge context for AI App Builder
 */
export async function buildKnowledgeContext(
  config: KnowledgeContextConfig = {},
): Promise<KnowledgeContext> {
  const tier = config.tier || "standard";
  const tierConfig = TIER_CONFIG[tier];

  // SDK Reference
  const sdkReference =
    tierConfig.includes.sdk === "compact"
      ? SDK_REFERENCE_COMPACT
      : SDK_REFERENCE_FULL;

  // Component Catalog
  let componentCatalog = "";
  if (tierConfig.includes.components === "full") {
    componentCatalog = COMPONENT_REFERENCE_FULL;
  } else if (tierConfig.includes.components === "compact") {
    componentCatalog = COMPONENT_REFERENCE_COMPACT;
  }

  // API Reference
  let apiReference = "";
  if (tierConfig.includes.apis === "essential") {
    apiReference = await buildApiContext({
      categories: ["AI Completions", "Image Generation"],
      limit: 10,
      includeExamples: false,
    });
  } else if (tierConfig.includes.apis === "full") {
    apiReference = await buildApiContext({
      categories: config.includeApis,
      limit: 30,
      includeExamples: true,
    });
  }

  // Patterns
  let patterns = "";
  const patternTypes = config.includePatterns || getDefaultPatterns(tierConfig);
  if (patternTypes.length > 0) {
    patterns = buildPatternsSection(patternTypes);
  }

  // Estimate tokens (rough: 1 token ≈ 4 chars)
  const totalChars =
    sdkReference.length +
    componentCatalog.length +
    apiReference.length +
    patterns.length +
    CONSTRAINTS.length;
  const estimatedTokens = Math.ceil(totalChars / 4);

  return {
    tier,
    sdkReference,
    componentCatalog,
    apiReference,
    patterns,
    constraints: CONSTRAINTS,
    estimatedTokens,
  };
}

function getDefaultPatterns(
  tierConfig: (typeof TIER_CONFIG)[ContextTier],
): PatternType[] {
  if (tierConfig.includes.patterns === "none") return [];
  if (tierConfig.includes.patterns === "common") {
    return ["streaming-chat", "credits-display", "dashboard-layout"];
  }
  return Object.keys(PATTERNS) as PatternType[];
}

function buildPatternsSection(patternTypes: PatternType[]): string {
  let section = `## Code Patterns\n\n`;
  section += `Copy these patterns for implementing features:\n\n`;

  for (const type of patternTypes) {
    const pattern = PATTERNS[type];
    if (pattern) {
      section += `### ${type
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")}\n`;
      section += `${pattern.description}\n\n`;
      section += `\`\`\`tsx\n${pattern.code}\n\`\`\`\n\n`;
    }
  }

  return section;
}

/**
 * Build complete system prompt with knowledge context
 */
export async function buildSystemPromptWithContext(config: {
  templateType?: string;
  tier?: ContextTier;
  includeApis?: string[];
  includeComponents?: ComponentCategory[];
  includePatterns?: PatternType[];
  customInstructions?: string;
}): Promise<string> {
  const context = await buildKnowledgeContext(config);

  let prompt = `You are an expert Next.js developer building production apps on Eliza Cloud.

## Tech Stack
- Next.js 16 (App Router, src/app/)
- TypeScript, React 19
- Tailwind CSS 4 (standard classes only)

## CRITICAL: Tailwind CSS v4 Setup
The globals.css uses Tailwind v4 syntax:
\`\`\`css
@import "tailwindcss";
\`\`\`

${context.constraints}

${context.sdkReference}

${context.componentCatalog}

${context.patterns}

${context.apiReference}

## UI Guidelines
- Dark theme: bg-gray-900/950, text-white
- Eliza orange: Use \`eliza-orange\` CSS variable or #FF5800
- Use utility classes: \`.btn-eliza\`, \`.card-eliza\`, \`.input-eliza\`
- Mobile-first responsive design

## Workflow
1. Use pre-built hooks (\`@/hooks/use-eliza\`) for all API calls
2. Use \`ElizaProvider\` context (already wrapped in layout.tsx)
3. Use utility CSS classes from globals.css
4. Create new components only when needed
5. Run \`pnpm build\` before completing to catch TypeScript errors
`;

  if (config.customInstructions) {
    prompt += `\n## Additional Instructions\n${config.customInstructions}\n`;
  }

  return prompt;
}

/**
 * Smart tier selection based on prompt analysis
 */
export function selectContextTier(
  prompt: string,
  templateType?: string,
): ContextTier {
  const lowerPrompt = prompt.toLowerCase();

  // Keywords that suggest need for comprehensive context
  const complexKeywords = [
    "dashboard",
    "analytics",
    "billing",
    "authentication",
    "multi-page",
    "complete app",
    "full application",
    "integration",
    "agent",
    "voice",
    "video",
  ];

  // Keywords that suggest minimal context is sufficient
  const simpleKeywords = [
    "button",
    "style",
    "color",
    "text",
    "fix",
    "change",
    "update",
    "small",
    "simple",
  ];

  const hasComplex = complexKeywords.some((kw) => lowerPrompt.includes(kw));
  const hasSimple = simpleKeywords.some((kw) => lowerPrompt.includes(kw));

  // Template-based defaults
  const complexTemplates = ["agent-dashboard", "analytics", "mcp-service"];
  const isComplexTemplate =
    templateType && complexTemplates.includes(templateType);

  if (isComplexTemplate || (hasComplex && !hasSimple)) {
    return "comprehensive";
  }

  if (hasSimple && !hasComplex) {
    return "minimal";
  }

  return "standard";
}

// Export patterns for external use
export { PATTERNS };
