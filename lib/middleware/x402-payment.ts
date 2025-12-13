/**
 * x402 Payment Middleware
 *
 * Multi-network x402 payment handling supporting:
 * - Jeju networks: Decentralized facilitator (no CDP required)
 * - Base networks: Coinbase CDP facilitator (recommended) or public fallback
 *
 * Uses official x402-next package for HTTP 402 payment handling.
 *
 * @see https://github.com/coinbase/x402
 */

import { createFacilitatorConfig } from "@coinbase/x402";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  type Address,
  type Hex,
  verifyTypedData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { logger } from "@/lib/utils/logger";
import { extractErrorMessage } from "@/lib/utils/error-handling";
import {
  getDefaultNetwork,
  getFacilitatorType,
  getFacilitatorConfig,
  getNetworkEcosystem,
  getNetworkConfig,
  JEJU_NETWORKS,
  USDC_ADDRESSES,
  CHAIN_IDS,
  type X402Network,
} from "@/lib/config/x402";
import { jeju, jejuTestnet, jejuLocalnet } from "@/lib/config/chains";

let facilitatorWarningLogged = false;
let decentralizedFacilitatorLogged = false;

// ============================================================================
// x402 Payment Types (EIP-3009 TransferWithAuthorization)
// ============================================================================

/** x402 payment payload structure */
interface X402PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: Hex;
    authorization: {
      from: Address;
      to: Address;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: Hex;
    };
  };
}

/** EIP-3009 domain for USDC */
const getEIP3009Domain = (chainId: number, usdcAddress: Address) => ({
  name: "USD Coin",
  version: "2",
  chainId,
  verifyingContract: usdcAddress,
});

