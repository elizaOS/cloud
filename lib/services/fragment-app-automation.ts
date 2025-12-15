/**
 * Fragment App Automation Service
 *
 * Automates app creation from fragments by:
 * 1. Analyzing fragment code for storage/API needs
 * 2. Auto-creating storage collections
 * 3. Injecting app API helpers
 * 4. Auto-generating deployment URLs
 * 5. One-click deployment
 */

import type { FragmentSchema } from "@/lib/fragments/schema";
import { appsService } from "./apps";
import { appStorageService } from "./app-storage";
import { logger } from "@/lib/utils/logger";
import type {
  CollectionSchema,
  CollectionIndex,
} from "@/db/schemas/app-storage";

interface StorageCollection {
  name: string;
  description?: string;
  schema: CollectionSchema;
  indexes?: CollectionIndex[];
}

interface APIDependency {
  type: "storage" | "agents" | "billing" | "n8n" | "chat";
  collections?: string[]; // For storage type
}

interface DeploymentResult {
  app: {
    id: string;
    name: string;
    slug: string;
    app_url: string;
  };
  apiKey: string;
  collections: StorageCollection[];
  injectedCode: string;
  proxyRouteCode: string; // Auto-generated proxy route handler
  deploymentUrl: string;
}

/**
 * Analyzes fragment code to detect storage needs
 */
export class FragmentAnalyzer {
  analyzeStorageNeeds(fragment: FragmentSchema): StorageCollection[] {
    const collections: StorageCollection[] = [];
    const code = fragment.code.toLowerCase();

    // Detect common storage patterns
    const storagePatterns = [
      {
        pattern: /localstorage|localstorage\.(get|set|remove)/i,
        name: "localStorage",
      },
      {
        pattern: /database|db\.(query|insert|update|delete)/i,
        name: "database",
      },
      { pattern: /collection|documents|items|records/i, name: "items" },
      { pattern: /users|profiles|accounts/i, name: "users" },
      { pattern: /todos|tasks|notes/i, name: "todos" },
      { pattern: /posts|articles|content/i, name: "posts" },
    ];

    for (const { pattern, name } of storagePatterns) {
      if (pattern.test(code)) {
        // Infer basic schema from code patterns
        const schema = this.inferSchema(code, name);
        if (schema) {
          collections.push({
            name: name.toLowerCase(),
            description: `Auto-generated collection for ${name}`,
            schema,
            indexes: this.inferIndexes(code, name),
          });
        }
      }
    }

    return collections;
  }

  analyzeAPIDependencies(fragment: FragmentSchema): APIDependency[] {
    const dependencies: APIDependency[] = [];
    const code = fragment.code.toLowerCase();

    // Detect API usage patterns
    if (/storage|collection|document/i.test(code)) {
      dependencies.push({ type: "storage" });
    }
    if (/agent|chat|ai|llm|gpt|claude/i.test(code)) {
      dependencies.push({ type: "agents" });
    }
    if (/billing|credits|pricing|payment/i.test(code)) {
      dependencies.push({ type: "billing" });
    }
    if (/workflow|n8n|automation/i.test(code)) {
      dependencies.push({ type: "n8n" });
    }

    return dependencies;
  }

  private inferSchema(
    code: string,
    collectionName: string,
  ): CollectionSchema | null {
    // Basic schema inference - can be enhanced with AI
    const properties: Record<string, any> = {
      id: { type: "string", description: "Document ID" },
      createdAt: {
        type: "string",
        format: "date-time",
        description: "Creation timestamp",
      },
      updatedAt: {
        type: "string",
        format: "date-time",
        description: "Update timestamp",
      },
    };

    // Try to infer fields from code
    if (collectionName === "users" || collectionName === "profiles") {
      properties.name = { type: "string", required: true };
      properties.email = { type: "string", format: "email" };
    } else if (collectionName === "todos" || collectionName === "tasks") {
      properties.title = { type: "string", required: true };
      properties.completed = { type: "boolean", default: false };
    } else if (collectionName === "posts" || collectionName === "articles") {
      properties.title = { type: "string", required: true };
      properties.content = { type: "string" };
      properties.published = { type: "boolean", default: false };
    }

    return {
      type: "object",
      properties,
      required: Object.keys(properties).filter((k) => properties[k].required),
      additionalProperties: true,
    };
  }

