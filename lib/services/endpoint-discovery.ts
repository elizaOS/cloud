/**
 * Endpoint Discovery Service
 *
 * Discovers and catalogs all A2A, MCP, and REST endpoints available in the marketplace
 * for use in n8n workflow node generation.
 */

import { AVAILABLE_SKILLS } from "@/lib/api/a2a/handlers";
import { agent0Service } from "@/lib/services/agent0";
import { userMcpsService } from "@/lib/services/user-mcps";
import { characterMarketplaceService } from "@/lib/services/characters/marketplace";
import { getDefaultNetwork, CHAIN_IDS } from "@/lib/config/erc8004";
import { logger } from "@/lib/utils/logger";
import type { DiscoveredService } from "@/lib/types/erc8004";

export interface EndpointNode {
  id: string;
  name: string;
  description: string;
  type: "a2a" | "mcp" | "rest";
  category: string;
  endpoint: string;
  method?: string; // For REST endpoints
  parameters?: Record<string, {
    type: string;
    description?: string;
    required?: boolean;
    default?: unknown;
  }>;
  returns?: {
    type: string;
    description?: string;
  };
  authentication?: {
    type: "api_key" | "bearer" | "x402" | "none";
    description?: string;
  };
  cost?: string;
  x402Enabled?: boolean;
  source: "local" | "erc8004" | "builtin";
  metadata?: Record<string, unknown>;
}

export interface NodeSearchResult {
  nodes: EndpointNode[];
  total: number;
  categories: string[];
}

class EndpointDiscoveryService {
  /**
   * Discovers all A2A skills from local and marketplace sources.
   */
  async discoverA2ASkills(): Promise<EndpointNode[]> {
    const nodes: EndpointNode[] = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

    // Local A2A skills (from AVAILABLE_SKILLS)
    for (const skill of AVAILABLE_SKILLS) {
      nodes.push({
        id: `a2a_local_${skill.id}`,
        name: `A2A: ${skill.id}`,
        description: skill.description || `A2A skill: ${skill.id}`,
        type: "a2a",
        category: this.categorizeSkill(skill.id),
        endpoint: `${baseUrl}/api/a2a`,
        method: "POST",
        authentication: {
          type: "api_key",
          description: "Requires API key or session authentication",
        },
        source: "builtin",
        metadata: {
          skillId: skill.id,
        },
      });
    }

    // Also discover tools from the main MCP handler (which includes many A2A-like capabilities)
    // These are exposed via MCP but can also be used as A2A endpoints
    try {
      // The main MCP endpoint at /api/mcp has many tools that can be called
      // We'll add them as discoverable endpoints
      // Note: This is a simplified approach - in production you might want to introspect the MCP handler
      const mainMcpTools = [
        "check_credits", "get_recent_usage", "generate_text", "generate_image", 
        "generate_video", "save_memory", "retrieve_memories", "delete_memory",
        "create_conversation", "get_conversation_context", "list_containers",
        "storage_upload", "storage_list", "storage_stats", "storage_cost",
        "storage_pin", "n8n_create_workflow", "n8n_list_workflows", "n8n_generate_workflow",
        "n8n_get_workflow", "n8n_update_workflow", "n8n_list_workflow_versions",
        "n8n_revert_workflow", "n8n_test_workflow", "n8n_discover_nodes",
        "n8n_generate_node", "n8n_generate_workflow_from_endpoints",
      ];

      for (const toolName of mainMcpTools) {
        nodes.push({
          id: `mcp_main_${toolName}`,
          name: `MCP: ${toolName}`,
          description: `Call ${toolName} via main MCP server`,
          type: "mcp",
          category: this.categorizeTool(toolName),
          endpoint: `${baseUrl}/api/mcp`,
          method: "POST",
          authentication: {
            type: "api_key",
            description: "Requires API key authentication",
          },
          source: "builtin",
          metadata: {
            mcpName: "ElizaOS Cloud MCP",
            toolName,
          },
        });
      }
    } catch (error) {
      logger.error("[EndpointDiscovery] Error discovering main MCP tools:", error);
    }

    // Marketplace A2A endpoints (from ERC-8004)
    try {
      const network = getDefaultNetwork();
      const agents = await agent0Service.searchAgentsCached({
        active: true,
      });

      for (const agent of agents) {
        if (agent.a2aEndpoint && agent.a2aSkills && agent.a2aSkills.length > 0) {
          for (const skill of agent.a2aSkills) {
            nodes.push({
              id: `a2a_${agent.agentId}_${skill}`,
              name: `A2A: ${agent.name} - ${skill}`,
              description: `${skill} via ${agent.name}`,
              type: "a2a",
              category: this.categorizeSkill(skill),
              endpoint: agent.a2aEndpoint,
              method: "POST",
              authentication: {
                type: agent.x402Support ? "x402" : "api_key",
                description: agent.x402Support ? "x402 payment enabled" : "API key required",
              },
              x402Enabled: agent.x402Support,
              source: "erc8004",
              metadata: {
                agentId: agent.agentId,
                skillId: skill,
                agentName: agent.name,
                network,
              },
            });
          }
        }
      }
    } catch (error) {
      logger.error("[EndpointDiscovery] Error discovering A2A skills:", error);
    }

    return nodes;
  }

