/**
 * Agent Registry Service
 *
 * Handles ERC-8004 on-chain registration for public agents.
 * When a user makes their agent public on the marketplace, we:
 * 1. Mint an NFT on the ERC-8004 Identity Registry (Eliza Cloud pays gas)
 * 2. Create A2A and MCP endpoints for the agent
 * 3. Enable monetization if requested
 *
 * This makes agents discoverable by other AI agents across the ecosystem.
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004
 */

import {
  CHAIN_IDS,
  RPC_URLS,
  IDENTITY_REGISTRY_ADDRESSES,
  REPUTATION_REGISTRY_ADDRESSES,
  VALIDATION_REGISTRY_ADDRESSES,
  getDefaultNetwork,
  getRegistrationNetworks,
  isMultiRegistryEnabled,
  isBatchRegistrationAvailable,
  isGasSponsored,
  getNetworkEcosystem,
  type ERC8004Network,
  type ERC8004Ecosystem,
  type MultiChainRegistrationResult,
} from "@/lib/config/erc8004";
import { X402_ENABLED } from "@/lib/config/x402";
import { logger } from "@/lib/utils/logger";
import { extractErrorMessage } from "@/lib/utils/error-handling";
import type { UserCharacter } from "@/db/schemas/user-characters";
import type { UserMcp } from "@/db/schemas/user-mcps";
import { accountAbstractionService } from "./account-abstraction";
import type { Hex, Address } from "viem";

// Lazy import agent0-sdk to avoid JSON import issues during initial load
let SDK: typeof import("agent0-sdk").SDK | null = null;
async function getSDK() {
  if (!SDK) {
    const sdkModule = await import("agent0-sdk");
    SDK = sdkModule.SDK;
  }
  return SDK;
}

// ============================================================================
// Types
// ============================================================================

export interface AgentRegistrationParams {
  character: UserCharacter;
  network?: ERC8004Network;
  enableMonetization?: boolean;
  inferenceMarkupPercentage?: number;
  payoutWalletAddress?: string;
}

export interface AgentRegistrationResult {
  success: boolean;
  agentId: string; // Format: "chainId:tokenId"
  agentUri: string; // IPFS or HTTP URI
  network: ERC8004Network;
  a2aEndpoint: string;
  mcpEndpoint: string;
  txHash?: string; // Not always available from agent0-sdk
}

export interface MCPRegistrationParams {
  mcp: UserMcp;
  network?: ERC8004Network;
}

export interface MCPRegistrationResult {
  success: boolean;
  agentId: string; // Format: "chainId:tokenId"
  agentUri: string; // IPFS or HTTP URI
  network: ERC8004Network;
  mcpEndpoint: string;
  txHash?: string;
}

export interface AgentCardData {
  name: string;
  description: string;
  image: string;
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  authentication: {
    schemes: Array<{
      scheme: string;
      description: string;
    }>;
  };
  skills: Array<{
    id: string;
    name: string;
    description: string;
    pricing: {
      type: "free" | "fixed" | "token-based" | "variable";
      amount?: number;
      inputCostPer1k?: number;
      outputCostPer1k?: number;
      markupPercentage?: number;
    };
  }>;
  pricing: {
    currency: string;
    paymentMethods: string[];
    minimumPayment: number;
  };
  contact: {
    creatorId: string;
    organizationId: string;
  };
}

// ============================================================================
// Agent Registry Service
// ============================================================================

// SDK instance type - use InstanceType for proper typing
type SDKInstance = InstanceType<Awaited<ReturnType<typeof getSDK>>>;

