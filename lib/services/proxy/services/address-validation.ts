const SUPPORTED_CHAINS = new Set([
  "solana",
  "ethereum",
  "arbitrum",
  "avalanche",
  "bsc",
  "optimism",
  "polygon",
  "base",
  "zksync",
  "sui",
]);

const EVM_CHAINS = new Set([
  "ethereum",
  "arbitrum",
  "avalanche",
  "bsc",
  "optimism",
  "polygon",
  "base",
  "zksync",
]);

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const SUI_ADDRESS_REGEX = /^0x[a-fA-F0-9]{64}$/;

export function isValidChain(chain: string): boolean {
  return SUPPORTED_CHAINS.has(chain.toLowerCase());
}

export function isValidAddress(chain: string, address: string): boolean {
  const normalizedChain = chain.toLowerCase();

  if (!isValidChain(normalizedChain)) {
    return false;
  }

  if (normalizedChain === "solana") {
    return SOLANA_ADDRESS_REGEX.test(address);
  }

  if (EVM_CHAINS.has(normalizedChain)) {
    return EVM_ADDRESS_REGEX.test(address);
  }

  if (normalizedChain === "sui") {
    return SUI_ADDRESS_REGEX.test(address);
  }

  return false;
}

export function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== "string") {
    return false;
  }

  if (address.length < 32 || address.length > 44) {
    return false;
  }

  return SOLANA_ADDRESS_REGEX.test(address);
}
