import { ethers } from 'ethers';

/**
 * Cloud Reputation Signing Utilities
 * 
 * Creates properly signed feedback authorizations for CloudReputationProvider.
 * Uses EIP-191 personal sign for EOA wallets and ERC-1271 for smart contract wallets.
 */

// ABI types for FeedbackAuth struct encoding (defined once, used everywhere)
const FEEDBACK_AUTH_ABI = ['uint256', 'address', 'uint64', 'uint256', 'uint256', 'address', 'address'] as const;
const UINT64_MAX = BigInt('18446744073709551615');
const AUTH_EXPIRY_SECONDS = 86400; // 24 hours

export interface FeedbackAuthData {
  agentId: bigint;
  clientAddress: string;
  indexLimit: bigint;
  expiry: bigint;
  chainId: bigint;
  identityRegistry: string;
  signerAddress: string;
}

/** Encode FeedbackAuthData to ABI-encoded bytes */
function encodeAuthData(data: FeedbackAuthData): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(FEEDBACK_AUTH_ABI, [
    data.agentId,
    data.clientAddress,
    data.indexLimit,
    data.expiry,
    data.chainId,
    data.identityRegistry,
    data.signerAddress
  ]);
}

/**
 * Create and sign feedback authorization
 * 
 * @param signer Cloud agent's signer
 * @param agentId Target agent receiving feedback
 * @param clientAddress Cloud service address giving feedback
 * @param reputationRegistryAddress ReputationRegistry contract address
 * @param chainId Network chain ID (default: 31337 for local)
 * @returns Signed authorization bytes for setReputation()
 */
export async function createSignedFeedbackAuth(
  signer: ethers.Signer,
  agentId: bigint,
  clientAddress: string,
  reputationRegistryAddress: string,
  chainId: bigint = 31337n
): Promise<string> {
  const authData: FeedbackAuthData = {
    agentId,
    clientAddress,
    indexLimit: UINT64_MAX,
    expiry: BigInt(Math.floor(Date.now() / 1000) + AUTH_EXPIRY_SECONDS),
    chainId,
    identityRegistry: reputationRegistryAddress,
    signerAddress: await signer.getAddress()
  };
  
  const encodedData = encodeAuthData(authData);
  const structHash = ethers.keccak256(encodedData);
  const signature = await signer.signMessage(ethers.getBytes(structHash));
  const sig = ethers.Signature.from(signature);
  
  return ethers.concat([encodedData, sig.r, sig.s, ethers.toBeHex(sig.v, 1)]);
}

/**
 * Batch create signed authorizations for multiple agents
 */
export async function createBatchSignedAuths(
  signer: ethers.Signer,
  agentIds: bigint[],
  clientAddress: string,
  reputationRegistryAddress: string,
  chainId: bigint = 31337n
): Promise<Map<bigint, string>> {
  const auths = new Map<bigint, string>();
  for (const agentId of agentIds) {
    auths.set(agentId, await createSignedFeedbackAuth(signer, agentId, clientAddress, reputationRegistryAddress, chainId));
  }
  return auths;
}

// Signature extraction constants
const STRUCT_DATA_HEX_LENGTH = 2 + 224 * 2; // 0x prefix + 224 bytes as hex
const SIG_R_START = -130;
const SIG_S_START = -66;
const SIG_V_START = -2;

/**
 * Verify a signed feedback authorization (for testing)
 */
export function verifyFeedbackAuth(signedAuth: string, expectedSigner: string): boolean {
  const structData = signedAuth.slice(0, STRUCT_DATA_HEX_LENGTH);
  const r = '0x' + signedAuth.slice(SIG_R_START, SIG_S_START);
  const s = '0x' + signedAuth.slice(SIG_S_START, SIG_V_START);
  const v = parseInt(signedAuth.slice(SIG_V_START), 16);
  
  const decoded = ethers.AbiCoder.defaultAbiCoder().decode(FEEDBACK_AUTH_ABI, structData);
  const structHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(FEEDBACK_AUTH_ABI, decoded));
  const messageHash = ethers.hashMessage(ethers.getBytes(structHash));
  const recoveredSigner = ethers.recoverAddress(messageHash, { r, s, v });
  
  return recoveredSigner.toLowerCase() === expectedSigner.toLowerCase();
}
