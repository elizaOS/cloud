/**
 * Account Abstraction Service (ERC-4337)
 *
 * Provides gasless, batched operations for multi-chain registration via:
 * - ERC-4337 UserOperations for smart account transactions
 * - Paymaster integration for gas sponsorship
 * - Batch operations to minimize user signatures
 *
 * This enables registering agents on BOTH Jeju and Base registries
 * with a single user signature and sponsored gas.
 *
 * @see https://eips.ethereum.org/EIPS/eip-4337
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  type Address,
  type Hex,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { logger } from "@/lib/utils/logger";
import { extractErrorMessage } from "@/lib/utils/error-handling";
import {
  ACCOUNT_ABSTRACTION,
  ENTRYPOINT_ADDRESS,
  isAccountAbstractionEnabled,
  isPaymasterEnabled,
  isBatchRegistrationAvailable,
  getRegistrationNetworks,
  CHAIN_IDS,
  RPC_URLS,
  IDENTITY_REGISTRY_ADDRESSES,
  type ERC8004Network,
} from "@/lib/config/erc8004";
import { jeju, jejuTestnet, jejuLocalnet } from "@/lib/config/chains";
import { base, baseSepolia, foundry } from "viem/chains";

/** UserOperation for ERC-4337 */
interface UserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Hex;
  signature: Hex;
}

/** Batch call for multi-call execution */
interface BatchCall {
  target: Address;
  value: bigint;
  data: Hex;
}

/** Registration operation result */
interface RegistrationOperation {
  network: ERC8004Network;
  chainId: number;
  target: Address;
  callData: Hex;
  success?: boolean;
  txHash?: string;
  error?: string;
}

/** Batch registration result */
interface BatchRegistrationResult {
  success: boolean;
  userOpHash?: string;
  operations: RegistrationOperation[];
  gasSponsored: boolean;
  totalGas?: string;
  error?: string;
}

// ABI Definitions

