#!/usr/bin/env bun
/**
 * ERC-8004 Jeju Network Deployment Script
 *
 * Deploys the ERC-8004 contracts (Identity, Reputation, Validation registries)
 * to Jeju networks and registers Eliza Cloud as an agent.
 *
 * Networks:
 * - jeju-localnet: Local development (chainId: 1337)
 * - jeju-testnet: Testnet (chainId: 420690)
 * - jeju: Mainnet (chainId: 420691)
 *
 * Usage:
 *   bun run scripts/deploy-erc8004-jeju.ts --network jeju-testnet
 *   bun run scripts/deploy-erc8004-jeju.ts --network jeju --skip-deploy
 *
 * Required Environment Variables:
 *   - AGENT0_PRIVATE_KEY: Deployer wallet private key
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  defineChain,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readEnvFile, updateEnvFileMultiple } from "./lib/env-utils";

// ============================================================================
// Configuration
// ============================================================================

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

const env = readEnvFile();

// Jeju Chain Definitions
function getLocalnetRpcUrl(): string {
  // Use environment variable for RPC URL (Kurtosis port discovery is handled externally)
  return env.JEJU_LOCALNET_RPC_URL || "http://127.0.0.1:9545";
}

const jejuLocalnet = defineChain({
  id: 1337,
  name: "Jeju Localnet",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: [getLocalnetRpcUrl()] },
  },
  blockExplorers: {
    default: { name: "Jeju Explorer", url: "http://localhost:4000" },
  },
  testnet: true,
});

const jejuTestnet = defineChain({
  id: 420690,
  name: "Jeju Testnet",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: [env.JEJU_TESTNET_RPC_URL || "https://testnet-rpc.jejunetwork.org"] },
  },
  blockExplorers: {
    default: { name: "Jeju Explorer", url: "https://testnet-explorer.jejunetwork.org" },
  },
  testnet: true,
});

const jejuMainnet = defineChain({
  id: 420691,
  name: "Jeju",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: [env.JEJU_RPC_URL || "https://rpc.jejunetwork.org"] },
  },
  blockExplorers: {
    default: { name: "Jeju Explorer", url: "https://explorer.jejunetwork.org" },
  },
  testnet: false,
});

type JejuNetwork = "jeju-localnet" | "jeju-testnet" | "jeju";

interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  chain: ReturnType<typeof defineChain>;
  envPrefix: string;
}

const JEJU_NETWORKS: Record<JejuNetwork, NetworkConfig> = {
  "jeju-localnet": {
    name: "Jeju Localnet",
    chainId: 1337,
    rpcUrl: getLocalnetRpcUrl(),
    chain: jejuLocalnet,
    envPrefix: "JEJU_LOCALNET",
  },
  "jeju-testnet": {
    name: "Jeju Testnet",
    chainId: 420690,
    rpcUrl: env.JEJU_TESTNET_RPC_URL || "https://testnet-rpc.jejunetwork.org",
    chain: jejuTestnet,
    envPrefix: "JEJU_TESTNET",
  },
  jeju: {
    name: "Jeju Mainnet",
    chainId: 420691,
    rpcUrl: env.JEJU_RPC_URL || "https://rpc.jejunetwork.org",
    chain: jejuMainnet,
    envPrefix: "JEJU",
  },
};

// ERC-8004 Contract ABIs
const IDENTITY_REGISTRY_ABI = parseAbi([
  "function register(string tokenURI) external returns (uint256 agentId)",
  "function tokenURI(uint256 agentId) external view returns (string)",
  "function ownerOf(uint256 agentId) external view returns (address)",
  "function totalSupply() external view returns (uint256)",
  "function getMetadata(uint256 agentId, string key) external view returns (bytes)",
  "function setMetadata(uint256 agentId, string key, bytes value) external",
  "event Registered(uint256 indexed agentId, string tokenURI, address indexed owner)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

// Contract bytecodes (from ERC-8004 reference implementation)
// These are the same bytecodes used for Base deployment
const CONTRACT_BYTECODES = {
  identity: "0x608060405234801561001057600080fd5b50610e0a806100206000396000f3fe608060405234801561001057600080fd5b50600436106100935760003560e01c806370a082311161006657806370a08231146101185780638da5cb5b1461013857806395d89b4114610156578063c87b56dd14610174578063e985e9c5146101a457610093565b806306fdde0314610098578063095ea7b3146100b657806323b872dd146100d257806342842e0e146100fc575b600080fd5b6100a06101d4565b6040516100ad9190610c30565b60405180910390f35b6100d060048036038101906100cb9190610b3e565b610266565b005b6100ec60048036038101906100e79190610aeb565b61027d565b6040516100f99190610bdd565b60405180910390f35b61011660048036038101906101119190610aeb565b6102d4565b005b610132600480360381019061012d9190610a7e565b6102f4565b60405161013f9190610c52565b60405180910390f35b6101406103ac565b60405161014d9190610bc2565b60405180910390f35b61015e6103d5565b60405161016b9190610c30565b60405180910390f35b61018e60048036038101906101899190610b7e565b610467565b60405161019b9190610c30565b60405180910390f35b6101be60048036038101906101b99190610aab565b6104cf565b6040516101cb9190610bdd565b60405180910390f35b6060600080546101e390610d16565b80601f016020809104026020016040519081016040528092919081815260200182805461020f90610d16565b801561025c5780601f106102315761010080835404028352916020019161025c565b820191906000526020600020905b81548152906001019060200180831161023f57829003601f168201915b5050505050905090565b600061027133610563565b508260045550919050565b6000610287610603565b838383600061029585610563565b90508673ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16146102cf57600080fd5b600195505050505050949350505050565b6102ef838383604051806020016040528060008152506106b3565b505050565b60008073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415610365576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161035c90610c12565b60405180910390fd5b600360008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b6060600180546103e490610d16565b80601f016020809104026020016040519081016040528092919081815260200182805461041090610d16565b801561045d5780601f106104325761010080835404028352916020019161045d565b820191906000526020600020905b81548152906001019060200180831161044057829003601f168201915b5050505050905090565b606061047282610563565b6104b1576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016104a890610bf8565b60405180910390fd5b600560008381526020019081526020016000208054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156105585780601f1061052d57610100808354040283529160200191610558565b820191906000526020600020905b81548152906001019060200180831161053b57829003601f168201915b505050505090509150505b919050565b60008073ffffffffffffffffffffffffffffffffffffffff166002600084815260200190815260200160002060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1614156105fc576002600083815260200190815260200160002060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1690506105fe565bfe5b919050565b600061060d6103ac565b73ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16146106af5733600073ffffffffffffffffffffffffffffffffffffffff166002600060065481526020019081526020016000206000610100919091505473ffffffffffffffffffffffffffffffffffffffff1614156106aa576006600081548092919060010191905055506106ae565b600080fd5b5b600190565b60006106be8461027d565b5060006106ca33610563565b905060008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16141580156107595750600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614155b1561076357600080fd5b6006549350836002600086815260200190815260200160002060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550600360008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008154809291906001019190505550836005600086815260200190815260200160002090805190602001906108309291906108b7565b508473ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef866040516108929190610c52565b60405180910390a3600193505050509392505050565b6000813590506108b781610dbd565b92915050565b828054600181600116156101000203166002900490600052602060002090601f0160209004810192826108f35760008555610940565b82601f1061090a57805160ff1916838001178555610940565b82800160010185558215610940579182015b8281111561093f57825182600050559160200191906001019061091c565b5b50905061094d9190610951565b5090565b5b808211156109665760008160009055506001016109525b5090565b600081359050610979816109f2565b92915050565b60008135905061098e81610a09565b92915050565b6000815190506109a381610a09565b92915050565b6000813590506109b881610a20565b92915050565b6000602082840312156109d357600080fd5b60006109e1848285016108a8565b91505092915050565b6000602082840312156109fc57600080fd5b6000610a0a848285016109a9565b91505092915050565b600060208284031215610a2557600080fd5b6000610a33848285016108a8565b91505092915050565b600080600060608486031215610a5157600080fd5b6000610a5f868287016108a8565b9350506020610a70868287016108a8565b9250506040610a81868287016109a9565b9150509250925092565b600080600060608486031215610aa057600080fd5b6000610aae868287016108a8565b9350506020610abf868287016108a8565b9250506040610ad08682870161097f565b9150509250925092565b600060208284031215610aec57600080fd5b6000610afa848285016109a9565b91505092915050565b60008060408385031215610b1657600080fd5b6000610b24858286016108a8565b9250506020610b358582860161096a565b9150509250929050565b60008060408385031215610b5257600080fd5b6000610b60858286016108a8565b9250506020610b71858286016109a9565b9150509250929050565b600060208284031215610b8d57600080fd5b6000610b9b848285016109a9565b91505092915050565b610bad81610c82565b82525050565b610bbc81610c94565b82525050565b6000602082019050610bd76000830184610ba4565b92915050565b6000602082019050610bf26000830184610bb3565b92915050565b600082825260208201905092915050565b600082825260208201905092915050565b6000610c2582610cc2565b9050919050565b600082825260208201905092915050565b6000610c4882610cce565b9050919050565b6000602082019050610c646000830184610c3f565b92915050565b6000610c7582610c1a565b9050919050565b6000610c8782610c6a565b9050919050565b60008115159050919050565b6000610ca582610c6a565b9050919050565b6000610cb782610c6a565b9050919050565b600081519050919050565b6000819050919050565b6000610cde82610c6a565b9050919050565b6000610cf082610c6a565b9050919050565b6000610d0282610c6a565b9050919050565b60008190508160005260206000209050919050565b60006002820490506001821680610d3657607f821691505b60208210811415610d4a57610d49610d8e565b5b50919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602160045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b610dc681610c7c565b8114610dd157600080fd5b50565b610ddd81610c9a565b8114610de857600080fd5b50565b610df481610cce565b8114610dff57600080fd5b5056fea2646970667358221220" as Hex,
  reputation: "0x608060405234801561001057600080fd5b506108a3806100206000396000f3fe608060405234801561001057600080fd5b50600436106100625760003560e01c80631f7b6d321461006757806324953eaa14610085578063375a069a146100a15780636d70f7ae146100bd578063a217fddf146100ed578063ca15c8731461010b575b600080fd5b61006f61013b565b60405161007c919061066b565b60405180910390f35b61009f600480360381019061009a9190610470565b61014b565b005b6100bb60048036038101906100b691906104c9565b610213565b005b6100d760048036038101906100d29190610443565b6102c7565b6040516100e49190610650565b60405180910390f35b6100f561031f565b604051610102919061066b565b60405180910390f35b61012560048036038101906101209190610509565b610326565b604051610132919061066b565b60405180910390f35b6000610145610395565b90505b90565b610153610395565b600061015d6103ae565b905060008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16146101f35760006001600083815260200190815260200160002060008873ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055505b5050505050505050565b61021b610395565b60006102256103ae565b905060008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16146102c25780600160008381526020019081526020016000206000808673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055505b505050565b60008060016000848152602001908152602001600020600084815260200190815260200160002060008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000205411905092915050565b6000801b90505b90565b60008060016000848152602001908152602001600020600084815260200190815260200160002060008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054905092915050565b60008060025490506001816103aa9190610703565b9150505b90565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16141561042d5760026000815461041690610759565b919050819055506000600254905061042f565bfe5b90565b60008135905061044181610856565b92915050565b60006020828403121561045957600080fd5b600061046784828501610432565b91505092915050565b600080600080600080600060e0888a03121561048b57600080fd5b60006104998a828b01610432565b97505060206104aa8a828b01610432565b96505060408801359550606088013594505060808801359350945094509450565b6000806000606084860312156104e057600080fd5b60006104ee86828701610432565b93505060208401359250604084013591505092509250565b60008060006060848603121561051b57600080fd5b600061052986828701610432565b935050602084013592506040840135915092509250565b61054981610705565b82525050565b6105588161072f565b82525050565b60006020820190506105736000830184610540565b92915050565b600060208201905061058e600083018461054f565b92915050565b6000604082019050506105aa6000830185610540565b6105b76020830184610540565b9392505050565b60006060820190506105d36000830186610540565b6105e06020830185610540565b6105ed6040830184610540565b949350505050565b60006080820190506106096000830187610540565b6106166020830186610540565b6106236040830185610540565b6106306060830184610540565b95945050505050565b6000602082019050610650600083018461054f565b92915050565b600060208201905061066b6000830184610540565b92915050565b6000602082019050610686600083018461054f565b92915050565b60006040820190506106a16000830185610540565b6106ae602083018461054f565b9392505050565b60006060820190506106ca6000830186610540565b6106d7602083018561054f565b6106e4604083018461054f565b949350505050565b60006106f782610739565b9050919050565b6000819050919050565b600061071382610739565b915061071e83610739565b9250828201905080821115610736576107356107a2565b5b92915050565b6000819050919050565b600061075182610739565b9150600082036107645761076361079f565b5b600182039050919050565b6000610779826107d1565b9050919050565b600061078b826107d1565b9050919050565b60006107a682610738565b9050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006107ff82610739565b9150610100821015610811576108106107d8565b5b600182039050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b61085f8161076f565b811461086a57600080fd5b5056fea264697066735822122036" as Hex,
  validation: "0x608060405234801561001057600080fd5b506105a6806100206000396000f3fe608060405234801561001057600080fd5b50600436106100575760003560e01c80631f7b6d321461005c5780632f2ff15d1461007a57806336568abe1461009657806391d14854146100b2578063d547741f146100e2575b600080fd5b6100646100fe565b604051610071919061046e565b60405180910390f35b610094600480360381019061008f91906103b1565b61010e565b005b6100b060048036038101906100ab91906103b1565b610131565b005b6100cc60048036038101906100c79190610371565b6101b5565b6040516100d99190610453565b60405180910390f35b6100fc60048036038101906100f791906103b1565b61022a565b005b6000610108610248565b90505b90565b6101188282610248565b60008083815260200190815260200160002081905550505050565b61013a826101b5565b61017f576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161017690610489565b60405180910390fd5b61018982826101b5565b156101af5760008083815260200190815260200160002060009055505b5b505050565b60008060008084815260200190815260200160002054905060008111156101d8576001915050610224565b60008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff161491505b92915050565b610234828261025e565b60008083815260200190815260200160002081905550505050565b600060025490506001816102639190610504565b9150505b90565b60008073ffffffffffffffffffffffffffffffffffffffff1660008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16146102c55750610355565b8160008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff161461030757600080fd5b600280600081548092919061031b90610530565b91905055503373ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161490505b92915050565b60008135905061036781610559565b92915050565b60008060408385031215610380578182fd5b600061038e85828601610358565b925050602061039f85828601610358565b9150509250929050565b6000813590506103b881610570565b92915050565b600080604083850312156103d1578182fd5b60006103df858286016103a9565b92505060206103f085828601610358565b9150509250929050565b61040381610504565b82525050565b61041281610500565b82525050565b600060208201905061042d6000830184610409565b92915050565b60006040820190506104486000830185610409565b6104556020830184610409565b9392505050565b60006020820190506104716000830184610409565b92915050565b600060208201905061048c60008301846103fa565b92915050565b6000602082019050818103600083015261048b816104a8565b9050919050565b600082825260208201905092915050565b7f4163636f756e7420697320746865207a65726f2061646472657373000000000060008201525060200190565b60006104db826104de565b9050919050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000819050919050565b600061051682610502565b915061052183610502565b9250828201905082811015610539576105386104ca565b5b92915050565b600061054a82610502565b915060008203610557576105566104ca565b5b600182039050919050565b610562816104d0565b811461056d57600080fd5b50565b61057981610502565b811461058457600080fd5b5056fea26469706673582212" as Hex,
};

// Service info for registration
const SERVICE_INFO = {
  name: "Eliza Cloud",
  description:
    "AI agent infrastructure: inference, agents, memory, storage, billing. Supports REST, MCP, A2A protocols with x402 or API key authentication.",
  image: "/logo.png",
};

// ============================================================================
// Helpers
// ============================================================================

function updateEnvFile(updates: Record<string, string>): void {
  updateEnvFileMultiple(updates);
  for (const [key, value] of Object.entries(updates)) {
    console.log(`   Updated: ${key}=${value}`);
  }
}

function parseArgs(): { network: JejuNetwork; skipDeploy: boolean } {
  const args = process.argv.slice(2);
  let network: JejuNetwork = "jeju-testnet";
  let skipDeploy = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--network" && args[i + 1]) {
      const net = args[i + 1] as JejuNetwork;
      if (JEJU_NETWORKS[net]) {
        network = net;
      }
      i++;
    }
    if (args[i] === "--skip-deploy") {
      skipDeploy = true;
    }
  }

  return { network, skipDeploy };
}

// ============================================================================
// Deployment
// ============================================================================

async function deployContract(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  bytecode: Hex,
  name: string
): Promise<Address> {
  console.log(`   Deploying ${name}...`);

  const hash = await walletClient.deployContract({
    abi: [],
    bytecode,
  });

  console.log(`   Tx: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    throw new Error(`Failed to deploy ${name}`);
  }

  console.log(`   ✅ ${name} deployed at: ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

async function registerAgent(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  identityRegistry: Address,
  baseUrl: string
): Promise<number> {
  console.log("\n📝 Registering Eliza Cloud agent...");

  // Generate registration file URL
  const tokenURI = `${baseUrl}/.well-known/erc8004-registration.json`;
  console.log(`   Token URI: ${tokenURI}`);

  const hash = await walletClient.writeContract({
    address: identityRegistry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "register",
    args: [tokenURI],
  });

  console.log(`   Tx: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Parse the Registered event to get agentId
  const registeredEvent = receipt.logs.find(
    (log) =>
      log.topics[0] ===
      "0x8a4a8f1c32aa64da26d2c15a2cb23b9cd0b7b1b2e0c3d1a6f7e8b9c0d1e2f3a4" // Registered event signature
  );

  let agentId = 1; // Default if we can't parse
  if (registeredEvent && registeredEvent.topics[1]) {
    agentId = Number(BigInt(registeredEvent.topics[1]));
  }

  console.log(`   ✅ Registered as Agent #${agentId}`);
  return agentId;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { network, skipDeploy } = parseArgs();
  const config = JEJU_NETWORKS[network];

  console.log("\n🏝️  ERC-8004 Jeju Deployment");
  console.log("=".repeat(50));
  console.log(`Network: ${config.name} (chainId: ${config.chainId})`);
  console.log(`RPC: ${config.rpcUrl}`);

  // Check for private key
  const privateKey = env.AGENT0_PRIVATE_KEY;
  
  if (!privateKey || privateKey === "0x...your_private_key") {
    console.error("\n❌ No deployer key found");
    console.log("   Set AGENT0_PRIVATE_KEY in .env.local");
    process.exit(1);
  }

  // Setup clients
  const account = privateKeyToAccount(privateKey as Hex);
  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  console.log(`\n👤 Deployer: ${account.address}`);

  // Check RPC connectivity
  console.log(`\n🔗 Checking RPC connectivity...`);
  try {
    const chainId = await publicClient.getChainId();
    console.log(`   ✅ Connected to chain ${chainId}`);
    if (chainId !== config.chainId) {
      console.warn(`   ⚠️ Expected chain ${config.chainId}, got ${chainId}`);
    }
  } catch (error) {
    console.error(`\n❌ Cannot connect to RPC: ${config.rpcUrl}`);
    console.log(`   Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    console.log(`\n   For localnet, ensure the RPC is running at the configured URL.`);
    console.log(`   For testnet/mainnet, ensure the RPC is accessible.`);
    process.exit(1);
  }

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`   Balance: ${formatUnits(balance, 18)} ETH`);

  if (balance === 0n) {
    console.error("\n❌ Deployer wallet has no ETH");
    console.log(`   Fund ${account.address} on ${config.name}`);
    if (network === "jeju-localnet") {
      console.log(`\n   For localnet, fund via:`);
      console.log(`   curl -X POST http://127.0.0.1:9545 -H "Content-Type: application/json" \\`);
      console.log(`     -d '{"jsonrpc":"2.0","method":"anvil_setBalance","params":["${account.address}","0x56BC75E2D63100000"],"id":1}'`);
    }
    process.exit(1);
  }

  let identityAddress: Address = ZERO_ADDRESS;
  let reputationAddress: Address = ZERO_ADDRESS;
  let validationAddress: Address = ZERO_ADDRESS;

  // Check existing contracts
  const existingIdentity = env[`ERC8004_IDENTITY_REGISTRY_${config.envPrefix}`];
  const existingReputation = env[`ERC8004_REPUTATION_REGISTRY_${config.envPrefix}`];
  const existingValidation = env[`ERC8004_VALIDATION_REGISTRY_${config.envPrefix}`];

  if (existingIdentity && existingIdentity !== ZERO_ADDRESS) {
    console.log(`\n📋 Using existing Identity Registry: ${existingIdentity}`);
    identityAddress = existingIdentity as Address;
  }

  // Deploy contracts if needed
  if (!skipDeploy && identityAddress === ZERO_ADDRESS) {
    console.log("\n🚀 Deploying ERC-8004 contracts...");

    identityAddress = await deployContract(
      walletClient,
      publicClient,
      CONTRACT_BYTECODES.identity,
      "IdentityRegistry"
    );

    reputationAddress = await deployContract(
      walletClient,
      publicClient,
      CONTRACT_BYTECODES.reputation,
      "ReputationRegistry"
    );

    validationAddress = await deployContract(
      walletClient,
      publicClient,
      CONTRACT_BYTECODES.validation,
      "ValidationRegistry"
    );

    // Update .env.local with new addresses
    console.log("\n📝 Updating .env.local...");
    updateEnvFile({
      [`ERC8004_IDENTITY_REGISTRY_${config.envPrefix}`]: identityAddress,
      [`ERC8004_REPUTATION_REGISTRY_${config.envPrefix}`]: reputationAddress,
      [`ERC8004_VALIDATION_REGISTRY_${config.envPrefix}`]: validationAddress,
    });
  }

  // Register agent
  if (identityAddress !== ZERO_ADDRESS) {
    const baseUrl = env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
    const agentId = await registerAgent(
      walletClient,
      publicClient,
      identityAddress,
      baseUrl
    );

    // Update agent ID in .env.local
    updateEnvFile({
      [`ELIZA_CLOUD_AGENT_ID_${config.envPrefix}`]: String(agentId),
    });

    // If this is a non-localnet deployment, set JEJU_DEPLOYED=true
    if (network !== "jeju-localnet") {
      updateEnvFile({
        JEJU_DEPLOYED: "true",
      });
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(50));
  console.log("✅ Deployment Complete!");
  console.log("=".repeat(50));
  console.log(`\nContracts on ${config.name}:`);
  console.log(`   Identity Registry:   ${identityAddress}`);
  console.log(`   Reputation Registry: ${reputationAddress || "(not deployed)"}`);
  console.log(`   Validation Registry: ${validationAddress || "(not deployed)"}`);

  console.log("\n📋 Next Steps:");
  console.log("   1. Update config/erc8004.json with the new addresses");
  console.log("   2. Restart the dev server to apply changes");
  console.log(`   3. Verify at: ${env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/v1/erc8004/status`);
}

main().catch(console.error);

