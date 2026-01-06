/**
 * SDK templates that get injected into sandbox apps.
 * These are string templates because they're written as files into the sandbox filesystem.
 */

export const ELIZA_SDK_FILE = `const apiKey = process.env.NEXT_PUBLIC_ELIZA_API_KEY || '';
const apiBase = process.env.NEXT_PUBLIC_ELIZA_API_URL || 'https://elizacloud.ai';
const appId = process.env.NEXT_PUBLIC_ELIZA_APP_ID || '';
const proxyUrl = process.env.NEXT_PUBLIC_ELIZA_PROXY_URL || ''; // For local dev without ngrok

interface ChatMessage {
  role: string;
  content: string;
}

// ============== Proxy Bridge for Local Development ==============
// When proxyUrl is set, API calls go through postMessage to an iframe
// that runs on the local dev server, avoiding the need for ngrok.

let proxyIframe: HTMLIFrameElement | null = null;
let proxyReady = false;
const pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function initProxy() {
  if (typeof window === 'undefined' || !proxyUrl || proxyIframe) return;
  
  proxyIframe = document.createElement('iframe');
  proxyIframe.src = proxyUrl + '/sandbox-proxy';
  proxyIframe.style.display = 'none';
  proxyIframe.id = 'eliza-proxy-iframe';
  document.body.appendChild(proxyIframe);
  
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'eliza-proxy-ready') {
      proxyReady = true;
      return;
    }
    if (event.data?.type === 'eliza-proxy-response') {
      const pending = pendingRequests.get(event.data.id);
      if (pending) {
        pendingRequests.delete(event.data.id);
        if (event.data.success) {
          pending.resolve(event.data.data);
        } else {
          pending.reject(new Error(event.data.error || 'Proxy request failed'));
        }
      }
    }
  });
}

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

async function proxyRequest(path: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<unknown> {
  if (!proxyIframe?.contentWindow) {
    throw new Error('Proxy iframe not initialized');
  }
  
  // Wait for proxy to be ready (with timeout)
  if (!proxyReady) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Proxy initialization timeout')), 5000);
      const check = () => {
        if (proxyReady) { clearTimeout(timeout); resolve(); }
        else setTimeout(check, 100);
      };
      check();
    });
  }
  
  const id = generateId();
  const request = {
    type: 'eliza-proxy-request',
    id,
    path,
    method: options.method || 'GET',
    headers: options.headers,
    body: options.body,
  };
  
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    proxyIframe!.contentWindow!.postMessage(request, proxyUrl);
    
    // Timeout after 30s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Proxy request timeout'));
      }
    }, 30000);
  });
}

// Initialize proxy on load if configured
if (typeof window !== 'undefined' && proxyUrl) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProxy);
  } else {
    initProxy();
  }
}

// ============== API Functions ==============
// These use the proxy when proxyUrl is set, otherwise direct fetch

async function elizaFetch(path: string, options: RequestInit = {}): Promise<Response> {
  // If proxy is configured, use postMessage bridge
  if (proxyUrl && typeof window !== 'undefined') {
    const result = await proxyRequest(path, {
      method: options.method || 'GET',
      headers: options.headers as Record<string, string>,
      body: options.body ? JSON.parse(options.body as string) : undefined,
    });
    // Wrap result in Response-like object
    return {
      ok: true,
      status: 200,
      json: async () => result,
      text: async () => JSON.stringify(result),
      headers: new Headers(),
    } as Response;
  }
  
  // Direct fetch to API
  return fetch(\`\${apiBase}\${path}\`, options);
}

const trackedPaths = new Set<string>();

export async function trackPageView(pathname?: string) {
  if (typeof window === 'undefined') return;

  const path = pathname || window.location.pathname;
  if (trackedPaths.has(path)) return;
  trackedPaths.add(path);

  try {
    const payload = {
      app_id: appId,
      page_url: window.location.href,
      pathname: path,
      referrer: document.referrer,
      screen_width: window.screen.width,
      screen_height: window.screen.height,
    };

    await elizaFetch('/api/v1/track/pageview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // Silent fail - don't break the app for analytics
  }
}

export async function chat(messages: ChatMessage[], model = 'gpt-4o') {
  const res = await elizaFetch('/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({ messages, model }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function* chatStream(messages: ChatMessage[], model = 'gpt-4o') {
  // Streaming not supported through proxy - fall back to non-streaming
  if (proxyUrl && typeof window !== 'undefined') {
    const result = await chat(messages, model);
    yield result;
    return;
  }
  
  const res = await fetch(\`\${apiBase}/api/v1/chat/completions\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({ messages, model, stream: true }),
  });
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split('\\n')) {
      if (line.startsWith('data: ') && !line.includes('[DONE]')) {
        try { yield JSON.parse(line.slice(6)); } catch {}
      }
    }
  }
}

export async function generateImage(prompt: string, options?: { model?: string; width?: number; height?: number }) {
  const res = await elizaFetch('/api/v1/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({ prompt, ...options }),
  });
  return res.json() as Promise<{ url: string; id: string }>;
}

export async function uploadFile(file: File | Blob, filename: string) {
  // File upload not supported through proxy - use direct fetch
  const formData = new FormData();
  formData.append('file', file, filename);
  const res = await fetch(\`\${apiBase}/api/v1/storage/upload\`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body: formData,
  });
  return res.json() as Promise<{ id: string; url: string }>;
}

export async function getBalance() {
  const res = await elizaFetch('/api/v1/credits/balance', {
    headers: { 'X-Api-Key': apiKey },
  });
  return res.json() as Promise<{ balance: number }>;
}

export async function listAgents() {
  const res = await elizaFetch('/api/v1/agents', {
    headers: { 'X-Api-Key': apiKey },
  });
  return res.json() as Promise<{ agents: Array<{ id: string; name: string; bio: string }> }>;
}

export async function chatWithAgent(agentId: string, message: string, roomId?: string) {
  const res = await elizaFetch('/api/v1/agents/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({ agentId, message, roomId }),
  });
  return res.json() as Promise<{ response: string; roomId: string }>;
}
`;

export const ELIZA_HOOK_FILE = `'use client';
import { useState, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';

type ChatMessage = { role: string; content: string };

export function useChat() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (messages: ChatMessage[]) => {
    setLoading(true);
    setError(null);
    try {
      const { chat } = await import('@/lib/eliza');
      return await chat(messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { send, loading, error };
}

export function useChatStream() {
  const [loading, setLoading] = useState(false);

  const stream = useCallback(async function* (messages: ChatMessage[]) {
    setLoading(true);
    try {
      const { chatStream } = await import('@/lib/eliza');
      yield* chatStream(messages);
    } finally {
      setLoading(false);
    }
  }, []);

  return { stream, loading };
}

export function usePageTracking() {
  const pathname = usePathname();

  useEffect(() => {
    const track = async () => {
      try {
        const { trackPageView } = await import('@/lib/eliza');
        trackPageView(pathname);
      } catch (e) {
        // Silent fail
      }
    };
    track();
  }, [pathname]);
}
`;

export const ELIZA_ANALYTICS_COMPONENT = `'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackPageView } from '@/lib/eliza';

export function ElizaAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
`;