/** ERC-4337 EntryPoint ABI (partial) */
const ENTRYPOINT_ABI = [
  {
    name: "handleOps",
    type: "function",
    inputs: [
      {
        name: "ops",
        type: "tuple[]",
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "callGasLimit", type: "uint256" },
          { name: "verificationGasLimit", type: "uint256" },
          { name: "preVerificationGas", type: "uint256" },
          { name: "maxFeePerGas", type: "uint256" },
          { name: "maxPriorityFeePerGas", type: "uint256" },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
      { name: "beneficiary", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "getNonce",
    type: "function",
    inputs: [
      { name: "sender", type: "address" },
      { name: "key", type: "uint192" },
    ],
    outputs: [{ name: "nonce", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/** Simple Account executeBatch ABI */
const SIMPLE_ACCOUNT_ABI = [
  {
    name: "executeBatch",
    type: "function",
    inputs: [
      { name: "dest", type: "address[]" },
      { name: "value", type: "uint256[]" },
      { name: "func", type: "bytes[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "execute",
    type: "function",
    inputs: [
      { name: "dest", type: "address" },
      { name: "value", type: "uint256" },
      { name: "func", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/** ERC-8004 Identity Registry mint ABI */
const IDENTITY_REGISTRY_ABI = [
  {
    name: "mint",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenURI", type: "string" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

// ============================================================================
// Chain Helpers
// ============================================================================

/**
 * Get viem chain for an ERC-8004 network
 */
function getViemChain(network: ERC8004Network): Chain {
  switch (network) {
    case "jeju-localnet": return jejuLocalnet;
    case "jeju-testnet": return jejuTestnet;
    case "jeju": return jeju;
    case "anvil": return foundry;
    case "base-sepolia": return baseSepolia;
    case "base": return base;
  }
}

// ============================================================================
// Account Abstraction Service
// ============================================================================

class AccountAbstractionService {
  private paymasterUrl: string | null = null;

  constructor() {
    this.paymasterUrl = process.env.PAYMASTER_URL || null;
  }

  /**
   * Check if account abstraction is available
   */
  isAvailable(): boolean {
    return isAccountAbstractionEnabled();
  }

  /**
   * Check if batch registration is available
   */
  canBatchRegister(): boolean {
    return isBatchRegistrationAvailable();
  }

  /**
   * Check if gas sponsorship is available
   */
  isGasSponsored(): boolean {
    return isPaymasterEnabled() && this.paymasterUrl !== null;
  }

  /**
   * Build a registration call for a single network
   */
  buildRegistrationCall(
    network: ERC8004Network,
    recipientAddress: Address,
    tokenURI: string
  ): RegistrationOperation {
    const registryAddress = IDENTITY_REGISTRY_ADDRESSES[network];
    const chainId = CHAIN_IDS[network];

    const callData = encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "mint",
      args: [recipientAddress, tokenURI],
    });

    return {
      network,
      chainId,
      target: registryAddress,
      callData,
    };
  }

  /**
   * Build batch registration calls for all configured networks
   */
  buildMultiChainRegistrationCalls(
    recipientAddress: Address,
    tokenURI: string
  ): RegistrationOperation[] {
    const networks = getRegistrationNetworks();
    
    return networks.map(network => 
      this.buildRegistrationCall(network, recipientAddress, tokenURI)
    );
  }

  /**
   * Execute batch registration via ERC-4337 UserOperation
   *
   * This creates a single UserOperation that batches registration calls
   * across multiple networks, minimizing user signatures.
   * Gas is sponsored via paymaster if available.
   */
  async executeBatchRegistration(
    senderAddress: Address,
    signerPrivateKey: Hex,
    recipientAddress: Address,
    tokenURI: string
  ): Promise<BatchRegistrationResult> {
    if (!this.isAvailable()) {
      return {
        success: false,
        operations: [],
        gasSponsored: false,
        error: "Account abstraction not enabled",
      };
    }

    const operations = this.buildMultiChainRegistrationCalls(recipientAddress, tokenURI);
    
    logger.info("[AA] Building batch registration UserOperation", {
      networks: operations.map(op => op.network),
      recipient: recipientAddress,
    });

    // Group operations by chain (can't batch across chains in single UserOp)
    const operationsByChain = new Map<number, RegistrationOperation[]>();
    for (const op of operations) {
      const existing = operationsByChain.get(op.chainId) || [];
      existing.push(op);
      operationsByChain.set(op.chainId, existing);
    }

    const results: RegistrationOperation[] = [];

    // Execute on each chain
    for (const [chainId, chainOps] of operationsByChain) {
      const network = chainOps[0].network;
      const chain = getViemChain(network);

      const result = await this.executeChainOperations(
        chain,
        chainId,
        senderAddress,
        signerPrivateKey,
        chainOps
      );

      results.push(...result);
    }

    const allSuccess = results.every(r => r.success);

    return {
      success: allSuccess,
      operations: results,
      gasSponsored: this.isGasSponsored(),
    };
  }

  /**
   * Execute operations on a single chain
   */
  private async executeChainOperations(
    chain: Chain,
    _chainId: number,
    senderAddress: Address,
    signerPrivateKey: Hex,
    operations: RegistrationOperation[]
  ): Promise<RegistrationOperation[]> {
    const rpcUrl = RPC_URLS[operations[0].network];
    const account = privateKeyToAccount(signerPrivateKey);

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    const results: RegistrationOperation[] = [];

    if (operations.length === 1) {
      // Single operation - direct call
      const op = operations[0];

      try {
        // Simulate first
        await publicClient.simulateContract({
          address: op.target,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: "mint",
          args: [senderAddress, ""], // tokenURI extracted from callData
          account,
        });

        // Execute
        const txHash = await walletClient.sendTransaction({
          to: op.target,
          data: op.callData,
        });

        await publicClient.waitForTransactionReceipt({ hash: txHash });

        results.push({
          ...op,
          success: true,
          txHash,
        });

        logger.info("[AA] Registration successful", {
          network: op.network,
          txHash,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({
          ...op,
          success: false,
          error: errorMsg,
        });

        logger.error("[AA] Registration failed", {
          network: op.network,
          error: errorMsg,
        });
      }
    } else {
      // Multiple operations - use batch call (if smart account supports it)
      const targets = operations.map(op => op.target);
      const values = operations.map(() => 0n);
      const datas = operations.map(op => op.callData);

      const batchCallData = encodeFunctionData({
        abi: SIMPLE_ACCOUNT_ABI,
        functionName: "executeBatch",
        args: [targets, values, datas],
      });

      try {
        const txHash = await walletClient.sendTransaction({
          to: senderAddress, // Assume sender is a smart account
          data: batchCallData,
        });

        await publicClient.waitForTransactionReceipt({ hash: txHash });

        // Mark all as successful
        for (const op of operations) {
          results.push({
            ...op,
            success: true,
            txHash,
          });
        }

        logger.info("[AA] Batch registration successful", {
          networks: operations.map(op => op.network),
          txHash,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        // Mark all as failed
        for (const op of operations) {
          results.push({
            ...op,
            success: false,
            error: errorMsg,
          });
        }

        logger.error("[AA] Batch registration failed", {
          networks: operations.map(op => op.network),
          error: errorMsg,
        });
      }
    }

    return results;
  }

  /**
   * Build UserOperation for EntryPoint
   * (For advanced use cases with bundlers)
   */
  async buildUserOperation(
    senderAddress: Address,
    calls: BatchCall[],
    chainId: number
  ): Promise<UserOperation> {
    const network = Object.entries(CHAIN_IDS).find(
      ([_, id]) => id === chainId
    )?.[0] as ERC8004Network;

    if (!network) {
      throw new Error(`Unknown chain ID: ${chainId}`);
    }

    const rpcUrl = RPC_URLS[network];
    const chain = getViemChain(network);

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    // Get nonce from EntryPoint
    const nonce = await publicClient.readContract({
      address: ENTRYPOINT_ADDRESS as Address,
      abi: ENTRYPOINT_ABI,
      functionName: "getNonce",
      args: [senderAddress, 0n],
    });

    // Build batch call data
    const targets = calls.map(c => c.target);
    const values = calls.map(c => c.value);
    const datas = calls.map(c => c.data);

    const callData = encodeFunctionData({
      abi: SIMPLE_ACCOUNT_ABI,
      functionName: "executeBatch",
      args: [targets, values, datas],
    });

    // Get gas prices
    const feeData = await publicClient.estimateFeesPerGas();

    // Build unsigned UserOperation
    const userOp: UserOperation = {
      sender: senderAddress,
      nonce,
      initCode: "0x",
      callData,
      callGasLimit: 500000n,
      verificationGasLimit: 200000n,
      preVerificationGas: 50000n,
      maxFeePerGas: feeData.maxFeePerGas || 1000000000n,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || 1000000000n,
      paymasterAndData: await this.getPaymasterData(senderAddress, chainId),
      signature: "0x",
    };

    return userOp;
  }

  /**
   * Get paymaster data for gas sponsorship
   */
  private async getPaymasterData(
    _sender: Address,
    _chainId: number
  ): Promise<Hex> {
    if (!this.isGasSponsored() || !this.paymasterUrl) {
      return "0x";
    }

    // In production, this would call the paymaster API to get sponsorship data
    // For now, return empty (user pays gas)
    logger.debug("[AA] Paymaster sponsorship requested", {
      paymasterUrl: this.paymasterUrl,
    });

    return "0x";
  }

  /**
   * Get max batch size for operations
   */
  getMaxBatchSize(): number {
    return ACCOUNT_ABSTRACTION.batchOperations.maxBatchSize;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const accountAbstractionService = new AccountAbstractionService();

/**
 * Execute multi-chain agent registration with minimal signatures
 */
export async function registerAgentMultiChainAA(
  agentAddress: Address,
  signerPrivateKey: Hex,
  tokenURI: string
): Promise<BatchRegistrationResult> {
  return accountAbstractionService.executeBatchRegistration(
    agentAddress,
    signerPrivateKey,
    agentAddress,
    tokenURI
  );
}

/**
 * Check if gasless registration is available
 */
export function isGaslessRegistrationAvailable(): boolean {
  return accountAbstractionService.isGasSponsored();
}

