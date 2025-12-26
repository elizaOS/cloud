import { Templates, templatesToPrompt } from "./templates";
import { buildApiContext } from "./api-context";
import { ELIZA_SDK_COMPACT, ELIZA_SDK_REFERENCE } from "./eliza-sdk";

// ============================================================================
// QUICK MODE (Fragment Builder) - Single file generation
// ============================================================================

/**
 * Build system prompt for fragment generation
 * Includes template information and API documentation
 */
export async function buildFragmentPrompt(
  template: Templates,
  includeApiContext = true,
): Promise<string> {
  const basePrompt = `
    You are a skilled software engineer.
    You do not make mistakes.
    Generate a fragment.
    You can install additional dependencies.
    Do not touch project dependencies files like package.json, package-lock.json, requirements.txt, etc.
    Do not wrap code in backticks.
    Always break the lines correctly.
    You can use one of the following templates:
    ${templatesToPrompt(template)}
  `;

  if (!includeApiContext) {
    return basePrompt;
  }

  // Include relevant API documentation
  const apiContext = await buildApiContext({
    categories: [
      "AI Completions",
      "Image Generation",
      "Video Generation",
      "Containers",
    ],
    tags: ["ai-generation", "code-generation", "containers"],
    limit: 30,
    includeExamples: true,
  });

  return `${basePrompt}

## Available Eliza Cloud APIs

When generating code that needs to interact with Eliza Cloud services, you can use these APIs:

${apiContext}

## App Storage & APIs (When Deployed as App)

When fragments are deployed as apps, they automatically get access to:

### Storage API
- **Collections**: Schema-validated document stores
- **Documents**: JSONB storage with indexed fields
- **API**: \`/api/v1/app/storage/:collection\`
- **Client Helpers**: \`insertDocument\`, \`queryDocuments\`, \`updateDocument\`, \`deleteDocument\`
- Collections are automatically created based on code analysis

### App APIs
- **User Info**: \`/api/v1/app/user\`
- **Agents**: \`/api/v1/app/agents\`
- **Billing**: \`/api/v1/app/billing\`
- **Storage**: \`/api/v1/app/storage\`
- **Proxy Layer**: \`/api/proxy/*\` routes to cloud APIs

### Auto-Injected Helpers
When deployed as app, the following helpers are automatically injected:
- \`useAuth()\` - Authentication hook
- \`useStorage()\` - Storage client
- \`cloudAPI\` - API client
- Environment variables: \`ELIZA_CLOUD_API_KEY\`, \`ELIZA_APP_ID\`

**Important Notes:**
- All API calls require authentication: \`Authorization: Bearer eliza_your_api_key\`
- API calls consume credits from the organization's balance
- Use the base URL: ${process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com"}
- For client-side code, use relative paths: \`/api/v1/...\`
- For server-side code, use full URLs or environment variables
- When deployed as app, storage collections are created automatically
- Use storage helpers instead of localStorage for persistent data
`;
}

// ============================================================================
// FULL APP MODE (Vercel Sandbox) - Multi-file Next.js apps
// ============================================================================

/**
 * Template types for full app mode
 */
export type FullAppTemplateType =
  | "chat"
  | "agent-dashboard"
  | "landing-page"
  | "analytics"
  | "blank";

/**
 * Base system prompt for full app building with Vercel Sandbox
 */
export const FULL_APP_BASE_PROMPT = `You are an expert Next.js developer building production-ready apps on Eliza Cloud.

## Tech Stack
- Next.js 15 (App Router, src/app/)
- TypeScript, React 19
- Tailwind CSS 4 (standard classes only: bg-gray-900, text-white, etc.)

## Project Structure
\`\`\`
src/
├── app/              # Pages (layout.tsx, page.tsx, [routes]/page.tsx)
├── components/
│   ├── ui/           # Reusable: button.tsx, card.tsx, input.tsx
│   └── layout/       # Header, sidebar, footer
├── lib/
│   ├── eliza.ts      # ✅ PRE-BUILT - Eliza Cloud API client
│   └── utils.ts      # Helper functions
├── hooks/
│   └── use-eliza.ts  # ✅ PRE-BUILT - Eliza React hook
└── types/            # TypeScript types
\`\`\`

## ⚡ WORKFLOW
1. \`install_packages\` for dependencies
2. **SDK is pre-configured** - Just import from \`@/lib/eliza\` and \`@/hooks/use-eliza\`
3. Create UI components
4. Create pages
5. \`check_build\` after each file → fix errors → repeat

**CRITICAL:** The API key is already configured via environment variables. DO NOT create API key input fields or prompts.

## 🚫 FORBIDDEN - Never Do These:
- Create or overwrite \`lib/eliza.ts\` (already exists)
- Create or overwrite \`hooks/use-eliza.ts\` (already exists)
- Create API key input fields or forms
- Ask users to "enter your API key" or "set ELIZA_API_KEY"
- Create settings/configuration pages for API credentials

## 🎨 UI Rules
- Dark theme: bg-gray-900/950, text-white
- Orange accent: #FF5800 (buttons, highlights)
- Standard Tailwind only (NO border-border, bg-background)
- Mobile-first responsive

${ELIZA_SDK_REFERENCE}
`;

