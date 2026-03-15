import { NextRequest } from "next/server";

export function jsonRequest(
  url: string,
  method: string,
  body?: unknown,
  headers: HeadersInit = {},
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function routeParams(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

export async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

export function formDataRequest(url: string, formData: FormData) {
  return {
    url,
    formData: async () => formData,
  } as unknown as NextRequest;
}

export function createFile(name: string, type: string, contents: string | Uint8Array = "test") {
  const data = typeof contents === "string" ? new TextEncoder().encode(contents) : contents;
  return new File([data], name, { type });
}
