import { ethers } from 'ethers';
import { createSignedFeedbackAuth } from './cloud-signing';

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface CloudConfig {
  identityRegistryAddress: string;
  reputationRegistryAddress: string;
  cloudReputationProviderAddress: string;
  serviceRegistryAddress: string;
  creditManagerAddress: string;
  provider: ethers.Provider;
  logger: Logger;
  cloudAgentSigner?: ethers.Signer;
  chainId?: bigint;
}

export interface AgentMetadata {
  name: string;
  description: string;
  endpoint: string;
  version: string;
  capabilities: string[];
}

export interface CloudService {
  name: string;
  category: string;
  basePrice: bigint;
  minPrice: bigint;
  maxPrice: bigint;
  x402Enabled: boolean;
  a2aEndpoint?: string;
}

export enum ViolationType {
  API_ABUSE, RESOURCE_EXPLOITATION, SCAMMING, PHISHING, HACKING,
  UNAUTHORIZED_ACCESS, DATA_THEFT, ILLEGAL_CONTENT, HARASSMENT, SPAM, TOS_VIOLATION
}

const IDENTITY_ABI = [
  'function register(string calldata tokenURI, tuple(string key, bytes value)[] calldata metadata) external returns (uint256)',
  'function agentExists(uint256 agentId) external view returns (bool)',
];

const REPUTATION_ABI = [
  'function giveFeedback(uint256 agentId, uint8 score, bytes32 tag1, bytes32 tag2, string calldata fileuri, bytes32 filehash, bytes memory feedbackAuth) external',
  'function getSummary(uint256 agentId, address[] calldata clientAddresses, bytes32 tag1, bytes32 tag2) external view returns (uint64 count, uint8 averageScore)',
];

const CLOUD_PROVIDER_ABI = [
  'function registerCloudAgent(string calldata tokenURI, tuple(string key, bytes value)[] calldata metadata) external returns (uint256)',
  'function setReputation(uint256 agentId, uint8 score, bytes32 tag1, bytes32 tag2, string calldata reason, bytes calldata signedAuth) external',
  'function recordViolation(uint256 agentId, uint8 violationType, uint8 severityScore, string calldata evidence) external',
  'function requestBanViaGovernance(uint256 agentId, uint8 reason) external payable returns (bytes32)',
  'function getAgentViolations(uint256 agentId, uint256 offset, uint256 limit) external view returns (tuple(uint256 agentId, uint8 violationType, uint8 severityScore, string evidence, uint256 timestamp, address reporter)[])',
  'function getAgentViolationCount(uint256 agentId) external view returns (uint256)',
  'function getProviderAgentId() external view returns (uint256)',
];

const SERVICE_ABI = [
  'function registerService(string calldata serviceName, string calldata category, uint256 basePrice, uint256 minPrice, uint256 maxPrice, address provider) external',
  'function getServiceCost(string calldata serviceName, address user) external view returns (uint256)',
];

const CREDIT_ABI = [
  'function hasSufficientCredit(address user, address token, uint256 amount) external view returns (bool, uint256)',
];

export class CloudIntegration {
  private config: CloudConfig;
  private reputationRegistry: ethers.Contract;
  private cloudReputationProvider: ethers.Contract;
  private serviceRegistry: ethers.Contract;
  private creditManager: ethers.Contract;

  constructor(config: CloudConfig) {
    this.config = config;
    this.reputationRegistry = new ethers.Contract(config.reputationRegistryAddress, REPUTATION_ABI, config.provider);
    this.cloudReputationProvider = new ethers.Contract(config.cloudReputationProviderAddress, CLOUD_PROVIDER_ABI, config.provider);
    this.serviceRegistry = new ethers.Contract(config.serviceRegistryAddress, SERVICE_ABI, config.provider);
    this.creditManager = new ethers.Contract(config.creditManagerAddress, CREDIT_ABI, config.provider);
  }

  async registerCloudAgent(signer: ethers.Signer, metadata: AgentMetadata, tokenURI: string): Promise<bigint> {
    const metadataEntries = [
      { key: 'name', value: ethers.toUtf8Bytes(metadata.name) },
      { key: 'description', value: ethers.toUtf8Bytes(metadata.description) },
      { key: 'endpoint', value: ethers.toUtf8Bytes(metadata.endpoint) },
      { key: 'version', value: ethers.toUtf8Bytes(metadata.version) },
      { key: 'capabilities', value: ethers.toUtf8Bytes(JSON.stringify(metadata.capabilities)) },
    ];

    const tx = await this.cloudReputationProvider.connect(signer).registerCloudAgent(tokenURI, metadataEntries);
    const receipt = await tx.wait();
    const event = receipt.logs.find((log: { topics: string[] }) => log.topics[0] === ethers.id('CloudAgentRegistered(uint256)'));
    if (!event) throw new Error('CloudAgentRegistered event not found');
    return BigInt(event.topics[1]);
  }

