import { DEFAULT_ELIZA_CLOUD_API_BASE_URL, } from "./types.js";
function trimTrailingSlash(value) {
    return value.replace(/\/+$/, "");
}
function ensureLeadingSlash(value) {
    return value.startsWith("/") ? value : `/${value}`;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function appendQuery(url, query) {
    if (!query)
        return url;
    const params = query instanceof URLSearchParams ? query : new URLSearchParams();
    if (!(query instanceof URLSearchParams)) {
        for (const [key, value] of Object.entries(query)) {
            appendQueryValue(params, key, value);
        }
    }
    for (const [key, value] of params) {
        url.searchParams.append(key, value);
    }
    return url;
}
function appendQueryValue(params, key, value) {
    if (Array.isArray(value)) {
        for (const item of value) {
            appendQueryValue(params, key, item);
        }
        return;
    }
    if (value === null || value === undefined)
        return;
    params.append(key, String(value));
}
function resolveUrl(baseUrl, path, query) {
    const url = /^https?:\/\//i.test(path)
        ? new URL(path)
        : new URL(`${trimTrailingSlash(baseUrl)}${ensureLeadingSlash(path)}`);
    return appendQuery(url, query).toString();
}
async function parseResponseBody(response) {
    const text = await response.text();
    if (!text)
        return undefined;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
        return text;
    }
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
function normalizeErrorBody(status, statusText, body) {
    if (isRecord(body)) {
        const rawError = body.error;
        const error = typeof rawError === "string"
            ? rawError
            : isRecord(rawError) && typeof rawError.message === "string"
                ? rawError.message
                : typeof body.message === "string"
                    ? body.message
                    : `HTTP ${status}: ${statusText}`;
        return {
            success: false,
            error,
            details: isRecord(body.details) ? body.details : undefined,
            requiredCredits: typeof body.requiredCredits === "number" ? body.requiredCredits : undefined,
            quota: isQuota(body.quota) ? body.quota : undefined,
        };
    }
    return {
        success: false,
        error: typeof body === "string" && body.trim()
            ? `HTTP ${status}: ${body}`
            : `HTTP ${status}: ${statusText}`,
    };
}
function isQuota(value) {
    return isRecord(value) && typeof value.current === "number" && typeof value.max === "number";
}
function timeoutSignal(timeoutMs, signal) {
    if (signal)
        return signal;
    if (!timeoutMs)
        return undefined;
    return AbortSignal.timeout(timeoutMs);
}
export class CloudApiError extends Error {
    statusCode;
    errorBody;
    constructor(statusCode, body) {
        super(body.error);
        this.name = "CloudApiError";
        this.statusCode = statusCode;
        this.errorBody = body;
    }
}
export class InsufficientCreditsError extends CloudApiError {
    requiredCredits;
    constructor(body) {
        super(402, body);
        this.name = "InsufficientCreditsError";
        this.requiredCredits = body.requiredCredits ?? 0;
    }
}
export class ElizaCloudHttpClient {
    baseUrl;
    apiKey;
    bearerToken;
    fetchImpl;
    defaultHeaders;
    constructor(options = {}) {
        this.baseUrl = trimTrailingSlash(options.baseUrl ?? DEFAULT_ELIZA_CLOUD_API_BASE_URL);
        this.apiKey = options.apiKey;
        this.bearerToken = options.bearerToken;
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.defaultHeaders = options.defaultHeaders;
    }
    setApiKey(key) {
        this.apiKey = key;
    }
    setBearerToken(token) {
        this.bearerToken = token;
    }
    setBaseUrl(url) {
        this.baseUrl = trimTrailingSlash(url);
    }
    getBaseUrl() {
        return this.baseUrl;
    }
    getApiKey() {
        return this.apiKey;
    }
    buildWsUrl(path) {
        return `${this.baseUrl.replace(/^http/, "ws")}${ensureLeadingSlash(path)}`;
    }
    buildUrl(path, query) {
        return resolveUrl(this.baseUrl, path, query);
    }
    async requestRaw(method, path, options = {}) {
        const headers = new Headers(this.defaultHeaders);
        const optionHeaders = new Headers(options.headers);
        for (const [key, value] of optionHeaders) {
            headers.set(key, value);
        }
        if (!options.skipAuth) {
            const token = this.bearerToken ?? this.apiKey;
            if (token) {
                headers.set("Authorization", `Bearer ${token}`);
            }
            if (this.apiKey) {
                headers.set("X-API-Key", this.apiKey);
            }
        }
        const init = {
            method,
            headers,
            signal: timeoutSignal(options.timeoutMs, options.signal),
        };
        if (options.json !== undefined) {
            if (!headers.has("Content-Type")) {
                headers.set("Content-Type", "application/json");
            }
            init.body = JSON.stringify(options.json);
        }
        else if (options.body !== undefined) {
            init.body = options.body;
        }
        return this.fetchImpl(this.buildUrl(path, options.query), init);
    }
    async request(method, path, options = {}) {
        const response = await this.requestRaw(method, path, options);
        const body = await parseResponseBody(response);
        if (!response.ok) {
            const errorBody = normalizeErrorBody(response.status, response.statusText, body);
            throw response.status === 402
                ? new InsufficientCreditsError(errorBody)
                : new CloudApiError(response.status, errorBody);
        }
        if (body === undefined || typeof body === "string") {
            return { success: true };
        }
        return body;
    }
    async get(path, options) {
        return this.request("GET", path, options);
    }
    async post(path, body, options = {}) {
        return this.request("POST", path, { ...options, json: body });
    }
    async put(path, body, options = {}) {
        return this.request("PUT", path, { ...options, json: body });
    }
    async patch(path, body, options = {}) {
        return this.request("PATCH", path, { ...options, json: body });
    }
    async delete(path, options) {
        return this.request("DELETE", path, options);
    }
}
export class CloudApiClient extends ElizaCloudHttpClient {
    constructor(baseUrl = DEFAULT_ELIZA_CLOUD_API_BASE_URL, apiKey) {
        super({ baseUrl, apiKey });
    }
    async postUnauthenticated(path, body) {
        return this.post(path, body, { skipAuth: true });
    }
}
