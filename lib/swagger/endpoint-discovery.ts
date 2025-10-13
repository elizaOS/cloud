/**
 * API Endpoint Discovery System
 *
 * Catalogs available API endpoints from the Eliza Cloud V2 API
 * for automatic documentation and testing in API Explorer
 */

export interface EndpointParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description: string;
  example?: unknown;
  enum?: string[];
  format?: string;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  step?: number;
}

export interface EndpointResponse {
  statusCode: number;
  description: string;
  schema?: Record<string, unknown>;
  example?: Record<string, unknown>;
}

export interface ApiEndpoint {
  id: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  category: string;
  name: string;
  description: string;
  requiresAuth: boolean;
  parameters?: {
    path?: EndpointParameter[];
    query?: EndpointParameter[];
    body?: EndpointParameter[];
    headers?: EndpointParameter[];
  };
  responses: EndpointResponse[];
  tags: string[];
  deprecated?: boolean;
  rateLimit?: {
    requests: number;
    window: string;
  };
}

/**
 * Complete catalog of Eliza Cloud V2 API endpoints
 */
export const API_ENDPOINTS: ApiEndpoint[] = [
  // Image Generation
  {
    id: "generate-image",
    path: "/api/v1/generate-image",
    method: "POST",
    category: "Image Generation",
    name: "Generate Image",
    description: "Generate images from text prompts using AI models (supports API key auth)",
    requiresAuth: true,
    parameters: {
      body: [
        {
          name: "prompt",
          type: "string",
          required: true,
          description: "Text description of the desired image",
          defaultValue: "A beautiful mountain landscape at sunset",
          example: "A futuristic city with flying cars and neon lights",
        },
      ],
    },
    responses: [
      {
        statusCode: 200,
        description: "Image generated successfully",
      },
      {
        statusCode: 400,
        description: "Invalid request parameters",
      },
      {
        statusCode: 401,
        description: "Authentication required",
      },
    ],
    tags: ["ai-generation", "images"],
  },

  // Video Generation
  {
    id: "generate-video",
    path: "/api/v1/generate-video",
    method: "POST",
    category: "Video Generation",
    name: "Generate Video",
    description: "Generate videos from text prompts (supports API key auth)",
    requiresAuth: true,
    parameters: {
      body: [
        {
          name: "prompt",
          type: "string",
          required: true,
          description: "Text description of the desired video",
          defaultValue: "A serene mountain landscape with clouds moving slowly",
          example: "A futuristic city with flying cars at night",
        },
      ],
    },
    responses: [
      {
        statusCode: 200,
        description: "Video generated successfully",
      },
      {
        statusCode: 400,
        description: "Invalid request parameters",
      },
    ],
    tags: ["ai-generation", "videos"],
  },

  // Chat Completions
  {
    id: "chat-completions",
    path: "/api/v1/chat",
    method: "POST",
    category: "AI Completions",
    name: "Chat Completion",
    description: "Generate text completions using Vercel AI SDK format (supports API key auth)",
    requiresAuth: true,
    parameters: {
      body: [
        {
          name: "messages",
          type: "array",
          required: true,
          description: "Array of UIMessage objects (Vercel AI SDK format with role and parts)",
          defaultValue:
            '[{"role":"user","parts":[{"type":"text","text":"Hello, how are you?"}]}]',
          example: '[{"role":"user","parts":[{"type":"text","text":"Explain quantum computing"}]}]',
        },
        {
          name: "id",
          type: "string",
          required: false,
          description: "Model to use for completion",
          defaultValue: "gpt-4o",
          example: "gpt-4o-mini",
        },
      ],
    },
    responses: [
      {
        statusCode: 200,
        description: "Text generated successfully",
      },
    ],
    tags: ["ai-generation", "text"],
  },

  // Character Assistant
  {
    id: "character-assistant",
    path: "/api/v1/character-assistant",
    method: "POST",
    category: "AI Completions",
    name: "Character Assistant",
    description: "AI assistant for creating character definitions (session auth only)",
    requiresAuth: true,
    parameters: {
      body: [
        {
          name: "messages",
          type: "array",
          required: true,
          description: "Conversation messages (Vercel AI SDK UIMessage format)",
          defaultValue:
            '[{"role":"user","parts":[{"type":"text","text":"Help me create a character"}]}]',
          example:
            '[{"role":"user","parts":[{"type":"text","text":"Create a sci-fi character"}]}]',
        },
        {
          name: "characterData",
          type: "object",
          required: false,
          description: "Existing character data to refine",
          defaultValue: "{}",
          example: '{"name": "Agent X"}',
        },
      ],
    },
    responses: [
      {
        statusCode: 200,
        description: "Character assistant response generated",
      },
    ],
    tags: ["ai-generation", "characters"],
  },

  // Generate Prompts
  {
    id: "generate-prompts",
    path: "/api/v1/generate-prompts",
    method: "POST",
    category: "AI Completions",
    name: "Generate Prompts",
    description: "Generate creative prompts for image/video generation (session auth only)",
    requiresAuth: true,
    parameters: {
      body: [
        {
          name: "seed",
          type: "number",
          required: false,
          description: "Seed for prompt generation (optional, auto-generated if not provided)",
          example: 1234567890,
        },
      ],
    },
    responses: [
      {
        statusCode: 200,
        description: "Prompts generated successfully",
      },
    ],
    tags: ["ai-generation", "prompts"],
  },

  // Models
  {
    id: "models-list",
    path: "/api/v1/models",
    method: "GET",
    category: "Models",
    name: "List Models",
    description: "List all available AI models (supports API key auth)",
    requiresAuth: true,
    parameters: {},
    responses: [
      {
        statusCode: 200,
        description: "Models retrieved successfully",
      },
    ],
    tags: ["models"],
  },

  // Gallery
  {
    id: "gallery-list",
    path: "/api/v1/gallery",
    method: "GET",
    category: "Gallery",
    name: "List Generations",
    description: "List all media generations (images and videos) (supports API key auth)",
    requiresAuth: true,
    parameters: {
      query: [
        {
          name: "type",
          type: "string",
          required: false,
          description: "Filter by media type",
          enum: ["image", "video"],
          example: "image",
        },
        {
          name: "limit",
          type: "number",
          required: false,
          description: "Maximum number of results",
          defaultValue: 100,
          example: 50,
        },
        {
          name: "offset",
          type: "number",
          required: false,
          description: "Pagination offset",
          defaultValue: 0,
          example: 0,
        },
      ],
    },
    responses: [
      {
        statusCode: 200,
        description: "Generations retrieved successfully",
      },
    ],
    tags: ["gallery", "media"],
  },

  // User Profile - Get
  {
    id: "user-get",
    path: "/api/v1/user",
    method: "GET",
    category: "User Management",
    name: "Get User Profile",
    description: "Get current user profile and organization details (session auth only - won't work with API key)",
    requiresAuth: true,
    parameters: {},
    responses: [
      {
        statusCode: 200,
        description: "User profile retrieved successfully",
      },
    ],
    tags: ["user"],
  },

  // User Profile - Update
  {
    id: "user-update",
    path: "/api/v1/user",
    method: "PATCH",
    category: "User Management",
    name: "Update User Profile",
    description: "Update user profile information (session auth only - won't work with API key)",
    requiresAuth: true,
    parameters: {
      body: [
        {
          name: "name",
          type: "string",
          required: false,
          description: "User's display name",
          example: "John Doe",
        },
        {
          name: "avatar",
          type: "string",
          required: false,
          description: "Avatar URL",
          example: "https://example.com/avatar.jpg",
        },
      ],
    },
    responses: [
      {
        statusCode: 200,
        description: "Profile updated successfully",
      },
    ],
    tags: ["user"],
  },

  // API Keys - List
  {
    id: "api-keys-list",
    path: "/api/v1/api-keys",
    method: "GET",
    category: "API Keys",
    name: "List API Keys",
    description: "List all API keys for your organization (session auth only - won't work with API key)",
    requiresAuth: true,
    parameters: {},
    responses: [
      {
        statusCode: 200,
        description: "API keys retrieved successfully",
      },
    ],
    tags: ["api-keys"],
  },

  // API Keys - Create
  {
    id: "api-keys-create",
    path: "/api/v1/api-keys",
    method: "POST",
    category: "API Keys",
    name: "Create API Key",
    description: "Create a new API key (session auth only - won't work with API key)",
    requiresAuth: true,
    parameters: {
      body: [
        {
          name: "name",
          type: "string",
          required: true,
          description: "Name for the API key",
          defaultValue: "Test Key",
          example: "Production API Key",
        },
        {
          name: "description",
          type: "string",
          required: false,
          description: "Optional description",
          example: "Used for production services",
        },
        {
          name: "permissions",
          type: "array",
          required: false,
          description: "Array of permissions",
          defaultValue: "[]",
          example: '["read", "write"]',
        },
        {
          name: "rate_limit",
          type: "number",
          required: false,
          description: "Rate limit per minute",
          defaultValue: 1000,
          example: 1000,
        },
      ],
    },
    responses: [
      {
        statusCode: 201,
        description: "API key created successfully",
      },
    ],
    tags: ["api-keys"],
  },

  // API Keys - Delete
  {
    id: "api-keys-delete",
    path: "/api/v1/api-keys/{id}",
    method: "DELETE",
    category: "API Keys",
    name: "Delete API Key",
    description: "Delete an API key (session auth only - won't work with API key)",
    requiresAuth: true,
    parameters: {
      path: [
        {
          name: "id",
          type: "string",
          required: true,
          description: "API key ID",
          example: "key_123abc",
        },
      ],
    },
    responses: [
      {
        statusCode: 200,
        description: "API key deleted successfully",
      },
    ],
    tags: ["api-keys"],
  },

  // API Keys - Update
  {
    id: "api-keys-update",
    path: "/api/v1/api-keys/{id}",
    method: "PATCH",
    category: "API Keys",
    name: "Update API Key",
    description: "Update API key properties (session auth only - won't work with API key)",
    requiresAuth: true,
    parameters: {
      path: [
        {
          name: "id",
          type: "string",
          required: true,
          description: "API key ID",
          example: "key_123abc",
        },
      ],
      body: [
        {
          name: "name",
          type: "string",
          required: false,
          description: "New name for the API key",
          example: "Updated Key Name",
        },
        {
          name: "is_active",
          type: "boolean",
          required: false,
          description: "Enable or disable the key",
          example: true,
        },
      ],
    },
    responses: [
      {
        statusCode: 200,
        description: "API key updated successfully",
      },
    ],
    tags: ["api-keys"],
  },

  // API Keys - Regenerate
  {
    id: "api-keys-regenerate",
    path: "/api/v1/api-keys/{id}/regenerate",
    method: "POST",
    category: "API Keys",
    name: "Regenerate API Key",
    description: "Regenerate API key secret (old key becomes invalid) (session auth only - won't work with API key)",
    requiresAuth: true,
    parameters: {
      path: [
        {
          name: "id",
          type: "string",
          required: true,
          description: "API key ID",
          example: "key_123abc",
        },
      ],
    },
    responses: [
      {
        statusCode: 200,
        description: "API key regenerated successfully",
      },
    ],
    tags: ["api-keys"],
  },
];

/**
 * Get endpoints by category
 */
export function getEndpointsByCategory(category: string): ApiEndpoint[] {
  return API_ENDPOINTS.filter((endpoint) => endpoint.category === category);
}

/**
 * Get all available categories
 */
export function getAvailableCategories(): string[] {
  const categories = API_ENDPOINTS.map((endpoint) => endpoint.category);
  return [...new Set(categories)].sort();
}

/**
 * Search endpoints by name, description, or path
 */
export function searchEndpoints(query: string): ApiEndpoint[] {
  const searchTerm = query.toLowerCase();
  return API_ENDPOINTS.filter(
    (endpoint) =>
      endpoint.name.toLowerCase().includes(searchTerm) ||
      endpoint.description.toLowerCase().includes(searchTerm) ||
      endpoint.path.toLowerCase().includes(searchTerm),
  );
}