class AgentRegistryService {
  private sdk: SDKInstance | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize SDK with write access for registration
   */
  private async ensureSDK(network: ERC8004Network): Promise<SDKInstance> {
    const privateKey = process.env.AGENT0_PRIVATE_KEY as
      | `0x${string}`
      | undefined;

    if (!privateKey) {
      throw new Error(
        "AGENT0_PRIVATE_KEY required for agent registration. " +
          "This key is used to pay gas for minting agent NFTs."
      );
    }

    const chainId = CHAIN_IDS[network];
    const identityAddress = IDENTITY_REGISTRY_ADDRESSES[network];
    const reputationAddress = REPUTATION_REGISTRY_ADDRESSES[network];
    const validationAddress = VALIDATION_REGISTRY_ADDRESSES[network];

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    if (identityAddress === ZERO_ADDRESS) {
      throw new Error(
        `ERC-8004 Identity Registry not deployed on ${network}. ` +
          `Cannot register agents until contracts are available.`
      );
    }

    const SDKClass = await getSDK();
    const sdk = new SDKClass({
      chainId,
      rpcUrl: RPC_URLS[network],
      signer: privateKey,
      registryOverrides: {
        [chainId]: {
          IDENTITY: identityAddress,
          REPUTATION: reputationAddress,
          VALIDATION: validationAddress,
        },
      },
      // Use Pinata if available, otherwise HTTP
      ...(process.env.PINATA_JWT && {
        ipfs: "pinata" as const,
        pinataJwt: process.env.PINATA_JWT,
      }),
    });

    return sdk;
  }

  /**
   * Register an agent on ERC-8004
   *
   * This mints an NFT on the Identity Registry, making the agent
   * discoverable by other AI agents across the ecosystem.
   *
   * Eliza Cloud pays the gas fees for registration.
   */
  async registerAgent(
    params: AgentRegistrationParams
  ): Promise<AgentRegistrationResult> {
    const { character, enableMonetization = false } = params;
    const network = params.network || getDefaultNetwork();

    logger.info("[AgentRegistry] Registering agent on ERC-8004", {
      characterId: character.id,
      name: character.name,
      network,
    });

    const sdk = await this.ensureSDK(network);
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

    // Create agent in SDK
    const bioText = Array.isArray(character.bio)
      ? character.bio.join("\n")
      : character.bio;

    const agent = sdk.createAgent(
      character.name,
      bioText,
      character.avatar_url || `${baseUrl}/default-avatar.png`
    );

    // Set endpoints
    const a2aEndpoint = `${baseUrl}/api/agents/${character.id}/a2a`;
    const mcpEndpoint = `${baseUrl}/api/agents/${character.id}/mcp`;

    await agent.setA2A(a2aEndpoint);
    await agent.setMCP(mcpEndpoint);

    // Configure trust and metadata
    agent.setTrust(true, X402_ENABLED, false);
    agent.setMetadata({
      version: "1.0.0",
      category: character.category || "assistant",
      tags: character.tags || [],
      platform: "eliza-cloud",
      characterId: character.id,
      creatorOrganizationId: character.organization_id,
      monetizationEnabled: enableMonetization,
      inferenceMarkupPercentage: params.inferenceMarkupPercentage || 0,
    });
    agent.setActive(true);

    // Add OASF skills based on character capabilities
    if (character.topics?.includes("coding")) {
      agent.addSkill("software_engineering/code_generation", false);
    }
    if (character.topics?.includes("writing")) {
      agent.addSkill("natural_language_processing/text_generation", false);
    }
    if (character.topics?.includes("analysis")) {
      agent.addSkill("advanced_reasoning_planning/logical_reasoning", false);
    }

    // Add domain based on category
    if (character.category) {
      const categoryToDomain: Record<string, string> = {
        assistant: "technology/artificial_intelligence",
        creative: "arts_entertainment/creative_industries",
        business: "finance_and_business/business_consulting",
        education: "education_learning/online_learning",
        gaming: "arts_entertainment/gaming",
      };
      const domain = categoryToDomain[character.category];
      if (domain) {
        agent.addDomain(domain, false);
      }
    }

    // Register on-chain
    let agentId: string;
    let agentUri: string;

    if (process.env.PINATA_JWT) {
      const result = await agent.registerIPFS();
      agentId = result.agentId;
      agentUri = result.agentURI;
    } else {
      // Use HTTP registration pointing to our endpoint
      const registrationUrl = `${baseUrl}/api/agents/${character.id}/registration.json`;
      await agent.registerHTTP(registrationUrl);
      agentId = `${CHAIN_IDS[network]}:?`; // Token ID filled by contract event
      agentUri = registrationUrl;
    }

    const tokenId = agentId.split(":")[1];
    // Note: The agent0-sdk doesn't expose transaction hashes directly.
    // The txHash is handled internally during registerIPFS/registerHTTP.
    // For transaction tracking, use the block explorer with the agentId.

    logger.info("[AgentRegistry] Agent registered successfully", {
      characterId: character.id,
      agentId,
      agentUri,
      network,
      tokenId,
    });

    return {
      success: true,
      agentId,
      agentUri,
      network,
      a2aEndpoint,
      mcpEndpoint,
    };
  }