/** EIP-3009 TransferWithAuthorization types */
const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/** USDC transferWithAuthorization ABI */
const USDC_TRANSFER_WITH_AUTH_ABI = [
  {
    name: "transferWithAuthorization",
    type: "function",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ============================================================================
// Facilitator Types
// ============================================================================

/** CDP Facilitator configuration */
type CDPFacilitator = ReturnType<typeof createFacilitatorConfig>;

/** Decentralized Facilitator for Jeju networks */
interface DecentralizedFacilitator {
  type: "decentralized";
  network: X402Network;
  contractAddress: string;
  verify: (payment: string, resource: string, price: string) => Promise<boolean>;
  settle: (payment: string) => Promise<{ txHash: string }>;
}

/** Facilitator can be CDP, Decentralized, or undefined (public) */
type Facilitator = CDPFacilitator | DecentralizedFacilitator | undefined;

// ============================================================================
// Payment Parsing and Verification
// ============================================================================

/**
 * Parse x402 payment header
 */
function parseX402Payment(paymentHeader: string): X402PaymentPayload {
  const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
  return JSON.parse(decoded) as X402PaymentPayload;
}

/**
 * Get the viem chain for a network
 */
function getViemChain(network: X402Network) {
  switch (network) {
    case "jeju-localnet": return jejuLocalnet;
    case "jeju-testnet": return jejuTestnet;
    case "jeju": return jeju;
    default: return jejuTestnet;
  }
}

/**
 * Parse price string to USDC units (6 decimals)
 */
function parsePriceToUnits(price: string): bigint {
  // Remove $ sign and parse
  const numericPrice = price.replace(/[^0-9.]/g, "");
  return parseUnits(numericPrice, 6);
}

// ============================================================================
// Facilitator Creation
// ============================================================================

/**
 * Create a decentralized facilitator for Jeju networks
 * 
 * This facilitator verifies and settles payments via the Jeju chain
 * without requiring Coinbase CDP credentials. It implements:
 * 
 * 1. **Verification**: Validates EIP-3009 TransferWithAuthorization signature
 * 2. **Settlement**: Calls transferWithAuthorization on USDC contract
 */
function createDecentralizedFacilitator(network: X402Network): DecentralizedFacilitator {
  const config = getFacilitatorConfig(network);
  const networkConfig = getNetworkConfig(network);
  const chainId = CHAIN_IDS[network];
  const usdcAddress = USDC_ADDRESSES[network];
  const chain = getViemChain(network);
  
  if (!decentralizedFacilitatorLogged) {
    decentralizedFacilitatorLogged = true;
    logger.info("[x402] Using Jeju decentralized facilitator", { 
      network, 
      chainId,
      usdc: usdcAddress,
    });
  }

  return {
    type: "decentralized",
    network,
    contractAddress: config.contractAddress || "0x0000000000000000000000000000000000000000",
    
    /**
     * Verify x402 payment authorization
     * 
     * Validates that:
     * 1. The payment signature is valid (EIP-3009)
     * 2. The authorization hasn't expired
     * 3. The amount is sufficient for the price
     */
    verify: async (paymentHeader: string, _resource: string, price: string): Promise<boolean> => {
      try {
        const payment = parseX402Payment(paymentHeader);
        const { authorization, signature } = payment.payload;
        
        // Check expiry
        const now = Math.floor(Date.now() / 1000);
        const validAfter = parseInt(authorization.validAfter, 10);
        const validBefore = parseInt(authorization.validBefore, 10);
        
        if (now < validAfter) {
          logger.warn("[x402] Payment not yet valid", { now, validAfter });
          return false;
        }
        
        if (now >= validBefore) {
          logger.warn("[x402] Payment expired", { now, validBefore });
          return false;
        }
        
        // Check amount
        const requiredAmount = parsePriceToUnits(price);
        const paymentAmount = BigInt(authorization.value);
        
        if (paymentAmount < requiredAmount) {
          logger.warn("[x402] Insufficient payment amount", {
            required: requiredAmount.toString(),
            provided: paymentAmount.toString(),
          });
          return false;
        }
        
        // Verify signature using EIP-712 typed data
        const isValid = await verifyTypedData({
          address: authorization.from,
          domain: getEIP3009Domain(chainId, usdcAddress),
          types: EIP3009_TYPES,
          primaryType: "TransferWithAuthorization",
          message: {
            from: authorization.from,
            to: authorization.to,
            value: BigInt(authorization.value),
            validAfter: BigInt(authorization.validAfter),
            validBefore: BigInt(authorization.validBefore),
            nonce: authorization.nonce,
          },
          signature,
        });
        
        logger.debug("[x402] Decentralized verification", { 
          network, 
          from: authorization.from,
          amount: authorization.value,
          valid: isValid,
        });
        
        return isValid;
      } catch (error) {
        logger.error("[x402] Verification error", { 
          error: extractErrorMessage(error) 
        });
        return false;
      }
    },
    
    /**
     * Settle x402 payment on-chain
     * 
     * Calls transferWithAuthorization on USDC contract to execute
     * the pre-authorized token transfer.
     */
    settle: async (paymentHeader: string): Promise<{ txHash: string }> => {
      const privateKey = process.env.AGENT0_PRIVATE_KEY as Hex | undefined;
      
      if (!privateKey) {
        throw new Error(
          "AGENT0_PRIVATE_KEY required for decentralized x402 settlement. " +
          "This key is used to submit settlement transactions."
        );
      }
      
      const payment = parseX402Payment(paymentHeader);
      const { authorization, signature } = payment.payload;
      
      // Parse signature into v, r, s
      const sigBytes = signature.slice(2); // Remove 0x prefix
      const r = `0x${sigBytes.slice(0, 64)}` as Hex;
      const s = `0x${sigBytes.slice(64, 128)}` as Hex;
      const v = parseInt(sigBytes.slice(128, 130), 16);
      
      // Create clients
      const account = privateKeyToAccount(privateKey);
      
      const publicClient = createPublicClient({
        chain,
        transport: http(networkConfig.rpcUrl),
      });
      
      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(networkConfig.rpcUrl),
      });
      
      logger.info("[x402] Settling payment on-chain", {
        network,
        from: authorization.from,
        to: authorization.to,
        value: authorization.value,
      });
      
      // Simulate first to catch errors
      await publicClient.simulateContract({
        address: usdcAddress,
        abi: USDC_TRANSFER_WITH_AUTH_ABI,
        functionName: "transferWithAuthorization",
        args: [
          authorization.from,
          authorization.to,
          BigInt(authorization.value),
          BigInt(authorization.validAfter),
          BigInt(authorization.validBefore),
          authorization.nonce,
          v,
          r,
          s,
        ],
        account,
      });
      
      // Execute the transfer
      const txHash = await walletClient.writeContract({
        address: usdcAddress,
        abi: USDC_TRANSFER_WITH_AUTH_ABI,
        functionName: "transferWithAuthorization",
        args: [
          authorization.from,
          authorization.to,
          BigInt(authorization.value),
          BigInt(authorization.validAfter),
          BigInt(authorization.validBefore),
          authorization.nonce,
          v,
          r,
          s,
        ],
      });
      
      logger.info("[x402] Payment settled", { txHash, network });
      
      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      
      return { txHash };
    },
  };
}

