/**
 * ERC-8004 Marketplace Types
 *
 * Types and constants for ERC-8004 agent/MCP marketplace discovery.
 * Enables agents to search, filter, and discover other agents and services.
 */

// ============================================================================
// Service Types
// ============================================================================

/** Types of services discoverable via ERC-8004 */
export type ERC8004ServiceType = "agent" | "mcp" | "app";

/** Protocol support */
export type ERC8004Protocol = "a2a" | "mcp" | "openapi" | "x402";

/** Payment methods */
export type ERC8004PaymentMethod = "free" | "credits" | "x402";

/** Trust mechanisms */
export type ERC8004TrustType = "reputation" | "crypto-economic" | "tee-attestation";

// ============================================================================
// Standardized Tags for Discovery
// ============================================================================

/**
 * OASF-aligned skill categories for agents
 * @see https://github.com/agent0-labs/oasf
 */
export const AGENT_SKILL_TAGS = [
  // Natural Language Processing
  "nlp/text-generation",
  "nlp/summarization",
  "nlp/translation",
  "nlp/sentiment-analysis",
  "nlp/entity-extraction",
  "nlp/question-answering",
  
  // Software Engineering
  "dev/code-generation",
  "dev/code-review",
  "dev/debugging",
  "dev/documentation",
  "dev/testing",
  "dev/refactoring",
  
  // Advanced Reasoning
  "reasoning/logical",
  "reasoning/mathematical",
  "reasoning/planning",
  "reasoning/decision-making",
  
  // Creative
  "creative/writing",
  "creative/storytelling",
  "creative/brainstorming",
  "creative/design",
  
  // Data & Analytics
  "data/analysis",
  "data/visualization",
  "data/extraction",
  "data/transformation",
  
  // Research
  "research/web-search",
  "research/fact-checking",
  "research/literature-review",
  "research/citation",
  
  // Communication
  "comm/email",
  "comm/chat",
  "comm/social-media",
  "comm/customer-support",
  
  // Productivity
  "productivity/scheduling",
  "productivity/task-management",
  "productivity/note-taking",
  "productivity/automation",
] as const;

export type AgentSkillTag = (typeof AGENT_SKILL_TAGS)[number];

/**
 * Domain categories for agents
 */
export const AGENT_DOMAIN_TAGS = [
  // Technology
  "domain/ai",
  "domain/blockchain",
  "domain/cybersecurity",
  "domain/devops",
  "domain/web3",
  "domain/saas",
  
  // Business
  "domain/finance",
  "domain/marketing",
  "domain/sales",
  "domain/hr",
  "domain/legal",
  "domain/consulting",
  
  // Creative
  "domain/gaming",
  "domain/entertainment",
  "domain/media",
  "domain/art",
  "domain/music",
  
  // Education
  "domain/learning",
  "domain/tutoring",
  "domain/training",
  "domain/certification",
  
  // Healthcare
  "domain/health",
  "domain/wellness",
  "domain/fitness",
  
  // Science
  "domain/research",
  "domain/engineering",
  "domain/biology",
  "domain/physics",
] as const;

export type AgentDomainTag = (typeof AGENT_DOMAIN_TAGS)[number];

/**
 * MCP tool categories
 */
export const MCP_CATEGORY_TAGS = [
  "mcp/utilities",
  "mcp/ai",
  "mcp/productivity",
  "mcp/finance",
  "mcp/social",
  "mcp/gaming",
  "mcp/creative",
  "mcp/data",
  "mcp/automation",
  "mcp/communication",
  "mcp/storage",
  "mcp/search",
  "mcp/analytics",
  "mcp/security",
  "mcp/devtools",
] as const;

export type MCPCategoryTag = (typeof MCP_CATEGORY_TAGS)[number];

/**
 * Capability tags for filtering
 */
export const CAPABILITY_TAGS = [
  "cap/streaming",
  "cap/batch",
  "cap/realtime",
  "cap/async",
  "cap/webhook",
  "cap/multimodal",
  "cap/voice",
  "cap/image",
  "cap/video",
  "cap/file-upload",
  "cap/file-download",
] as const;

export type CapabilityTag = (typeof CAPABILITY_TAGS)[number];

/**
 * All available tags combined
 */
export const ALL_DISCOVERY_TAGS = [
  ...AGENT_SKILL_TAGS,
  ...AGENT_DOMAIN_TAGS,
  ...MCP_CATEGORY_TAGS,
  ...CAPABILITY_TAGS,
] as const;

export type DiscoveryTag = (typeof ALL_DISCOVERY_TAGS)[number];

// ============================================================================
// Discovery Filter Types
// ============================================================================

export interface ERC8004DiscoveryFilters {
  /** Free text search */
  query?: string;
  /** Service types to include */
  types?: ERC8004ServiceType[];
  /** Required protocols */
  protocols?: ERC8004Protocol[];
  /** Required tags (AND logic) */
  tags?: string[];
  /** Any of these tags (OR logic) */
  anyTags?: string[];
  /** Payment methods accepted */
  paymentMethods?: ERC8004PaymentMethod[];
  /** Only x402 enabled */
  x402Only?: boolean;
  /** Only actively online */
  activeOnly?: boolean;
  /** Only ERC-8004 registered */
  registeredOnly?: boolean;
  /** Filter by ecosystem */
  ecosystem?: "jeju" | "base";
  /** Category filter */
  category?: string;
  /** Minimum reputation score (0-100) */
  minReputation?: number;
  /** Has specific MCP tools */
  mcpTools?: string[];
  /** Has specific A2A skills */
  a2aSkills?: string[];
}

export interface ERC8004SortOptions {
  sortBy: "relevance" | "popularity" | "recent" | "reputation" | "name";
  order: "asc" | "desc";
}