  /**
   * Register an MCP server on ERC-8004
   *
   * This mints an NFT on the Identity Registry for the MCP server,
   * making it discoverable by other AI agents across the ecosystem.
   *
   * Eliza Cloud pays the gas fees for registration.
   */
  async registerMCP(
    params: MCPRegistrationParams
  ): Promise<MCPRegistrationResult> {
    const { mcp } = params;
    const network = params.network || getDefaultNetwork();

    logger.info("[AgentRegistry] Registering MCP on ERC-8004", {
      mcpId: mcp.id,
      name: mcp.name,
      network,
    });

    const sdk = await this.ensureSDK(network);
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

    // Construct MCP endpoint
    const mcpEndpoint =
      mcp.endpoint_type === "external" && mcp.external_endpoint
        ? mcp.external_endpoint
        : `${baseUrl}/api/mcp/${mcp.slug}`;

    // Create agent in SDK (MCPs are registered as "agents" with MCP capabilities)
    const agent = sdk.createAgent(
      mcp.name,
      mcp.description,
      `${baseUrl}/api/mcp/${mcp.slug}/icon` // Default icon endpoint
    );

    // Set MCP endpoint (no A2A for pure MCP servers)
    await agent.setMCP(mcpEndpoint);

    // Configure trust and metadata based on MCP pricing
    const supportsX402 = mcp.x402_enabled;
    agent.setTrust(true, supportsX402, false);

    // Extract tool names for the registry
    const toolNames = (mcp.tools || []).map((tool) => tool.name);

    agent.setMetadata({
      version: mcp.version,
      category: mcp.category,
      tags: mcp.tags || [],
      platform: "eliza-cloud",
      serviceType: "mcp",
      mcpId: mcp.id,
      creatorOrganizationId: mcp.organization_id,
      pricingType: mcp.pricing_type,
      creditsPerRequest: mcp.credits_per_request,
      toolCount: toolNames.length,
      tools: toolNames,
    });
    agent.setActive(true);

    // Add tools as MCP capabilities
    for (const tool of mcp.tools || []) {
      agent.addMCPTool(tool.name, false);
    }

    // Add domain based on category
    const categoryToDomain: Record<string, string> = {
      utilities: "technology/software_development",
      ai: "technology/artificial_intelligence",
      productivity: "technology/software_development",
      finance: "finance_and_business/financial_services",
      social: "technology/social_media",
      gaming: "arts_entertainment/gaming",
      creative: "arts_entertainment/creative_industries",
    };
    const domain = categoryToDomain[mcp.category];
    if (domain) {
      agent.addDomain(domain, false);
    }

    // Register on-chain
    let agentId: string;
    let agentUri: string;

    if (process.env.PINATA_JWT) {
      const result = await agent.registerIPFS();
      agentId = result.agentId;
      agentUri = result.agentURI;
    } else {
      // Use HTTP registration
      const registrationUrl = `${baseUrl}/api/mcp/${mcp.slug}/registration.json`;
      await agent.registerHTTP(registrationUrl);
      agentId = `${CHAIN_IDS[network]}:?`;
      agentUri = registrationUrl;
    }

    const tokenId = agentId.split(":")[1];

    logger.info("[AgentRegistry] MCP registered successfully", {
      mcpId: mcp.id,
      agentId,
      agentUri,
      network,
      tokenId,
    });

    return {
      success: true,
      agentId,
      agentUri,
      network,
      mcpEndpoint,
    };
  }