/**
 * Create CDP facilitator configuration using Coinbase Developer Platform credentials
 */
function createCDPFacilitator(): CDPFacilitator | undefined {
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;

  if (apiKeyId && apiKeySecret) {
    return createFacilitatorConfig(apiKeyId, apiKeySecret);
  }

  return undefined;
}

/**
 * Get appropriate facilitator based on network
 * 
 * - Jeju networks: Decentralized facilitator
 * - Base networks: CDP facilitator (or public fallback)
 */
export function getFacilitator(network?: X402Network): Facilitator {
  const targetNetwork = network || getDefaultNetwork();
  const facilitatorType = getFacilitatorType(targetNetwork);
  const ecosystem = getNetworkEcosystem(targetNetwork);

  // Jeju networks use decentralized facilitator
  if (ecosystem === "jeju" || JEJU_NETWORKS.includes(targetNetwork)) {
    return createDecentralizedFacilitator(targetNetwork);
  }

  // Base networks use CDP facilitator
  if (facilitatorType === "cdp") {
    return createCDPFacilitator();
  }

  // Log warning for public facilitator usage
  if (!facilitatorWarningLogged) {
    facilitatorWarningLogged = true;
    
    if (process.env.NODE_ENV === "production") {
      logger.warn(
        "[x402] PRODUCTION WARNING: Using public facilitator for Base payments. " +
        "This has rate limits. Set CDP_API_KEY_ID and CDP_API_KEY_SECRET. " +
        "Or use Jeju network for decentralized facilitator (no credentials needed)."
      );
    } else {
      logger.info(
        "[x402] Using public facilitator for Base (no CDP credentials). " +
        "For Jeju networks, no credentials are required."
      );
    }
  }

  return undefined;
}

/**
 * Check if x402 facilitator is properly configured for a network
 */
export function isFacilitatorConfigured(network?: X402Network): boolean {
  const targetNetwork = network || getDefaultNetwork();
  const ecosystem = getNetworkEcosystem(targetNetwork);

  // Jeju networks always have facilitator (decentralized)
  if (ecosystem === "jeju" || JEJU_NETWORKS.includes(targetNetwork)) {
    return true;
  }

  // Base networks need CDP credentials
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  return Boolean(apiKeyId && apiKeySecret);
}

/**
 * Check if decentralized facilitator is being used
 */
export function isDecentralizedFacilitator(network?: X402Network): boolean {
  const targetNetwork = network || getDefaultNetwork();
  return JEJU_NETWORKS.includes(targetNetwork);
}

/**
 * Get x402 configuration status for health checks
 */
export function getX402Status() {
  const { 
    X402_ENABLED, 
    X402_RECIPIENT_ADDRESS, 
    isX402Configured, 
    getDefaultNetwork: getNetwork,
    getNetworkEcosystem: getEcosystem,
  } = require("@/lib/config/x402");
  
  const network = getNetwork();
  const ecosystem = getEcosystem(network);
  const isDecentralized = isDecentralizedFacilitator(network);
  
  return {
    enabled: X402_ENABLED,
    configured: isX402Configured(),
    recipientConfigured: X402_RECIPIENT_ADDRESS !== "0x0000000000000000000000000000000000000000",
    facilitatorConfigured: isFacilitatorConfigured(network),
    network,
    ecosystem,
    facilitatorType: isDecentralized ? "decentralized" : (isFacilitatorConfigured(network) ? "cdp" : "public"),
    usingPublicFacilitator: !isDecentralized && !isFacilitatorConfigured(network),
    supportedNetworks: {
      jeju: ["jeju-localnet", "jeju-testnet", "jeju"],
      base: ["base-sepolia", "base"],
    },
  };
}
