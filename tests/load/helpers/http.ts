import http, { type RefinedResponse, type ResponseType, type Params } from "k6/http";
import { check } from "k6";
import { getBaseUrl } from "../config/environments";
import { getAuthHeaders, getPublicHeaders } from "./auth";
import { parseBody } from "./assertions";
import { recordHttpError } from "./metrics";

type K6Response = RefinedResponse<ResponseType | undefined>;

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();
const publicHeaders = getPublicHeaders();

function checkStatus(res: K6Response, expected: number | ((status: number) => boolean), name: string): boolean {
  const predicate = typeof expected === "function" ? expected : (s: number) => s === expected;
  if (!check(res, { [`${name} ${res.status}`]: (r) => predicate(r.status) })) {
    recordHttpError(res.status);
    return false;
  }
  return true;
}

interface HttpOptions {
  public?: boolean;
  expectedStatus?: number;
  tags?: Record<string, string>;
  timeout?: string;
  headers?: Record<string, string>;
}

function buildParams(options: HttpOptions | undefined, defaultHeaders: Record<string, string>): Params {
  const params: Params = {
    headers: options?.headers ?? defaultHeaders,
    tags: options?.tags ?? {},
  };
  if (options?.timeout) params.timeout = options.timeout;
  return params;
}

export function httpGet<T>(path: string, options?: HttpOptions): T | null {
  const defaultHeaders = options?.public ? publicHeaders : headers;
  const res: K6Response = http.get(`${baseUrl}${path}`, buildParams(options, defaultHeaders));
  const expected = options?.expectedStatus ?? 200;
  if (!checkStatus(res, expected, `GET ${path}`)) return null;
  return parseBody<T>(res);
}

export function httpPost<T>(path: string, body: string | Record<string, unknown>, options?: HttpOptions): T | null {
  const res: K6Response = http.post(`${baseUrl}${path}`, typeof body === "string" ? body : JSON.stringify(body), buildParams(options, headers));
  const expected = options?.expectedStatus ?? 200;
  if (!checkStatus(res, expected, `POST ${path}`)) return null;
  return parseBody<T>(res);
}

export function httpPatch<T>(path: string, body: Record<string, unknown>, options?: HttpOptions): T | null {
  const res: K6Response = http.patch(`${baseUrl}${path}`, JSON.stringify(body), buildParams(options, headers));
  if (!checkStatus(res, 200, `PATCH ${path}`)) return null;
  return parseBody<T>(res);
}

export function httpDelete(path: string, options?: HttpOptions): boolean {
  const res: K6Response = http.del(`${baseUrl}${path}`, null, buildParams(options, headers));
  return checkStatus(res, (s) => s >= 200 && s < 300, `DELETE ${path}`);
}

export function httpPostFile<T>(path: string, file: { content: string; name: string; mimeType: string }, options?: HttpOptions): T | null {
  const authHeader = (options?.headers ?? headers).Authorization;
  if (!authHeader) throw new Error("Authorization header required for file upload");
  const params = buildParams(options, { Authorization: authHeader });
  params.headers = { Authorization: authHeader };
  const res: K6Response = http.post(`${baseUrl}${path}`, { file: http.file(file.content, file.name, file.mimeType) }, params);
  if (!checkStatus(res, 200, `POST ${path}`)) return null;
  return parseBody<T>(res);
}
