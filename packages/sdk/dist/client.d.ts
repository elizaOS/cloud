import { CloudApiClient, ElizaCloudHttpClient } from "./http.js";
import { type ApiKeyCreateRequest, type ApiKeyCreateResponse, type ApiKeyListResponse, type AuthPairResponse, type ChatCompletionRequest, type ChatCompletionResponse, type CliLoginPollResponse, type CliLoginStartOptions, type CliLoginStartResponse, type CloudRequestOptions, type ContainerCredentialsResponse, type ContainerGetResponse, type ContainerHealthResponse, type ContainerListResponse, type ContainerQuotaResponse, type CreateContainerRequest, type CreateContainerResponse, type CreateMiladyAgentRequest, type CreateMiladyAgentResponse, type CreditBalanceResponse, type CreditSummaryResponse, type ElizaCloudClientOptions, type EmbeddingsRequest, type EmbeddingsResponse, type EndpointCallOptions, type GenerateImageRequest, type GenerateImageResponse, type GatewayRelayResponse, type HttpMethod, type JobStatus, type MiladyAgentListResponse, type MiladyAgentResponse, type MiladyLifecycleResponse, type ModelListResponse, type OpenApiSpec, type PairingTokenResponse, type PollGatewayRelayResponse, type RegisterGatewayRelaySessionResponse, type ResponsesCreateRequest, type ResponsesCreateResponse, type SnapshotListResponse, type SnapshotType, type UpdateContainerRequest, type UserProfileResponse } from "./types.js";
export declare class ElizaCloudClient {
    readonly http: ElizaCloudHttpClient;
    readonly v1: CloudApiClient;
    readonly baseUrl: string;
    readonly apiBaseUrl: string;
    constructor(options?: ElizaCloudClientOptions);
    setApiKey(apiKey: string | undefined): void;
    setBearerToken(token: string | undefined): void;
    request<TResponse>(method: HttpMethod, path: string, options?: CloudRequestOptions): Promise<TResponse>;
    requestRaw(method: HttpMethod, path: string, options?: CloudRequestOptions): Promise<Response>;
    callEndpoint<TResponse>(method: HttpMethod, pathTemplate: string, options?: EndpointCallOptions): Promise<TResponse>;
    getOpenApiSpec(options?: CloudRequestOptions): Promise<OpenApiSpec>;
    startCliLogin(options?: CliLoginStartOptions): Promise<CliLoginStartResponse>;
    pollCliLogin(sessionId: string): Promise<CliLoginPollResponse>;
    pairWithToken(token: string, origin: string): Promise<AuthPairResponse>;
    listModels(): Promise<ModelListResponse>;
    createResponse(request: ResponsesCreateRequest): Promise<ResponsesCreateResponse>;
    createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
    createEmbeddings(request: EmbeddingsRequest): Promise<EmbeddingsResponse>;
    generateImage(request: GenerateImageRequest): Promise<GenerateImageResponse>;
    getCreditsBalance(options?: {
        fresh?: boolean;
    }): Promise<CreditBalanceResponse>;
    getCreditsSummary(): Promise<CreditSummaryResponse>;
    listContainers(): Promise<ContainerListResponse>;
    createContainer(request: CreateContainerRequest): Promise<CreateContainerResponse>;
    getContainer(containerId: string): Promise<ContainerGetResponse>;
    updateContainer(containerId: string, request: UpdateContainerRequest): Promise<ContainerGetResponse>;
    deleteContainer(containerId: string): Promise<{
        success: boolean;
        message?: string;
    }>;
    getContainerHealth(containerId: string): Promise<ContainerHealthResponse>;
    getContainerMetrics(containerId: string): Promise<Record<string, unknown>>;
    getContainerLogs(containerId: string, tail?: number): Promise<string>;
    getContainerDeployments(containerId: string): Promise<Record<string, unknown>>;
    getContainerQuota(): Promise<ContainerQuotaResponse>;
    createContainerCredentials(request?: Record<string, unknown>): Promise<ContainerCredentialsResponse>;
    listMiladyAgents(): Promise<MiladyAgentListResponse>;
    createMiladyAgent(request: CreateMiladyAgentRequest): Promise<CreateMiladyAgentResponse>;
    getMiladyAgent(agentId: string): Promise<MiladyAgentResponse>;
    updateMiladyAgent(agentId: string, request: Partial<CreateMiladyAgentRequest>): Promise<MiladyAgentResponse>;
    deleteMiladyAgent(agentId: string): Promise<MiladyLifecycleResponse>;
    provisionMiladyAgent(agentId: string): Promise<MiladyLifecycleResponse>;
    suspendMiladyAgent(agentId: string): Promise<MiladyLifecycleResponse>;
    resumeMiladyAgent(agentId: string): Promise<MiladyLifecycleResponse>;
    createMiladyAgentSnapshot(agentId: string, snapshotType?: SnapshotType, metadata?: Record<string, unknown>): Promise<Record<string, unknown>>;
    listMiladyAgentBackups(agentId: string): Promise<SnapshotListResponse>;
    restoreMiladyAgentBackup(agentId: string, backupId?: string): Promise<Record<string, unknown>>;
    getMiladyAgentPairingToken(agentId: string): Promise<PairingTokenResponse>;
    registerGatewayRelaySession(request: {
        runtimeAgentId: string;
        agentName?: string;
    }): Promise<RegisterGatewayRelaySessionResponse>;
    pollGatewayRelayRequest(sessionId: string, timeoutMs?: number): Promise<PollGatewayRelayResponse>;
    submitGatewayRelayResponse(sessionId: string, requestId: string, response: GatewayRelayResponse): Promise<{
        success: boolean;
    }>;
    disconnectGatewayRelaySession(sessionId: string): Promise<{
        success: boolean;
    }>;
    getJob(jobId: string): Promise<JobStatus>;
    pollJob(jobId: string, options?: {
        timeoutMs?: number;
        intervalMs?: number;
    }): Promise<JobStatus>;
    getUser(): Promise<UserProfileResponse>;
    updateUser(request: Record<string, unknown>): Promise<UserProfileResponse>;
    listApiKeys(): Promise<ApiKeyListResponse>;
    createApiKey(request: ApiKeyCreateRequest): Promise<ApiKeyCreateResponse>;
    updateApiKey(apiKeyId: string, request: Partial<ApiKeyCreateRequest>): Promise<unknown>;
    deleteApiKey(apiKeyId: string): Promise<{
        success?: boolean;
        message?: string;
    }>;
    regenerateApiKey(apiKeyId: string): Promise<ApiKeyCreateResponse>;
}
export declare function createElizaCloudClient(options?: ElizaCloudClientOptions): ElizaCloudClient;
//# sourceMappingURL=client.d.ts.map