  /**
   * Generate A2A Agent Card for a character
   */
  generateAgentCard(
    character: UserCharacter,
    baseUrl: string
  ): AgentCardData {
    const bioText = Array.isArray(character.bio)
      ? character.bio.join("\n")
      : character.bio;

    const markupPct = Number(character.inference_markup_percentage || 0);
    const hasMonetization = character.monetization_enabled && markupPct > 0;

    return {
      name: character.name,
      description: bioText,
      image: character.avatar_url || `${baseUrl}/default-avatar.png`,
      version: "1.0.0",

      capabilities: {
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: true,
      },

      authentication: {
        schemes: [
          {
            scheme: "bearer",
            description: "API Key authentication via Authorization header",
          },
          ...(X402_ENABLED
            ? [
                {
                  scheme: "x402",
                  description: "Pay-per-request via x402 protocol",
                },
              ]
            : []),
        ],
      },

      skills: [
        {
          id: "chat",
          name: "Chat",
          description: `Chat with ${character.name}`,
          pricing: {
            type: "token-based" as const,
            inputCostPer1k: 0.005,
            outputCostPer1k: 0.015,
            ...(hasMonetization && { markupPercentage: markupPct }),
          },
        },
        {
          id: "generate_image",
          name: "Image Generation",
          description: `Generate images as ${character.name}`,
          pricing: {
            type: "fixed" as const,
            amount: 0.05,
            ...(hasMonetization && { markupPercentage: markupPct }),
          },
        },
      ],

      pricing: {
        currency: "USD",
        paymentMethods: X402_ENABLED
          ? ["x402", "api_key_credits"]
          : ["api_key_credits"],
        minimumPayment: 0.001,
      },

      contact: {
        creatorId: character.user_id,
        organizationId: character.organization_id,
      },
    };
  }

  /**
   * Check if agent is registered on ERC-8004
   */
  isRegistered(character: UserCharacter): boolean {
    return (
      character.erc8004_registered &&
      character.erc8004_agent_id !== null &&
      character.erc8004_network !== null
    );
  }

  /**
   * Get the full agent ID (chainId:tokenId)
   */
  getAgentId(character: UserCharacter): string | null {
    if (!this.isRegistered(character)) return null;

    const network = character.erc8004_network as ERC8004Network;
    return `${CHAIN_IDS[network]}:${character.erc8004_agent_id}`;
  }

  /**
   * Get A2A endpoint for an agent
   */
  getA2AEndpoint(characterId: string, baseUrl: string): string {
    return `${baseUrl}/api/agents/${characterId}/a2a`;
  }

  /**
   * Get MCP endpoint for an agent
   */
  getMCPEndpoint(characterId: string, baseUrl: string): string {
    return `${baseUrl}/api/agents/${characterId}/mcp`;
  }

  /**
   * Check if MCP is registered on ERC-8004
   */
  isMCPRegistered(mcp: UserMcp): boolean {
    return (
      mcp.erc8004_registered &&
      mcp.erc8004_agent_id !== null &&
      mcp.erc8004_network !== null
    );
  }

  /**
   * Get the full agent ID (chainId:tokenId) for an MCP
   */
  getMCPAgentId(mcp: UserMcp): string | null {
    if (!this.isMCPRegistered(mcp)) return null;

    const network = mcp.erc8004_network as ERC8004Network;
    return `${CHAIN_IDS[network]}:${mcp.erc8004_agent_id}`;
  }

  // ==========================================================================
  // Multi-Chain Registration (Jeju AND Base)
  // ==========================================================================