  async registerServices(signer: ethers.Signer, services: CloudService[]): Promise<void> {
    const contract = this.serviceRegistry.connect(signer);
    const signerAddr = await signer.getAddress();
    for (const s of services) {
      const tx = await contract.registerService(s.name, s.category, s.basePrice, s.minPrice, s.maxPrice, signerAddr);
      await tx.wait();
    }
  }

  async setReputation(
    signer: ethers.Signer,
    agentId: bigint,
    score: number,
    category: string,
    subcategory: string,
    reason: string
  ): Promise<void> {
    if (!this.config.cloudAgentSigner) throw new Error('cloudAgentSigner not configured');

    const signedAuth = await createSignedFeedbackAuth(
      this.config.cloudAgentSigner,
      agentId,
      await signer.getAddress(),
      this.config.reputationRegistryAddress,
      this.config.chainId ?? 31337n
    );

    const tx = await this.cloudReputationProvider.connect(signer).setReputation(
      agentId, score, ethers.encodeBytes32String(category), ethers.encodeBytes32String(subcategory), reason, signedAuth
    );
    await tx.wait();
  }

  async recordViolation(signer: ethers.Signer, agentId: bigint, violationType: ViolationType, severityScore: number, evidence: string): Promise<void> {
    const tx = await this.cloudReputationProvider.connect(signer).recordViolation(agentId, violationType, severityScore, evidence);
    await tx.wait();
  }

  async proposeBan(signer: ethers.Signer, agentId: bigint, violationType: ViolationType): Promise<string> {
    const tx = await this.cloudReputationProvider.connect(signer).requestBanViaGovernance(agentId, violationType);
    const receipt = await tx.wait();
    const event = receipt.logs.find((log: { topics: string[] }) => log.topics[0] === ethers.id('BanProposalRequested(uint256,bytes32,uint8)'));
    if (!event) throw new Error('BanProposalRequested event not found');
    return event.topics[2];
  }

  async checkUserCredit(userAddress: string, serviceName: string, tokenAddress: string): Promise<{ sufficient: boolean; available: bigint; required: bigint }> {
    const required = await this.serviceRegistry.getServiceCost(serviceName, userAddress);
    const [sufficient, available] = await this.creditManager.hasSufficientCredit(userAddress, tokenAddress, required);
    return { sufficient, available, required };
  }

  async getAgentReputation(agentId: bigint, category?: string): Promise<{ count: bigint; averageScore: number }> {
    const tag1 = category ? ethers.encodeBytes32String(category) : ethers.ZeroHash;
    const [count, averageScore] = await this.reputationRegistry.getSummary(agentId, [], tag1, ethers.ZeroHash);
    return { count, averageScore };
  }

  async getAgentViolations(agentId: bigint, offset = 0, limit = 100) {
    return this.cloudReputationProvider.getAgentViolations(agentId, offset, limit);
  }

  async getAgentViolationCount(agentId: bigint): Promise<bigint> {
    return this.cloudReputationProvider.getAgentViolationCount(agentId);
  }

  async getCloudAgentId(): Promise<bigint> {
    return this.cloudReputationProvider.getProviderAgentId();
  }
}

export const defaultCloudServices: CloudService[] = [
  { name: 'chat-completion', category: 'ai', basePrice: ethers.parseEther('0.001'), minPrice: ethers.parseEther('0.0001'), maxPrice: ethers.parseEther('0.01'), x402Enabled: true },
  { name: 'image-generation', category: 'ai', basePrice: ethers.parseEther('0.01'), minPrice: ethers.parseEther('0.001'), maxPrice: ethers.parseEther('0.1'), x402Enabled: true },
  { name: 'embeddings', category: 'ai', basePrice: ethers.parseEther('0.0001'), minPrice: ethers.parseEther('0.00001'), maxPrice: ethers.parseEther('0.001'), x402Enabled: true },
  { name: 'storage', category: 'storage', basePrice: ethers.parseEther('0.0001'), minPrice: ethers.parseEther('0.00001'), maxPrice: ethers.parseEther('0.001'), x402Enabled: true },
  { name: 'compute', category: 'compute', basePrice: ethers.parseEther('0.001'), minPrice: ethers.parseEther('0.0001'), maxPrice: ethers.parseEther('0.01'), x402Enabled: true },
];
