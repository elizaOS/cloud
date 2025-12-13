import http, { type RefinedResponse, type ResponseType } from "k6/http";
import { check } from "k6";

type K6Response = RefinedResponse<ResponseType | undefined>;

interface JsonRpcResponse {
  result?: Record<string, unknown> | { content?: Array<{ text: string }> };
  error?: { code: number; message: string };
}

export function parseBody<T>(res: K6Response): T {
  if (res.body === null) throw new Error("Response body is null");
  return JSON.parse(res.body as string);
}

export function checkJsonRpc(res: K6Response, name: string): boolean {
  if (res.status !== 200) return false;
  const body = parseBody<JsonRpcResponse>(res);
  return check(null, {
    [`${name} ok`]: () => body.result !== undefined && !body.error,
  });
}

export function parseMcpResult(res: K6Response): Record<string, unknown> {
  const body = parseBody<{ result?: { content?: Array<{ text: string }> } }>(res);
  const text = body.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : {};
}

export function parseA2aResult(res: K6Response): Record<string, unknown> {
  return parseBody<{ result?: Record<string, unknown> }>(res).result ?? {};
}
