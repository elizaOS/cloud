import { Templates, templatesToPrompt } from "./templates";
import { buildApiContext } from "./api-context";

/**
 * Build system prompt for fragment generation
 * Includes template information and API documentation
 */
export async function buildFragmentPrompt(
  template: Templates,
  includeApiContext = true
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
    categories: ["AI Completions", "Image Generation", "Video Generation", "Containers"],
    tags: ["ai-generation", "code-generation", "containers"],
    limit: 30,
    includeExamples: true,
  });

  return `${basePrompt}

## Available Eliza Cloud APIs

When generating code that needs to interact with Eliza Cloud services, you can use these APIs:

${apiContext}

## Miniapp Storage & APIs (When Deployed as Miniapp)

When fragments are deployed as miniapps, they automatically get access to:

### Storage API
- **Collections**: Schema-validated document stores
- **Documents**: JSONB storage with indexed fields
- **API**: \`/api/v1/miniapp/storage/:collection\`
- **Client Helpers**: \`insertDocument\`, \`queryDocuments\`, \`updateDocument\`, \`deleteDocument\`
- Collections are automatically created based on code analysis

### Miniapp APIs
- **User Info**: \`/api/v1/miniapp/user\`
- **Agents**: \`/api/v1/miniapp/agents\`
- **Billing**: \`/api/v1/miniapp/billing\`
- **Storage**: \`/api/v1/miniapp/storage\`
- **Proxy Layer**: \`/api/proxy/*\` routes to cloud APIs

### Auto-Injected Helpers
When deployed as miniapp, the following helpers are automatically injected:
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
- When deployed as miniapp, storage collections are created automatically
- Use storage helpers instead of localStorage for persistent data
`;
}