/**
 * Template-specific prompts for full app mode
 */
export const FULL_APP_TEMPLATE_PROMPTS: Record<FullAppTemplateType, string> = {
  chat: `${FULL_APP_BASE_PROMPT}

## 💬 Chat App Template
Build a chat app with:
- Streaming responses (\`client.chatStream()\`)
- Conversation list sidebar
- Message history persistence
- Markdown rendering (install react-markdown)
- Optional image upload to storage

Key flow:
\`\`\`tsx
const { client } = useEliza(); // API key is pre-configured
for await (const chunk of client.chatStream(messages)) {
  // Append to message
}
\`\`\`
`,

  "agent-dashboard": `${FULL_APP_BASE_PROMPT}

## 🤖 Agent Dashboard Template
Build an agent management dashboard with:
- Agent cards grid (\`client.listAgents()\`)
- Agent chat interface (\`client.chatWithAgent()\`)
- Memory management (\`client.saveMemory()\`, \`client.searchMemories()\`)
- Usage/billing overview (\`client.getBalance()\`, \`client.getUsage()\`)

Key flow:
\`\`\`tsx
const { agents } = await client.listAgents();
const { response, roomId } = await client.chatWithAgent(agent.id, message);
\`\`\`
`,

  "landing-page": `${FULL_APP_BASE_PROMPT}

## 🚀 Landing Page Template
Build a marketing page with:
- Hero section (gradient bg, CTA buttons)
- Features grid with icons
- Pricing table (if needed)
- Contact form
- Footer with links

No Eliza API needed for static pages. Add API demo section if showcasing capabilities.
`,

  analytics: `${FULL_APP_BASE_PROMPT}

## 📊 Analytics Dashboard Template
Build an analytics dashboard with:
- KPI cards (\`client.getUsage()\`, \`client.getBalance()\`)
- Charts (install recharts): line, bar, pie
- Date range picker
- Data table with sorting

Key data sources:
\`\`\`tsx
const { usage } = await client.getUsage({ limit: 100 });
const { balance } = await client.getBalance();
\`\`\`
`,

  blank: FULL_APP_BASE_PROMPT,
};

/**
 * Example prompts for each template type
 */
export const FULL_APP_EXAMPLE_PROMPTS: Record<FullAppTemplateType, string[]> = {
  chat: [
    "Add a sidebar with conversation history",
    "Implement message streaming with typing indicator",
    "Add support for image uploads in chat",
    "Create a settings page for chat preferences",
  ],
  "agent-dashboard": [
    "Add a grid of agent cards with status indicators",
    "Create an agent creation form with personality settings",
    "Add analytics charts for agent performance",
    "Implement agent conversation logs viewer",
  ],
  "landing-page": [
    "Create a hero section with gradient background",
    "Add an animated features section",
    "Create a pricing table with 3 tiers",
    "Add a contact form with email integration",
  ],
  analytics: [
    "Add a metrics overview with cards",
    "Create a line chart for usage over time",
    "Add a date range picker for filtering",
    "Create a breakdown table by feature",
  ],
  blank: [
    "Create a modern dashboard layout",
    "Add a navigation sidebar",
    "Create a data table with sorting",
    "Add a dark theme toggle",
  ],
};

/**
 * Additional prompts for monetization and analytics features
 */
export const MONETIZATION_PROMPT = `
## 💳 Monetization
Show credit balance and track usage:
\`\`\`tsx
const { balance } = await client.getBalance();
// Before expensive ops: if (balance < 5) alert('Low credits!');

// Approximate costs:
// Chat: $0.01-0.10 | Image: $0.50-2.00 | Video: $5-20
\`\`\`
`;

export const ANALYTICS_PROMPT = `
## 📈 Analytics
Track usage with the built-in API:
\`\`\`tsx
const { usage } = await client.getUsage({ limit: 50 });
// usage: [{ type: 'chat', cost: 0.02, model: 'gpt-4o', createdAt: '...' }]
\`\`\`
`;

/**
 * Build the complete system prompt for full app mode
 */
export function buildFullAppPrompt(config: {
  templateType?: FullAppTemplateType;
  includeMonetization?: boolean;
  includeAnalytics?: boolean;
  customInstructions?: string;
}): string {
  const templateType = config.templateType || "blank";
  let prompt = FULL_APP_TEMPLATE_PROMPTS[templateType] || FULL_APP_BASE_PROMPT;

  if (config.includeMonetization) {
    prompt += "\n" + MONETIZATION_PROMPT;
  }

  if (config.includeAnalytics) {
    prompt += "\n" + ANALYTICS_PROMPT;
  }

  if (config.customInstructions) {
    prompt += `\n## Additional Instructions\n${config.customInstructions}`;
  }

  return prompt;
}

/**
 * Get example prompts for a template type
 */
export function getExamplePrompts(
  templateType: FullAppTemplateType = "blank",
): string[] {
  return (
    FULL_APP_EXAMPLE_PROMPTS[templateType] || FULL_APP_EXAMPLE_PROMPTS.blank
  );
}