export interface ERC8004PaginationOptions {
  page: number;
  limit: number;
}

// ============================================================================
// Discovery Result Types
// ============================================================================

export interface ERC8004MarketplaceItem {
  /** Unique identifier */
  id: string;
  /** Service type */
  type: ERC8004ServiceType;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Avatar/icon URL */
  image?: string;
  /** Creator identifier */
  creatorId: string;
  /** Organization identifier */
  organizationId: string;
  
  /** ERC-8004 registration info */
  erc8004: {
    registered: boolean;
    network?: string;
    agentId?: string;
    agentUri?: string;
    registeredAt?: string;
  };
  
  /** Protocol endpoints */
  endpoints: {
    a2a?: string;
    mcp?: string;
    openapi?: string;
  };
  
  /** Tags for discovery */
  tags: string[];
  /** Category */
  category?: string;
  
  /** Capabilities */
  capabilities: {
    streaming: boolean;
    x402: boolean;
    multimodal: boolean;
    voice: boolean;
  };
  
  /** Pricing info */
  pricing: {
    type: ERC8004PaymentMethod;
    creditsPerRequest?: number;
    x402PriceUsd?: number;
    inferenceMarkup?: number;
  };
  
  /** Stats */
  stats: {
    popularity: number;
    viewCount: number;
    interactionCount: number;
    totalRequests: number;
  };
  
  /** Status */
  status: {
    active: boolean;
    online: boolean;
    verified: boolean;
    featured: boolean;
  };
  
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

export interface ERC8004DiscoveryResult {
  items: ERC8004MarketplaceItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  filters: {
    applied: ERC8004DiscoveryFilters;
    availableTags: TagGroup[];
    availableCategories: CategoryCount[];
  };
  /** Result source */
  source: "local" | "registry" | "hybrid";
}

export interface TagGroup {
  group: string;
  tags: TagCount[];
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

// ============================================================================
// Tag Metadata for UI/Discovery
// ============================================================================

export interface TagMetadata {
  id: string;
  label: string;
  description: string;
  group: "skill" | "domain" | "mcp" | "capability";
  icon?: string;
}

export const TAG_METADATA: Record<string, TagMetadata> = {
  // Skills
  "nlp/text-generation": {
    id: "nlp/text-generation",
    label: "Text Generation",
    description: "Generate text content, articles, copy",
    group: "skill",
  },
  "nlp/summarization": {
    id: "nlp/summarization",
    label: "Summarization",
    description: "Summarize documents and content",
    group: "skill",
  },
  "dev/code-generation": {
    id: "dev/code-generation",
    label: "Code Generation",
    description: "Generate code in various languages",
    group: "skill",
  },
  "dev/debugging": {
    id: "dev/debugging",
    label: "Debugging",
    description: "Find and fix bugs in code",
    group: "skill",
  },
  "reasoning/planning": {
    id: "reasoning/planning",
    label: "Planning",
    description: "Plan and organize tasks",
    group: "skill",
  },
  "creative/writing": {
    id: "creative/writing",
    label: "Creative Writing",
    description: "Fiction, poetry, creative content",
    group: "skill",
  },
  "research/web-search": {
    id: "research/web-search",
    label: "Web Search",
    description: "Search and retrieve web information",
    group: "skill",
  },
  
  // Domains
  "domain/ai": {
    id: "domain/ai",
    label: "AI & ML",
    description: "Artificial intelligence and machine learning",
    group: "domain",
  },
  "domain/blockchain": {
    id: "domain/blockchain",
    label: "Blockchain",
    description: "Crypto, Web3, DeFi",
    group: "domain",
  },
  "domain/finance": {
    id: "domain/finance",
    label: "Finance",
    description: "Financial services and analysis",
    group: "domain",
  },
  "domain/gaming": {
    id: "domain/gaming",
    label: "Gaming",
    description: "Games and interactive entertainment",
    group: "domain",
  },
  
  // MCP Categories
  "mcp/utilities": {
    id: "mcp/utilities",
    label: "Utilities",
    description: "General utility tools",
    group: "mcp",
  },
  "mcp/ai": {
    id: "mcp/ai",
    label: "AI Tools",
    description: "AI-powered tools and services",
    group: "mcp",
  },
  "mcp/storage": {
    id: "mcp/storage",
    label: "Storage",
    description: "File and data storage",
    group: "mcp",
  },
  "mcp/automation": {
    id: "mcp/automation",
    label: "Automation",
    description: "Workflow automation tools",
    group: "mcp",
  },
  
  // Capabilities
  "cap/streaming": {
    id: "cap/streaming",
    label: "Streaming",
    description: "Supports streaming responses",
    group: "capability",
  },
  "cap/multimodal": {
    id: "cap/multimodal",
    label: "Multimodal",
    description: "Handles text, image, audio",
    group: "capability",
  },
  "cap/voice": {
    id: "cap/voice",
    label: "Voice",
    description: "Voice/speech capabilities",
    group: "capability",
  },
};

/**
 * Get tag metadata with fallback
 */
export function getTagMetadata(tag: string): TagMetadata {
  return TAG_METADATA[tag] || {
    id: tag,
    label: tag.split("/").pop() || tag,
    description: tag,
    group: tag.startsWith("mcp/") ? "mcp" : 
           tag.startsWith("cap/") ? "capability" :
           tag.startsWith("domain/") ? "domain" : "skill",
  };
}

/**
 * Group tags by category
 */
export function groupTags(tags: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {
    skill: [],
    domain: [],
    mcp: [],
    capability: [],
    other: [],
  };
  
  for (const tag of tags) {
    const meta = getTagMetadata(tag);
    const group = groups[meta.group] || groups.other;
    group.push(tag);
  }
  
  return groups;
}