  /**
   * Register an agent on MULTIPLE registries (Jeju and Base)
   * 
   * This registers the agent on both ecosystems with a single user action.
   * When ERC-4337 batch registration is available, operations are batched
   * into a single UserOperation to minimize signatures and sponsor gas.
   * 
   * @param params - Agent registration parameters
   * @returns Registration results from all chains
   */
  async registerAgentMultiChain(
    params: AgentRegistrationParams
  ): Promise<MultiChainRegistrationResult> {
    const { character } = params;
    
    if (!isMultiRegistryEnabled()) {
      // Fall back to single registration
      const result = await this.registerAgent(params);
      return {
        success: result.success,
        registrations: [{
          network: result.network,
          ecosystem: getNetworkEcosystem(result.network),
          agentId: result.agentId,
          agentURI: result.agentUri,
        }],
      };
    }

    const networks = getRegistrationNetworks();
    const canBatch = isBatchRegistrationAvailable() && accountAbstractionService.canBatchRegister();
    
    logger.info("[AgentRegistry] Starting multi-chain registration", {
      characterId: character.id,
      name: character.name,
      networks,
      batchAvailable: canBatch,
      gasSponsored: isGasSponsored(),
    });

    // If batch registration via 4337 is available, use it
    if (canBatch) {
      return this.registerAgentMultiChainBatched(params);
    }

    // Otherwise, register sequentially on each network
    const registrations: MultiChainRegistrationResult["registrations"] = [];

    for (const network of networks) {
      const result = await this.registerAgent({ ...params, network }).catch((err) => {
        const error = extractErrorMessage(err);
        logger.error("[AgentRegistry] Registration failed", { 
          network, 
          characterId: character.id,
          error,
        });
        return { success: false, error };
      });

      if ("success" in result && result.success) {
        registrations.push({
          network: result.network,
          ecosystem: getNetworkEcosystem(result.network),
          agentId: result.agentId,
          agentURI: result.agentUri,
        });
      } else {
        const errorMsg = "error" in result ? result.error : "Unknown error";
        registrations.push({
          network,
          ecosystem: getNetworkEcosystem(network),
          agentId: "",
          agentURI: "",
          error: errorMsg,
        });
      }
    }

    const success = registrations.some(r => !r.error);
    
    logger.info("[AgentRegistry] Multi-chain registration complete", {
      characterId: character.id,
      success,
      successfulNetworks: registrations.filter(r => !r.error).map(r => r.network),
      failedNetworks: registrations.filter(r => r.error).map(r => r.network),
    });

    return { success, registrations };
  }

