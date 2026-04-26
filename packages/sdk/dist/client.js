import { CloudApiClient, ElizaCloudHttpClient } from "./http.js";
import { ElizaCloudPublicRoutesClient } from "./public-routes.js";
import { DEFAULT_ELIZA_CLOUD_API_BASE_URL, DEFAULT_ELIZA_CLOUD_BASE_URL, } from "./types.js";
function trimTrailingSlash(value) {
    return value.replace(/\/+$/, "");
}
function encodePathParam(value) {
    return encodeURIComponent(String(value));
}
function withPathParams(path, params) {
    if (!params)
        return path;
    return path.replace(/\{([^}]+)\}/g, (_match, key) => {
        const value = params[key];
        if (value === undefined) {
            throw new Error(`Missing path parameter: ${key}`);
        }
        return encodePathParam(value);
    });
}
function getCryptoRandomUuid() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
export class ElizaCloudClient {
    http;
    v1;
    routes;
    baseUrl;
    apiBaseUrl;
    constructor(options = {}) {
        this.baseUrl = trimTrailingSlash(options.baseUrl ?? DEFAULT_ELIZA_CLOUD_BASE_URL);
        this.apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? DEFAULT_ELIZA_CLOUD_API_BASE_URL);
        this.http = new ElizaCloudHttpClient({
            ...options,
            baseUrl: this.baseUrl,
        });
        this.v1 = new CloudApiClient(this.apiBaseUrl, options.apiKey);
        this.v1.setBearerToken(options.bearerToken);
        this.routes = new ElizaCloudPublicRoutesClient(this);
    }
    setApiKey(apiKey) {
        this.http.setApiKey(apiKey);
        this.v1.setApiKey(apiKey);
    }
    setBearerToken(token) {
        this.http.setBearerToken(token);
        this.v1.setBearerToken(token);
    }
    request(method, path, options) {
        return this.http.request(method, path, options);
    }
    requestRaw(method, path, options) {
        return this.http.requestRaw(method, path, options);
    }
    callEndpoint(method, pathTemplate, options = {}) {
        const { pathParams, ...requestOptions } = options;
        return this.request(method, withPathParams(pathTemplate, pathParams), requestOptions);
    }
    getOpenApiSpec(options = {}) {
        return this.request("GET", "/api/openapi.json", options);
    }
    startCliLogin(options = {}) {
        const sessionId = options.sessionId ?? getCryptoRandomUuid();
        const query = options.returnTo ? `?returnTo=${encodeURIComponent(options.returnTo)}` : "";
        const browserUrl = `${this.baseUrl}/auth/cli-login?session=${encodeURIComponent(sessionId)}${query}`;
        return this.request("POST", "/api/auth/cli-session", {
            json: { sessionId },
            skipAuth: true,
        }).then((response) => ({
            sessionId,
            browserUrl,
            status: response.status,
            expiresAt: response.expiresAt,
        }));
    }
    pollCliLogin(sessionId) {
        return this.request("GET", `/api/auth/cli-session/${encodePathParam(sessionId)}`, { skipAuth: true });
    }
    pairWithToken(token, origin) {
        return this.request("POST", "/api/auth/pair", {
            json: { token },
            headers: { Origin: origin },
            skipAuth: true,
        });
    }
    listModels() {
        return this.v1.get("/models", { skipAuth: true });
    }
    createResponse(request) {
        return this.v1.post("/responses", request);
    }
    createChatCompletion(request) {
        return this.v1.post("/chat/completions", request);
    }
    createEmbeddings(request) {
        return this.v1.post("/embeddings", request);
    }
    generateImage(request) {
        return this.v1.post("/generate-image", request);
    }
    getCreditsBalance(options = {}) {
        return this.request("GET", "/api/v1/credits/balance", {
            query: options.fresh === undefined ? undefined : { fresh: options.fresh },
        });
    }
    getCreditsSummary() {
        return this.request("GET", "/api/v1/credits/summary");
    }
    listContainers() {
        return this.request("GET", "/api/v1/containers");
    }
    createContainer(request) {
        return this.request("POST", "/api/v1/containers", {
            json: request,
        });
    }
    getContainer(containerId) {
        return this.request("GET", `/api/v1/containers/${encodePathParam(containerId)}`);
    }
    updateContainer(containerId, request) {
        return this.request("PATCH", `/api/v1/containers/${encodePathParam(containerId)}`, { json: request });
    }
    deleteContainer(containerId) {
        return this.request("DELETE", `/api/v1/containers/${encodePathParam(containerId)}`);
    }
    getContainerHealth(containerId) {
        return this.request("GET", `/api/v1/containers/${encodePathParam(containerId)}/health`);
    }
    getContainerMetrics(containerId) {
        return this.request("GET", `/api/v1/containers/${encodePathParam(containerId)}/metrics`);
    }
    getContainerLogs(containerId, tail) {
        return this.requestRaw("GET", `/api/v1/containers/${encodePathParam(containerId)}/logs`, {
            query: tail === undefined ? undefined : { tail },
        }).then(async (response) => {
            if (!response.ok) {
                await this.http.request("GET", `/api/v1/containers/${encodePathParam(containerId)}/logs`, {
                    query: tail === undefined ? undefined : { tail },
                });
            }
            return response.text();
        });
    }
    getContainerDeployments(containerId) {
        return this.request("GET", `/api/v1/containers/${encodePathParam(containerId)}/deployments`);
    }
    getContainerQuota() {
        return this.request("GET", "/api/v1/containers/quota");
    }
    createContainerCredentials(request = {}) {
        return this.request("POST", "/api/v1/containers/credentials", {
            json: request,
        });
    }
    listMiladyAgents() {
        return this.request("GET", "/api/v1/milady/agents");
    }
    createMiladyAgent(request) {
        return this.request("POST", "/api/v1/milady/agents", {
            json: request,
        });
    }
    getMiladyAgent(agentId) {
        return this.request("GET", `/api/v1/milady/agents/${encodePathParam(agentId)}`);
    }
    updateMiladyAgent(agentId, request) {
        return this.request("PATCH", `/api/v1/milady/agents/${encodePathParam(agentId)}`, { json: request });
    }
    deleteMiladyAgent(agentId) {
        return this.request("DELETE", `/api/v1/milady/agents/${encodePathParam(agentId)}`);
    }
    provisionMiladyAgent(agentId) {
        return this.request("POST", `/api/v1/milady/agents/${encodePathParam(agentId)}/provision`);
    }
    suspendMiladyAgent(agentId) {
        return this.request("POST", `/api/v1/milady/agents/${encodePathParam(agentId)}/suspend`);
    }
    resumeMiladyAgent(agentId) {
        return this.request("POST", `/api/v1/milady/agents/${encodePathParam(agentId)}/resume`);
    }
    createMiladyAgentSnapshot(agentId, snapshotType = "manual", metadata) {
        return this.request("POST", `/api/v1/milady/agents/${encodePathParam(agentId)}/snapshot`, {
            json: { snapshotType, metadata },
        });
    }
    listMiladyAgentBackups(agentId) {
        return this.request("GET", `/api/v1/milady/agents/${encodePathParam(agentId)}/backups`);
    }
    restoreMiladyAgentBackup(agentId, backupId) {
        return this.request("POST", `/api/v1/milady/agents/${encodePathParam(agentId)}/restore`, {
            json: backupId ? { backupId } : {},
        });
    }
    getMiladyAgentPairingToken(agentId) {
        return this.request("POST", `/api/v1/milady/agents/${encodePathParam(agentId)}/pairing-token`).then((response) => ("data" in response ? response.data : response));
    }
    registerGatewayRelaySession(request) {
        return this.v1.post("/milady/gateway-relay/sessions", request);
    }
    pollGatewayRelayRequest(sessionId, timeoutMs) {
        return this.v1.get(`/milady/gateway-relay/sessions/${encodePathParam(sessionId)}/next`, { query: timeoutMs === undefined ? undefined : { timeoutMs } });
    }
    submitGatewayRelayResponse(sessionId, requestId, response) {
        return this.v1.post(`/milady/gateway-relay/sessions/${encodePathParam(sessionId)}/responses`, {
            requestId,
            response,
        });
    }
    disconnectGatewayRelaySession(sessionId) {
        return this.v1.delete(`/milady/gateway-relay/sessions/${encodePathParam(sessionId)}`);
    }
    getJob(jobId) {
        return this.request("GET", `/api/v1/jobs/${encodePathParam(jobId)}`);
    }
    async pollJob(jobId, options = {}) {
        const timeoutMs = options.timeoutMs ?? 120_000;
        const intervalMs = options.intervalMs ?? 2_000;
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const job = await this.getJob(jobId);
            if (job.status === "completed" || job.status === "failed") {
                return job;
            }
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        throw new Error(`Timed out waiting for Eliza Cloud job ${jobId}`);
    }
    getUser() {
        return this.request("GET", "/api/v1/user");
    }
    updateUser(request) {
        return this.request("PATCH", "/api/v1/user", { json: request });
    }
    listApiKeys() {
        return this.request("GET", "/api/v1/api-keys");
    }
    createApiKey(request) {
        return this.request("POST", "/api/v1/api-keys", { json: request });
    }
    updateApiKey(apiKeyId, request) {
        return this.request("PATCH", `/api/v1/api-keys/${encodePathParam(apiKeyId)}`, {
            json: request,
        });
    }
    deleteApiKey(apiKeyId) {
        return this.request("DELETE", `/api/v1/api-keys/${encodePathParam(apiKeyId)}`);
    }
    regenerateApiKey(apiKeyId) {
        return this.request("POST", `/api/v1/api-keys/${encodePathParam(apiKeyId)}/regenerate`);
    }
}
export function createElizaCloudClient(options) {
    return new ElizaCloudClient(options);
}
