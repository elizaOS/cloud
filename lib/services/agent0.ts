/**
 * Agent0 Service
 *
 * Provides integration with Agent0's ERC-8004 on-chain registry for agent
 * discovery, search, and (future) reputation/feedback.
 *
 * @see https://sdk.ag0.xyz
 * @see https://eips.ethereum.org/EIPS/eip-8004
 */

import {
  CHAIN_IDS,
  RPC_URLS,
  ELIZA_CLOUD_AGENT_ID,
  SUBGRAPH_URLS,
  getDefaultNetwork,
  type ERC8004Network,
} from "@/lib/config/erc8004";
import { logger } from "@/lib/utils/logger";

// Lazy import agent0-sdk to avoid JSON import issues during initial load
let SDK: typeof import("agent0-sdk").SDK | null = null;
let AgentSummaryType: typeof import("agent0-sdk").AgentSummary;
let SearchParamsType: typeof import("agent0-sdk").SearchParams;

async function getSDKModule() {
  if (!SDK) {
    const sdkModule = await import("agent0-sdk");
    SDK = sdkModule.SDK;
    AgentSummaryType = sdkModule.AgentSummary;
    SearchParamsType = sdkModule.SearchParams;
  }
  return { SDK, AgentSummary: AgentSummaryType, SearchParams: SearchParamsType };
}

type AgentSummary = import("agent0-sdk").AgentSummary;
type SearchParams = import("agent0-sdk").SearchParams;

// ============================================================================
// Types
// ============================================================================

export interface Agent0SearchFilters {
  name?: string;
  mcpTools?: string[];
  a2aSkills?: string[];
  active?: boolean;
  x402Support?: boolean;
  limit?: number;
}

export interface Agent0Agent {
  agentId: string;
  name: string;
  description?: string;
  image?: string;
  walletAddress?: string;
  mcpEndpoint?: string;
  a2aEndpoint?: string;
  mcpTools?: string[];
  a2aSkills?: string[];
  active: boolean;
  x402Support: boolean;
}

// ============================================================================
// Agent0 Service
// ============================================================================

// SDK instance type - use InstanceType for proper typing
type SDKInstance = InstanceType<NonNullable<typeof SDK>>;

class Agent0Service {
  private sdk: SDKInstance | null = null;
  private initPromise: Promise<void> | null = null;
  private network: ERC8004Network;

  constructor() {
    this.network = getDefaultNetwork();
  }

  /**
   * Initialize SDK lazily
   */
  private async ensureSDK(): Promise<SDKInstance> {
    if (this.sdk) return this.sdk;

    if (this.initPromise) {
      await this.initPromise;
      return this.sdk!;
    }

    this.initPromise = (async () => {
      const privateKey = process.env.AGENT0_PRIVATE_KEY as `0x${string}` | undefined;

      const { SDK: SDKClass } = await getSDKModule();
      this.sdk = new SDKClass({
        chainId: CHAIN_IDS[this.network],
        rpcUrl: RPC_URLS[this.network],
        signer: privateKey,
        subgraphUrl: SUBGRAPH_URLS[this.network] || undefined,
      });

      logger.info("[Agent0] SDK initialized", {
        network: this.network,
        chainId: CHAIN_IDS[this.network],
        readOnly: !privateKey,
      });
    })();

    await this.initPromise;
    return this.sdk!;
  }

  /**
   * Get our registered agent ID
   */
  getAgentId(): string | null {
    const tokenId = ELIZA_CLOUD_AGENT_ID[this.network];
    if (!tokenId) return null;
    return `${CHAIN_IDS[this.network]}:${tokenId}`;
  }

  /**
   * Check if we're registered on the current network
   */
  isRegistered(): boolean {
    return ELIZA_CLOUD_AGENT_ID[this.network] !== null;
  }

  /**
   * Search for agents on the network
   */
  async searchAgents(filters: Agent0SearchFilters = {}): Promise<Agent0Agent[]> {
    const sdk = await this.ensureSDK();

    const searchParams: SearchParams = {
      name: filters.name,
      mcpTools: filters.mcpTools,
      a2aSkills: filters.a2aSkills,
      active: filters.active,
      x402support: filters.x402Support,
    };

    const { items } = await sdk.searchAgents(searchParams);

    return items.map((agent: AgentSummary) => ({
      agentId: agent.agentId,
      name: agent.name,
      description: agent.description,
      image: agent.image,
      walletAddress: agent.walletAddress,
      mcpEndpoint: agent.mcpEndpoint,
      a2aEndpoint: agent.a2aEndpoint,
      mcpTools: agent.mcpTools,
      a2aSkills: agent.a2aSkills,
      active: agent.active ?? false,
      x402Support: agent.x402support ?? false,
    }));
  }

  /**
   * Get a specific agent by ID
   */
  async getAgent(agentId: string): Promise<Agent0Agent | null> {
    const sdk = await this.ensureSDK();

    const agent = await sdk.getAgent(agentId);
    if (!agent) return null;

    return {
      agentId: agent.agentId,
      name: agent.name,
      description: agent.description,
      image: agent.image,
      walletAddress: agent.walletAddress,
      mcpEndpoint: agent.mcpEndpoint,
      a2aEndpoint: agent.a2aEndpoint,
      mcpTools: agent.mcpTools,
      a2aSkills: agent.a2aSkills,
      active: agent.active ?? false,
      x402Support: agent.x402support ?? false,
    };
  }

  /**
   * Get our own agent profile
   */
  async getSelf(): Promise<Agent0Agent | null> {
    const agentId = this.getAgentId();
    if (!agentId) return null;
    return this.getAgent(agentId);
  }

  /**
   * Search for agents with specific MCP tools
   */
  async findAgentsWithTools(tools: string[]): Promise<Agent0Agent[]> {
    return this.searchAgents({ mcpTools: tools, active: true });
  }

  /**
   * Search for agents with specific A2A skills
   */
  async findAgentsWithSkills(skills: string[]): Promise<Agent0Agent[]> {
    return this.searchAgents({ a2aSkills: skills, active: true });
  }

  /**
   * Search for agents that support x402 payments
   */
  async findPayableAgents(): Promise<Agent0Agent[]> {
    return this.searchAgents({ x402Support: true, active: true });
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const agent0Service = new Agent0Service();