  /**
   * Register agent using ERC-4337 batch operations
   * 
   * Uses account abstraction to batch registration calls across networks,
   * minimizing user signatures and sponsoring gas via paymaster.
   */
  private async registerAgentMultiChainBatched(
    params: AgentRegistrationParams
  ): Promise<MultiChainRegistrationResult> {
    const { character } = params;
    const privateKey = process.env.AGENT0_PRIVATE_KEY as Hex | undefined;
    
    if (!privateKey) {
      logger.warn("[AgentRegistry] No private key for AA batch registration, falling back to sequential");
      // Fall back to sequential registration
      return this.registerAgentMultiChainSequential(params);
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
    const tokenURI = `${baseUrl}/api/agents/${character.id}/registration.json`;
    
    // Use the service wallet as the sender
    const senderAddress = process.env.X402_RECIPIENT_ADDRESS as Address;
    
    if (!senderAddress || senderAddress === "0x0000000000000000000000000000000000000000") {
      logger.warn("[AgentRegistry] No sender address for AA batch registration, falling back to sequential");
      return this.registerAgentMultiChainSequential(params);
    }

    logger.info("[AgentRegistry] Executing batched multi-chain registration via 4337", {
      characterId: character.id,
      sender: senderAddress,
      gasSponsored: accountAbstractionService.isGasSponsored(),
    });

    const result = await accountAbstractionService.executeBatchRegistration(
      senderAddress,
      privateKey,
      senderAddress,
      tokenURI
    );

    // Map AA result to MultiChainRegistrationResult
    const registrations: MultiChainRegistrationResult["registrations"] = result.operations.map(op => ({
      network: op.network,
      ecosystem: getNetworkEcosystem(op.network),
      agentId: op.success ? `${op.chainId}:pending` : "",
      agentURI: tokenURI,
      txHash: op.txHash,
      error: op.error,
    }));

    logger.info("[AgentRegistry] Batched registration complete", {
      characterId: character.id,
      success: result.success,
      gasSponsored: result.gasSponsored,
      operations: result.operations.length,
    });

    return {
      success: result.success,
      registrations,
      batchTxHash: result.userOpHash,
    };
  }

  /**
   * Sequential registration fallback when batch is unavailable
   */
  private async registerAgentMultiChainSequential(
    params: AgentRegistrationParams
  ): Promise<MultiChainRegistrationResult> {
    const networks = getRegistrationNetworks();
    const registrations: MultiChainRegistrationResult["registrations"] = [];

    for (const network of networks) {
      const result = await this.registerAgent({ ...params, network }).catch((err) => {
        const error = extractErrorMessage(err);
        return { success: false, error };
      });

      if ("success" in result && result.success) {
        registrations.push({
          network: result.network,
          ecosystem: getNetworkEcosystem(result.network),
          agentId: result.agentId,
          agentURI: result.agentUri,
        });
      } else {
        registrations.push({
          network,
          ecosystem: getNetworkEcosystem(network),
          agentId: "",
          agentURI: "",
          error: "error" in result ? result.error : "Unknown error",
        });
      }
    }

    return {
      success: registrations.some(r => !r.error),
      registrations,
    };
  }

  /**
   * Register an MCP on MULTIPLE registries (Jeju and Base)
   */
  async registerMCPMultiChain(
    params: MCPRegistrationParams
  ): Promise<MultiChainRegistrationResult> {
    const { mcp } = params;
    
    if (!isMultiRegistryEnabled()) {
      const result = await this.registerMCP(params);
      return {
        success: result.success,
        registrations: [{
          network: result.network,
          ecosystem: getNetworkEcosystem(result.network),
          agentId: result.agentId,
          agentURI: result.agentUri,
        }],
      };
    }

    const networks = getRegistrationNetworks();
    logger.info("[AgentRegistry] Starting multi-chain MCP registration", {
      mcpId: mcp.id,
      name: mcp.name,
      networks,
    });

    const registrations: MultiChainRegistrationResult["registrations"] = [];

    for (const network of networks) {
      const result = await this.registerMCP({ ...params, network }).catch((err) => {
        const error = extractErrorMessage(err);
        logger.error("[AgentRegistry] MCP registration failed", { 
          network, 
          mcpId: mcp.id,
          error,
        });
        return { success: false, error };
      });

      if ("success" in result && result.success) {
        registrations.push({
          network: result.network,
          ecosystem: getNetworkEcosystem(result.network),
          agentId: result.agentId,
          agentURI: result.agentUri,
        });
      } else {
        const errorMsg = "error" in result ? result.error : "Unknown error";
        registrations.push({
          network,
          ecosystem: getNetworkEcosystem(network),
          agentId: "",
          agentURI: "",
          error: errorMsg,
        });
      }
    }

    const success = registrations.some(r => !r.error);
    return { success, registrations };
  }

  /**
   * Check if agent is registered on a specific ecosystem
   */
  isRegisteredOnEcosystem(character: UserCharacter, ecosystem: ERC8004Ecosystem): boolean {
    if (!character.erc8004_registered) return false;
    
    const network = character.erc8004_network as ERC8004Network;
    return getNetworkEcosystem(network) === ecosystem;
  }

  /**
   * Get all registrations for an agent across ecosystems
   */
  getAgentRegistrations(character: UserCharacter): Array<{
    network: ERC8004Network;
    ecosystem: ERC8004Ecosystem;
    agentId: string;
  }> {
    // For now, single registration is stored. Multi-chain would need DB schema update.
    if (!this.isRegistered(character)) return [];
    
    const network = character.erc8004_network as ERC8004Network;
    return [{
      network,
      ecosystem: getNetworkEcosystem(network),
      agentId: `${CHAIN_IDS[network]}:${character.erc8004_agent_id}`,
    }];
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const agentRegistryService = new AgentRegistryService();

