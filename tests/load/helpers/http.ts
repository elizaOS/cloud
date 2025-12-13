import http, { type RefinedResponse, type ResponseType } from "k6/http";
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

export function httpGet<T>(path: string, options?: HttpOptions): T | null {
  const res: K6Response = http.get(`${baseUrl}${path}`, {
    headers: options?.headers ?? (options?.public ? publicHeaders : headers),
    tags: options?.tags ?? {},
    timeout: options?.timeout,
  });
  const expected = options?.expectedStatus ?? 200;
  if (!checkStatus(res, expected, `GET ${path}`)) return null;
  return parseBody<T>(res);
}

export function httpPost<T>(path: string, body: string | Record<string, unknown>, options?: HttpOptions): T | null {
  const res: K6Response = http.post(`${baseUrl}${path}`, typeof body === "string" ? body : JSON.stringify(body), {
    headers: options?.headers ?? headers, tags: options?.tags ?? {}, timeout: options?.timeout,
  });
  const expected = options?.expectedStatus ?? 200;
  if (!checkStatus(res, expected, `POST ${path}`)) return null;
  return parseBody<T>(res);
}

export function httpPatch<T>(path: string, body: Record<string, unknown>, options?: HttpOptions): T | null {
  const res: K6Response = http.patch(`${baseUrl}${path}`, JSON.stringify(body), { headers: options?.headers ?? headers, tags: options?.tags ?? {} });
  if (!checkStatus(res, 200, `PATCH ${path}`)) return null;
  return parseBody<T>(res);
}

export function httpDelete(path: string, options?: HttpOptions): boolean {
  const res: K6Response = http.del(`${baseUrl}${path}`, null, { headers: options?.headers ?? headers, tags: options?.tags ?? {} });
  return checkStatus(res, (s) => s >= 200 && s < 300, `DELETE ${path}`);
}

export function httpPostFile<T>(path: string, file: { content: string; name: string; mimeType: string }, options?: HttpOptions): T | null {
  const authHeader = (options?.headers ?? headers).Authorization;
  if (!authHeader) throw new Error("Authorization header required for file upload");
  const res: K6Response = http.post(`${baseUrl}${path}`, { file: http.file(file.content, file.name, file.mimeType) }, {
    headers: { Authorization: authHeader }, tags: options?.tags ?? {},
  });
  if (!checkStatus(res, 200, `POST ${path}`)) return null;
  return parseBody<T>(res);
}