  private inferIndexes(
    code: string,
    collectionName: string,
  ): CollectionIndex[] {
    const indexes: CollectionIndex[] = [];

    // Common indexed fields
    if (collectionName === "users" || collectionName === "profiles") {
      indexes.push({ field: "email", type: "string", unique: true });
    }
    if (collectionName === "todos" || collectionName === "tasks") {
      indexes.push({ field: "completed", type: "boolean" });
    }
    if (collectionName === "posts" || collectionName === "articles") {
      indexes.push({ field: "published", type: "boolean" });
    }

    return indexes;
  }
}

/**
 * Injects app helpers into fragment code
 */
export class CodeInjector {
  injectAppHelpers(
    code: string,
    appId: string,
    apiKey: string,
    dependencies: APIDependency[],
  ): string {
    const imports: string[] = [];
    const helpers: string[] = [];

    // Inject storage helpers if needed
    if (dependencies.some((d) => d.type === "storage")) {
      imports.push(
        `import { createCollection, insertDocument, queryDocuments, updateDocument, deleteDocument } from '@/lib/storage';`,
      );
      helpers.push(`
// App Storage Helpers
// Collections are automatically created - use them directly:
// const doc = await insertDocument('collectionName', { ... });
// const { documents } = await queryDocuments('collectionName', { filter: { ... } });
`);
    }

    // Inject API helpers if needed
    if (dependencies.some((d) => d.type === "agents" || d.type === "chat")) {
      imports.push(
        `import { listAgents, getAgent, createAgent, updateAgent, deleteAgent, listChats, createChat, getChat, sendMessage } from '@/lib/cloud-api';`,
      );
      helpers.push(`
// App API Helpers
// Access agents, chat, and other APIs:
// const { agents } = await listAgents();
// const agent = await getAgent(agentId);
// const { chats } = await listChats(agentId);
// await sendMessage(roomId, text, callbacks);
`);
    }

    // Inject billing helpers if needed
    if (dependencies.some((d) => d.type === "billing")) {
      imports.push(
        `import { getBilling, getCreditPacks, createCheckoutSession } from '@/lib/cloud-api';`,
      );
      helpers.push(`
// App Billing Helpers
// Access billing and credits:
// const { billing, usage } = await getBilling();
// const packs = await getCreditPacks();
`);
    }

    // Inject auth helpers
    imports.push(`import { useAuth } from '@/lib/use-auth';`);
    helpers.push(`
// App Auth
// Use useAuth() hook to get current user:
// const { user, isAuthenticated, login, logout } = useAuth();
`);

    // Inject environment variables
    const envVars = `
// App Environment Variables (auto-injected)
const ELIZA_CLOUD_API_KEY = process.env.ELIZA_CLOUD_API_KEY || '${apiKey}';
const ELIZA_APP_ID = process.env.ELIZA_APP_ID || '${appId}';
const ELIZA_CLOUD_URL = process.env.NEXT_PUBLIC_ELIZA_CLOUD_URL || '${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}';
`;

    // Combine everything
    const injectedCode = `
${imports.join("\n")}
${envVars}
${helpers.join("\n")}

${code}
`;

    return injectedCode;
  }

  /**
   * Generate proxy route handler code
   */
  generateProxyRoute(): string {
    return `/**
 * App Proxy Layer
 * Auto-generated proxy route handler for Eliza Cloud API
 */

import { NextRequest, NextResponse } from "next/server";

const ELIZA_CLOUD_URL = process.env.NEXT_PUBLIC_ELIZA_CLOUD_URL || "http://localhost:3000";
const ELIZA_CLOUD_API_KEY = process.env.ELIZA_CLOUD_API_KEY;
const ELIZA_APP_ID = process.env.ELIZA_APP_ID;

async function forwardRequest(
  request: NextRequest,
  path: string[],
  method: string
): Promise<Response> {
  let targetPath: string;

  if (path[0] === "stream" && path[1]) {
    targetPath = \`/api/eliza/rooms/\${path[1]}/messages/stream\`;
  } else if (path[0] === "n8n") {
    targetPath = \`/api/v1/app/n8n/\${path.slice(1).join("/")}\`;
  } else if (path[0] === "storage") {
    targetPath = \`/api/v1/app/storage/\${path.slice(1).join("/")}\`;
  } else {
    targetPath = \`/api/v1/app/\${path.join("/")}\`;
  }

  const targetUrl = new URL(targetPath, ELIZA_CLOUD_URL);
  const url = new URL(request.url);
  url.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const headers = new Headers();
  const headersToForward = [
    "content-type", "accept", "origin", "referer", "user-agent",
    "x-payment", "x-payment-response",
  ];

  for (const header of headersToForward) {
    const value = request.headers.get(header);
    if (value) headers.set(header, value);
  }

  if (ELIZA_CLOUD_API_KEY) {
    headers.set("X-Api-Key", ELIZA_CLOUD_API_KEY);
  }
  if (ELIZA_APP_ID) {
    headers.set("X-App-Id", ELIZA_APP_ID);
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    if (token.startsWith("eliza_")) {
      headers.set("Authorization", \`Bearer \${token}\`);
    } else if (token.startsWith("app_")) {
      headers.set("X-App-Token", token);
    } else {
      headers.set("Authorization", authHeader);
    }
  }

  const appToken = request.headers.get("x-app-token");
  if (appToken) {
    headers.set("X-App-Token", appToken);
  }

  let body: string | null = null;
  if (method !== "GET" && method !== "HEAD") {
    body = await request.text();
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      method,
      headers,
      body,
    });

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/event-stream")) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (contentType.includes("application/json")) {
      const data = await response.json();
      return NextResponse.json(data, {
        status: response.status,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Token",
        },
      });
    }

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Token",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to connect to Eliza Cloud",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Token, X-Payment, X-Payment-Response",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return forwardRequest(request, path, "GET");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return forwardRequest(request, path, "POST");
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return forwardRequest(request, path, "PUT");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return forwardRequest(request, path, "PATCH");
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return forwardRequest(request, path, "DELETE");
}
`;
  }
}