  /**
   * Discovers all MCP tools from local and marketplace sources.
   */
  async discoverMCPTools(): Promise<EndpointNode[]> {
    const nodes: EndpointNode[] = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

    // Local MCP tools - extract individual tools from each MCP
    try {
      const localMcps = await userMcpsService.listPublic({ limit: 100 });
      for (const mcp of localMcps) {
        const endpoint = userMcpsService.getEndpointUrl(mcp, baseUrl);
        
        // Extract tools from MCP definition
        if (mcp.tools && Array.isArray(mcp.tools) && mcp.tools.length > 0) {
          // Create a node for each tool
          for (const tool of mcp.tools) {
            nodes.push({
              id: `mcp_local_${mcp.id}_${tool.name}`,
              name: `MCP: ${mcp.name} - ${tool.name}`,
              description: tool.description || `${tool.name} via ${mcp.name}`,
              type: "mcp",
              category: mcp.category || "utilities",
              endpoint,
              method: "POST",
              authentication: {
                type: mcp.x402_enabled ? "x402" : "api_key",
                description: mcp.x402_enabled ? "x402 payment enabled" : "API key required",
              },
              x402Enabled: mcp.x402_enabled,
              source: "local",
              metadata: {
                mcpId: mcp.id,
                mcpName: mcp.name,
                toolName: tool.name,
                toolDescription: tool.description,
                inputSchema: tool.inputSchema,
              },
            });
          }
        } else {
          // Fallback: Create generic MCP node if no tools defined
          nodes.push({
            id: `mcp_local_${mcp.id}`,
            name: `MCP: ${mcp.name}`,
            description: mcp.description || `MCP server: ${mcp.name}`,
            type: "mcp",
            category: mcp.category || "utilities",
            endpoint,
            method: "POST",
            authentication: {
              type: mcp.x402_enabled ? "x402" : "api_key",
              description: mcp.x402_enabled ? "x402 payment enabled" : "API key required",
            },
            x402Enabled: mcp.x402_enabled,
            source: "local",
            metadata: {
              mcpId: mcp.id,
              mcpName: mcp.name,
            },
          });
        }
      }
    } catch (error) {
      logger.error("[EndpointDiscovery] Error discovering local MCPs:", error);
    }

    // Marketplace MCP endpoints (from ERC-8004)
    try {
      const network = getDefaultNetwork();
      const agents = await agent0Service.searchAgentsCached({
        active: true,
      });

      for (const agent of agents) {
        if (agent.mcpEndpoint && agent.mcpTools && agent.mcpTools.length > 0) {
          for (const tool of agent.mcpTools) {
            nodes.push({
              id: `mcp_${agent.agentId}_${tool}`,
              name: `MCP: ${agent.name} - ${tool}`,
              description: `${tool} via ${agent.name}`,
              type: "mcp",
              category: this.categorizeTool(tool),
              endpoint: agent.mcpEndpoint,
              method: "POST",
              authentication: {
                type: agent.x402Support ? "x402" : "api_key",
                description: agent.x402Support ? "x402 payment enabled" : "API key required",
              },
              x402Enabled: agent.x402Support,
              source: "erc8004",
              metadata: {
                agentId: agent.agentId,
                toolName: tool,
                agentName: agent.name,
                network,
              },
            });
          }
        }
      }
    } catch (error) {
      logger.error("[EndpointDiscovery] Error discovering MCP tools:", error);
    }

    return nodes;
  }

