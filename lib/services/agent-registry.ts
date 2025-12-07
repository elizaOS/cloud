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
  type ERC8004Network,
} from "@/lib/config/erc8004";
import { X402_ENABLED } from "@/lib/config/x402";
import { logger } from "@/lib/utils/logger";
import type { UserCharacter } from "@/db/schemas/user-characters";

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
}

// ============================================================================
// Singleton Export
// ============================================================================

export const agentRegistryService = new AgentRegistryService();