/**
 * Auto-deployment service for fragments
 */
export class FragmentAppAutomation {
  private analyzer = new FragmentAnalyzer();
  private injector = new CodeInjector();

  /**
   * Deploy fragment as app with full automation
   */
  async deployFragment(
    fragment: FragmentSchema,
    options: {
      organizationId: string;
      userId: string;
      projectName: string;
      projectDescription?: string;
      autoDeploy?: boolean; // Auto-deploy to hosting
      appUrl?: string; // Optional, auto-generated if not provided
    },
  ): Promise<DeploymentResult> {
    // 1. Analyze fragment
    const storageNeeds = this.analyzer.analyzeStorageNeeds(fragment);
    const apiDependencies = this.analyzer.analyzeAPIDependencies(fragment);

    logger.info("[Fragment App Automation] Analyzing fragment", {
      storageCollections: storageNeeds.length,
      apiDependencies: apiDependencies.length,
    });

    // 2. Generate deployment URL if not provided
    const deploymentUrl =
      options.appUrl ||
      this.generateDeploymentUrl(fragment, options.projectName);

    // 3. Create app + API key
    const { app, apiKey } = await appsService.create({
      name: options.projectName,
      description:
        options.projectDescription ||
        `Auto-deployed from fragment: ${fragment.title}`,
      organization_id: options.organizationId,
      created_by_user_id: options.userId,
      app_url: deploymentUrl,
      allowed_origins: [deploymentUrl],
      metadata: {
        source: "fragment",
        template: fragment.template,
        autoDeployed: true,
        storageCollections: storageNeeds.map((c) => c.name),
        apiDependencies: apiDependencies.map((d) => d.type),
      },
    });

    logger.info("[Fragment App Automation] Created app", {
      appId: app.id,
      appUrl: app.app_url,
    });

    // 4. Create storage collections
    const createdCollections: StorageCollection[] = [];
    for (const collection of storageNeeds) {
      try {
        await appStorageService.createCollection({
          appId: app.id,
          name: collection.name,
          description: collection.description,
          schema: collection.schema,
          indexes: collection.indexes || [],
        });
        createdCollections.push(collection);
        logger.info("[Fragment App Automation] Created collection", {
          appId: app.id,
          collectionName: collection.name,
        });
      } catch (error) {
        logger.error("[Fragment App Automation] Failed to create collection", {
          appId: app.id,
          collectionName: collection.name,
          error,
        });
        // Continue with other collections
      }
    }

    // 5. Inject app helpers into code
    const injectedCode = this.injector.injectAppHelpers(
      fragment.code,
      app.id,
      apiKey,
      apiDependencies,
    );

    // 6. Generate proxy route handler
    const proxyRouteCode = this.injector.generateProxyRoute();

    return {
      app: {
        id: app.id,
        name: app.name,
        slug: app.slug,
        app_url: app.app_url,
      },
      apiKey,
      collections: createdCollections,
      injectedCode,
      proxyRouteCode,
      deploymentUrl: app.app_url,
    };
  }

  private generateDeploymentUrl(
    fragment: FragmentSchema,
    projectName: string,
  ): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // For now, use fragment preview URL
    // In future, could auto-deploy to Vercel/Netlify
    const slug = projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 50);

    return `${baseUrl}/fragments/preview/${slug}`;
  }
}

export const fragmentAppAutomation = new FragmentAppAutomation();