  /**
   * Discovers all REST API endpoints by scanning route files.
   */
  async discoverRESTEndpoints(): Promise<EndpointNode[]> {
    const nodes: EndpointNode[] = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

    try {
      // Dynamically discover all API routes
      const { readdir, readFile, stat } = await import("fs/promises");
      const { join } = await import("path");
      const apiDir = join(process.cwd(), "app/api");

      // Verify API directory exists
      try {
        await stat(apiDir);
      } catch {
        logger.warn(`[EndpointDiscovery] API directory not found: ${apiDir}, using fallback`);
        return this.getFallbackRESTEndpoints(baseUrl);
      }

      // Store reference to this for use in nested function
      const self = this;
      
      const scanDirectory = async (dir: string, basePath: string = ""): Promise<void> => {
        try {
          const entries = await readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const routePath = basePath ? `${basePath}/${entry.name}` : entry.name;
            
            // Skip certain directories and files
            if (entry.name === "node_modules" || entry.name.startsWith(".") || entry.name === "docs") {
              continue;
            }
            
            if (entry.isDirectory()) {
              await scanDirectory(fullPath, routePath);
            } else if (entry.name === "route.ts") {
              try {
                const content = await readFile(fullPath, "utf-8");
                const methods: string[] = [];
                
                // Detect HTTP methods - check both direct exports and const exports
                if (content.includes("export async function GET") || content.includes("export const GET") || content.includes("export { GET")) methods.push("GET");
                if (content.includes("export async function POST") || content.includes("export const POST") || content.includes("export { POST")) methods.push("POST");
                if (content.includes("export async function PUT") || content.includes("export const PUT") || content.includes("export { PUT")) methods.push("PUT");
                if (content.includes("export async function DELETE") || content.includes("export const DELETE") || content.includes("export { DELETE")) methods.push("DELETE");
                if (content.includes("export async function PATCH") || content.includes("export const PATCH") || content.includes("export { PATCH")) methods.push("PATCH");
                
                if (methods.length > 0) {
                  // Convert file path to API route
                  // app/api/v1/chat/route.ts -> /api/v1/chat
                  // app/api/v1/containers/[id]/route.ts -> /api/v1/containers/:id
                  let apiPath = fullPath
                    .replace(process.cwd(), "")
                    .replace(/\\/g, "/")
                    .replace("/app", "")
                    .replace("/route.ts", "");
                  
                  // Convert Next.js dynamic routes [id] to :id format
                  apiPath = apiPath.replace(/\[([^\]]+)\]/g, ":$1");
                  
                  // Skip internal/cron routes that shouldn't be exposed
                  if (apiPath.includes("/cron/") || 
                      apiPath.includes("/admin/") ||
                      apiPath.includes("/privy/") ||
                      apiPath.includes("/stripe/webhook") ||
                      apiPath.includes("/seed/")) {
                    continue;
                  }
                  
                  // Determine category from path
                  const category = self.categorizePath(apiPath);
                  
                  // Determine auth requirement
                  const auth = self.determineAuth(apiPath, content);
                  
                  // Generate name from path
                  const name = self.generateEndpointName(apiPath);
                  
                  // Generate description
                  const description = self.generateEndpointDescription(apiPath, content);
                  
                  // Create a node for each HTTP method
                  for (const method of methods) {
                    const nodeId = `rest_${method.toLowerCase()}_${apiPath.replace(/[^a-zA-Z0-9]/g, "_")}`;
                    
                    nodes.push({
                      id: nodeId,
                      name: `REST: ${method} ${name}`,
                      description,
                      type: "rest",
                      category,
                      endpoint: `${baseUrl}${apiPath}`,
                      method,
                      authentication: auth ? {
                        type: auth,
                        description: auth === "api_key" ? "Requires API key" : auth === "bearer" ? "Requires bearer token" : "No authentication required",
                      } : undefined,
                      source: "builtin",
                      metadata: {
                        path: apiPath,
                        file: fullPath.replace(process.cwd(), ""),
                      },
                    });
                  }
                }
              } catch (error) {
                // Skip files we can't read or parse
                logger.debug(`[EndpointDiscovery] Skipping ${fullPath}:`, error);
              }
            }
          }
        } catch (error) {
          // Skip directories we can't read
          logger.debug(`[EndpointDiscovery] Skipping directory ${dir}:`, error);
        }
      };
      
