import { check } from "k6";
import { Response } from "k6/http";

interface JsonRpcResponse {
  result?: Record<string, unknown> | { content?: Array<{ text: string }> };
  error?: { code: number; message: string };
}

export function parseBody<T>(res: { body: string | ArrayBuffer }): T {
  return JSON.parse(res.body as string);
}

export function checkJsonRpc(res: Response, name: string): boolean {
  if (res.status !== 200) return false;
  const body = parseBody<JsonRpcResponse>(res);
  return check(null, {
    [`${name} ok`]: () => body.result !== undefined && !body.error,
  });
}

export function parseMcpResult(res: Response): Record<string, unknown> {
  const body = parseBody<{ result?: { content?: Array<{ text: string }> } }>(res);
  const text = body.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : {};
}

export function parseA2aResult(res: Response): Record<string, unknown> {
  return parseBody<{ result?: Record<string, unknown> }>(res).result || {};
}
