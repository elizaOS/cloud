import type { Subprocess } from "bun";

const SERVER_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const HEALTH_ENDPOINT = `${SERVER_URL}/api/health`;
const STARTUP_TIMEOUT_MS = 60_000;
const HEALTHCHECK_TIMEOUT_MS = 2_000;
const POLL_INTERVAL_MS = 500;
const MANAGED_FETCH_RETRIES = 4;
const TEST_SERVER_SCRIPT = process.env.TEST_SERVER_SCRIPT || "dev:local";
const baseFetch: typeof fetch = globalThis.fetch.bind(globalThis);

let serverProcess: Subprocess | null = null;
let startedServer = false;
let serverStartupPromise: Promise<void> | null = null;
let serverExitError: Error | null = null;

async function isServerRunning(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    HEALTHCHECK_TIMEOUT_MS,
  );

  try {
    const response = await baseFetch(HEALTH_ENDPOINT, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function waitForServer(timeoutMs: number): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (serverExitError) {
      throw serverExitError;
    }
    if (await isServerRunning()) {
      return;
    }
    await Bun.sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Server failed to start within ${timeoutMs / 1000}s`);
}

function pipeServerLogs(stream: ReadableStream<Uint8Array> | null, label: "stdout" | "stderr"): void {
  if (!stream) return;

  const reader = stream.getReader();
  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value).trim();
        if (
          text.length > 0 &&
          (label === "stderr" ||
            text.includes("Ready") ||
            text.includes("Local:") ||
            text.includes("Error"))
        ) {
          console.log(`[E2E Server:${label}] ${text}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("closed")) {
        console.warn(`[E2E Server:${label}] log stream ended unexpectedly: ${message}`);
      }
    }
  })();
}

function watchServerExit(process: Subprocess): void {
  void process.exited.then((code) => {
    if (serverProcess !== process) {
      return;
    }

    serverProcess = null;
    if (!startedServer) {
      return;
    }

    if (code !== 0 && code !== 15) {
      serverExitError = new Error(`E2E server exited with code ${code}`);
      console.error(`[E2E Server] ${serverExitError.message}`);
    }
  });
}

function stopServer(): void {
  if (!startedServer || !serverProcess) return;
  serverProcess.kill();
  serverProcess = null;
  startedServer = false;
  serverStartupPromise = null;
}

export async function ensureServer(): Promise<void> {
  if (await isServerRunning()) {
    return;
  }

  if (serverStartupPromise) {
    await serverStartupPromise;
    return;
  }

  serverStartupPromise = (async () => {
    if (await isServerRunning()) {
      return;
    }

    startedServer = true;
    serverExitError = null;
    serverProcess = Bun.spawn(["bun", "run", TEST_SERVER_SCRIPT], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: "3000",
      },
    });

    pipeServerLogs(serverProcess.stdout, "stdout");
    pipeServerLogs(serverProcess.stderr, "stderr");
    watchServerExit(serverProcess);

    try {
      await waitForServer(STARTUP_TIMEOUT_MS);
    } catch (error) {
      stopServer();
      throw error;
    }
  })();

  try {
    await serverStartupPromise;
  } finally {
    serverStartupPromise = null;
  }
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function createRequestFactory(
  input: RequestInfo | URL,
  init?: RequestInit,
): () => [RequestInfo | URL, RequestInit | undefined] {
  if (input instanceof Request) {
    return () => [input.clone(), init];
  }

  return () => [input, init];
}

function isRecoverableServerError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("ConnectionRefused") ||
    message.includes("Unable to connect") ||
    message.includes("ECONNRESET") ||
    message.includes("socket connection was closed unexpectedly")
  );
}

const fetchWithServer: typeof fetch = async (input, init) => {
  const requestUrl = getRequestUrl(input);
  const isManagedRequest = requestUrl.startsWith(SERVER_URL);

  if (!isManagedRequest) {
    return await baseFetch(input, init);
  }

  const nextRequest = createRequestFactory(input, init);

  for (let attempt = 0; attempt < MANAGED_FETCH_RETRIES; attempt += 1) {
    await ensureServer();

    try {
      const [requestInput, requestInit] = nextRequest();
      return await baseFetch(requestInput, requestInit);
    } catch (error) {
      const isLastAttempt = attempt === MANAGED_FETCH_RETRIES - 1;
      if (!isRecoverableServerError(error) || isLastAttempt) {
        throw error;
      }

      await Bun.sleep(POLL_INTERVAL_MS * (attempt + 1));
    }
  }

  throw new Error("Managed fetch exhausted all retry attempts");
};

globalThis.fetch = fetchWithServer;

process.on("exit", stopServer);
process.on("SIGINT", () => {
  stopServer();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopServer();
  process.exit(0);
});

export const serverReady = ensureServer();

await serverReady;

export const serverUrl = SERVER_URL;