      await scanDirectory(apiDir);
      
      // If no nodes were discovered, use fallback
      if (nodes.length === 0) {
        logger.warn("[EndpointDiscovery] No REST endpoints discovered dynamically, using fallback");
        return this.getFallbackRESTEndpoints(baseUrl);
      }
      
      logger.info(`[EndpointDiscovery] Discovered ${nodes.length} REST endpoints dynamically`);
    } catch (error) {
      logger.error("[EndpointDiscovery] Error discovering REST endpoints:", error);
      // Fallback to hardcoded list if dynamic discovery fails
      return this.getFallbackRESTEndpoints(baseUrl);
    }

    return nodes;
  }

  /**
   * Fallback REST endpoints if dynamic discovery fails.
   */
  private getFallbackRESTEndpoints(baseUrl: string): EndpointNode[] {
    const nodes: EndpointNode[] = [];
    const restEndpoints: Array<{
      path: string;
      method: string;
      name: string;
      description: string;
      category: string;
      auth?: "api_key" | "bearer" | "none";
    }> = [
      { path: "/api/v1/chat", method: "POST", name: "Chat Completion", description: "Generate text with LLMs", category: "ai", auth: "api_key" },
      { path: "/api/v1/generate-image", method: "POST", name: "Generate Image", description: "Generate images with AI", category: "ai", auth: "api_key" },
      { path: "/api/v1/generate-video", method: "POST", name: "Generate Video", description: "Generate videos with AI", category: "ai", auth: "api_key" },
      { path: "/api/v1/storage", method: "POST", name: "Upload File", description: "Upload file to decentralized storage", category: "storage", auth: "api_key" },
      { path: "/api/v1/storage", method: "GET", name: "List Files", description: "List stored files", category: "storage", auth: "api_key" },
      { path: "/api/v1/storage/:id", method: "GET", name: "Get File", description: "Get file details", category: "storage", auth: "api_key" },
      { path: "/api/v1/containers", method: "GET", name: "List Containers", description: "List deployed containers", category: "infrastructure", auth: "api_key" },
      { path: "/api/v1/containers", method: "POST", name: "Create Container", description: "Deploy a new container", category: "infrastructure", auth: "api_key" },
      { path: "/api/v1/containers/:id", method: "GET", name: "Get Container", description: "Get container details", category: "infrastructure", auth: "api_key" },
      { path: "/api/v1/knowledge", method: "GET", name: "List Knowledge Bases", description: "List knowledge bases", category: "knowledge", auth: "api_key" },
      { path: "/api/v1/knowledge/query", method: "POST", name: "Query Knowledge", description: "Query knowledge base", category: "knowledge", auth: "api_key" },
      { path: "/api/v1/discovery", method: "GET", name: "Discover Services", description: "Discover agents, MCPs, and services", category: "discovery", auth: "none" },
      { path: "/api/v1/n8n/workflows", method: "GET", name: "List Workflows", description: "List n8n workflows", category: "workflows", auth: "api_key" },
      { path: "/api/v1/n8n/workflows", method: "POST", name: "Create Workflow", description: "Create n8n workflow", category: "workflows", auth: "api_key" },
      { path: "/api/v1/n8n/workflows/:id", method: "GET", name: "Get Workflow", description: "Get workflow details", category: "workflows", auth: "api_key" },
      { path: "/api/v1/n8n/workflows/:id", method: "PUT", name: "Update Workflow", description: "Update workflow", category: "workflows", auth: "api_key" },
      { path: "/api/v1/n8n/workflows/:id", method: "DELETE", name: "Delete Workflow", description: "Delete workflow", category: "workflows", auth: "api_key" },
      { path: "/api/v1/n8n/workflows/:id/test", method: "POST", name: "Test Workflow", description: "Test workflow execution", category: "workflows", auth: "api_key" },
      { path: "/api/v1/n8n/workflows/:id/deploy", method: "POST", name: "Deploy Workflow", description: "Deploy workflow to n8n", category: "workflows", auth: "api_key" },
      { path: "/api/v1/n8n/webhooks/:key", method: "POST", name: "Trigger Webhook", description: "Trigger workflow via webhook", category: "workflows", auth: "none" },
      { path: "/api/v1/credits/balance", method: "GET", name: "Get Balance", description: "Get credit balance", category: "billing", auth: "api_key" },
      { path: "/api/v1/credits/transactions", method: "GET", name: "List Transactions", description: "List credit transactions", category: "billing", auth: "api_key" },
      // DeFi endpoints
      { path: "/api/v1/defi/price", method: "GET", name: "Get Token Price", description: "Get token price from multiple sources (Birdeye, Jupiter, CoinGecko, CMC)", category: "defi", auth: "api_key" },
      { path: "/api/v1/defi/trending", method: "GET", name: "Get Trending Tokens", description: "Get trending tokens from various sources", category: "defi", auth: "api_key" },
      { path: "/api/v1/defi/market", method: "GET", name: "Market Overview", description: "Get global cryptocurrency market overview", category: "defi", auth: "api_key" },
      { path: "/api/v1/defi/solana/token", method: "GET", name: "Solana Token Overview", description: "Get detailed Solana token overview from Birdeye", category: "defi", auth: "api_key" },
      { path: "/api/v1/defi/solana/wallet", method: "GET", name: "Solana Wallet Portfolio", description: "Get Solana wallet portfolio from Birdeye", category: "defi", auth: "api_key" },
      { path: "/api/v1/defi/jupiter/quote", method: "GET", name: "Jupiter Swap Quote", description: "Get Jupiter swap quote on Solana", category: "defi", auth: "api_key" },
      { path: "/api/v1/defi/helius/transactions", method: "GET", name: "Helius Transactions", description: "Get Solana transaction history from Helius", category: "defi", auth: "api_key" },
      { path: "/api/v1/defi/swap/quote", method: "GET", name: "0x Swap Quote", description: "Get 0x swap quote for EVM chains", category: "defi", auth: "api_key" },
      { path: "/api/v1/defi/search", method: "GET", name: "Search Tokens", description: "Search tokens across chains", category: "defi", auth: "api_key" },
      { path: "/api/v1/defi/ohlcv", method: "GET", name: "Get OHLCV", description: "Get OHLCV candlestick data", category: "defi", auth: "api_key" },
      { path: "/api/v1/defi/health", method: "GET", name: "DeFi Health", description: "Check health status of DeFi services", category: "defi", auth: "none" },
    ];

    for (const endpoint of restEndpoints) {
      nodes.push({
        id: `rest_${endpoint.method.toLowerCase()}_${endpoint.path.replace(/[^a-zA-Z0-9]/g, "_")}`,
        name: `REST: ${endpoint.name}`,
        description: endpoint.description,
        type: "rest",
        category: endpoint.category,
        endpoint: `${baseUrl}${endpoint.path}`,
        method: endpoint.method,
        authentication: endpoint.auth ? {
          type: endpoint.auth === "api_key" ? "api_key" : endpoint.auth === "bearer" ? "bearer" : "none",
        } : undefined,
        source: "builtin",
        metadata: {
          path: endpoint.path,
        },
      });
    }

    return nodes;
  }

  /**
   * Categorizes an API path.
   */
  private categorizePath(path: string): string {
    if (path.includes("/chat") || path.includes("/generate") || path.includes("/completions") || path.includes("/embeddings")) return "ai";
    if (path.includes("/storage") || path.includes("/ipfs")) return "storage";
    if (path.includes("/containers") || path.includes("/deploy")) return "infrastructure";
    if (path.includes("/knowledge") || path.includes("/query")) return "knowledge";
    if (path.includes("/n8n") || path.includes("/workflows")) return "workflows";
    if (path.includes("/credits") || path.includes("/billing") || path.includes("/redemptions") || path.includes("/purchases")) return "billing";
    if (path.includes("/agents") || path.includes("/characters") || path.includes("/marketplace")) return "agents";
    if (path.includes("/api-keys") || path.includes("/user") || path.includes("/organizations")) return "account";
    if (path.includes("/discovery") || path.includes("/mcps") || path.includes("/a2a")) return "discovery";
    if (path.includes("/fragments") || path.includes("/projects")) return "fragments";
    if (path.includes("/gallery") || path.includes("/models")) return "media";
    if (path.includes("/analytics") || path.includes("/dashboard") || path.includes("/stats")) return "analytics";
    if (path.includes("/webhooks") || path.includes("/triggers")) return "webhooks";
    if (path.includes("/cron")) return "cron";
    if (path.includes("/defi") || path.includes("/jupiter") || path.includes("/helius") || path.includes("/swap")) return "defi";
    return "utilities";
  }

  /**
   * Determines authentication requirement from path and content.
   */
  private determineAuth(path: string, content: string): "api_key" | "bearer" | "none" | undefined {
    // Public endpoints
    if (path.includes("/public/") || 
        path.includes("/discovery") ||
        path.includes("/webhooks/") ||
        path.includes("/openapi.json")) {
      return "none";
    }
    
    // Check for auth middleware in content
    if (content.includes("requireAuthOrApiKey") || content.includes("requireAuth")) {
      return "api_key";
    }
    
    if (content.includes("requireBearer") || content.includes("bearer")) {
      return "bearer";
    }
    
    // Default to API key for most endpoints
    return "api_key";
  }

  /**
   * Generates a human-readable name from an API path.
   */
  private generateEndpointName(path: string): string {
    // Remove /api prefix
    let name = path.replace(/^\/api\/v\d+\//, "").replace(/^\/api\//, "");
    
    // Handle dynamic segments
    name = name.replace(/\/:(\w+)/g, " by $1");
    name = name.replace(/\[(\w+)\]/g, " by $1");
    
    // Convert to title case
    name = name
      .split("/")
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, " "))
      .join(" ");
    
    return name || "API Endpoint";
  }

  /**
   * Generates a description from path and content.
   */
  private generateEndpointDescription(path: string, content: string): string {
    // Try to extract description from JSDoc comments
    const jsdocMatch = content.match(/\/\*\*[\s\S]*?\*\/[\s\S]*?export async function/);
    if (jsdocMatch) {
      const descMatch = jsdocMatch[0].match(/\*\s+(.+?)(?:\n|$)/);
      if (descMatch && descMatch[1] && !descMatch[1].includes("*")) {
        return descMatch[1].trim();
      }
    }
    
    // Fallback to generated description
    const name = this.generateEndpointName(path);
    return `${name} endpoint`;
  }

  /**
   * Discovers all endpoints (A2A + MCP + REST).
   */
  async discoverAllEndpoints(): Promise<EndpointNode[]> {
    const [a2aNodes, mcpNodes, restNodes] = await Promise.all([
      this.discoverA2ASkills(),
      this.discoverMCPTools(),
      this.discoverRESTEndpoints(),
    ]);

    return [...a2aNodes, ...mcpNodes, ...restNodes];
  }

  /**
   * Searches endpoints by query.
   */
  async searchEndpoints(query: string, options?: {
    types?: ("a2a" | "mcp" | "rest")[];
    categories?: string[];
    limit?: number;
  }): Promise<NodeSearchResult> {
    const allNodes = await this.discoverAllEndpoints();
    
    let filtered = allNodes;

    // Filter by type
    if (options?.types && options.types.length > 0) {
      filtered = filtered.filter(node => options.types!.includes(node.type));
    }

    // Filter by category
    if (options?.categories && options.categories.length > 0) {
      filtered = filtered.filter(node => 
        options.categories!.some(cat => 
          node.category.toLowerCase().includes(cat.toLowerCase())
        )
      );
    }

    // Text search
    if (query) {
      const queryLower = query.toLowerCase();
      filtered = filtered.filter(node =>
        node.name.toLowerCase().includes(queryLower) ||
        node.description.toLowerCase().includes(queryLower) ||
        node.category.toLowerCase().includes(queryLower) ||
        (node.metadata?.skillId as string)?.toLowerCase().includes(queryLower) ||
        (node.metadata?.toolName as string)?.toLowerCase().includes(queryLower)
      );
    }

    // Limit results
    const limit = options?.limit || 100;
    const limited = filtered.slice(0, limit);

    // Extract unique categories
    const categories = Array.from(new Set(filtered.map(n => n.category)));

    return {
      nodes: limited,
      total: filtered.length,
      categories,
    };
  }

  /**
   * Gets endpoint details by ID.
   */
  async getEndpointById(id: string): Promise<EndpointNode | null> {
    const allNodes = await this.discoverAllEndpoints();
    return allNodes.find(n => n.id === id) || null;
  }

  /**
   * Categorizes an A2A skill.
   */
  private categorizeSkill(skillId: string): string {
    if (skillId.includes("chat") || skillId.includes("completion")) return "ai";
    if (skillId.includes("image") || skillId.includes("video")) return "media";
    if (skillId.includes("memory") || skillId.includes("conversation")) return "memory";
    if (skillId.includes("storage")) return "storage";
    if (skillId.includes("container")) return "infrastructure";
    if (skillId.includes("n8n") || skillId.includes("workflow")) return "workflows";
    if (skillId.includes("balance") || skillId.includes("usage")) return "billing";
    if (skillId.includes("defi") || skillId.includes("token") || skillId.includes("swap") || skillId.includes("jupiter") || skillId.includes("solana") || skillId.includes("helius") || skillId.includes("0x") || skillId.includes("zeroex")) return "defi";
    return "utilities";
  }

  /**
   * Categorizes an MCP tool.
   */
  private categorizeTool(toolName: string): string {
    if (toolName.includes("generate") || toolName.includes("text") || toolName.includes("image")) return "ai";
    if (toolName.includes("memory") || toolName.includes("conversation")) return "memory";
    if (toolName.includes("storage")) return "storage";
    if (toolName.includes("container")) return "infrastructure";
    if (toolName.includes("credit") || toolName.includes("balance")) return "billing";
    if (toolName.includes("crypto") || toolName.includes("price") || toolName.includes("defi") || toolName.includes("token") || toolName.includes("swap") || toolName.includes("jupiter") || toolName.includes("solana") || toolName.includes("helius") || toolName.includes("0x") || toolName.includes("trending") || toolName.includes("ohlcv")) return "defi";
    if (toolName.includes("weather")) return "data";
    if (toolName.includes("time")) return "utilities";
    return "utilities";
  }
}

export const endpointDiscoveryService = new EndpointDiscoveryService();

