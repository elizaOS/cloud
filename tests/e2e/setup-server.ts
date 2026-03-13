import type { Subprocess } from "bun";

const SERVER_URL = process.env.TEST_BASE_URL || "http://localhost:3333";
const HEALTH_ENDPOINT = `${SERVER_URL}/api/health`;
// Cold Next.js webpack boots can take noticeably longer after large test suites
// or when the first request has to compile the health route.
const STARTUP_TIMEOUT_MS = 120_000;
const HEALTHCHECK_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 500;
const MANAGED_FETCH_RETRIES = 4;
const TEST_SERVER_SCRIPT = process.env.TEST_SERVER_SCRIPT || "dev";
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

async function waitForPortRelease(port: number, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const server = Bun.serve({ port, fetch: () => new Response("") });
      server.stop(true);
      return;
    } catch {
      await Bun.sleep(250);
    }
  }
}

async function stopServer(): Promise<void> {
  const proc = serverProcess;
  serverProcess = null;
  startedServer = false;
  serverStartupPromise = null;
  serverExitError = null;

  if (proc) {
    // Kill the entire process group so child processes (webpack, etc.) also die
    try {
      process.kill(-proc.pid, "SIGKILL");
    } catch {
      // Process group kill failed — fall back to direct kill
      try {
        proc.kill(9);
      } catch {
        // already dead
      }
    }

    // Wait for the process to actually exit
    try {
      await Promise.race([
        proc.exited,
        Bun.sleep(5_000),
      ]);
    } catch {
      // ignore
    }
  }

  // Always wait for the port to be released, even without a process —
  // something else may still hold the port.
  await waitForPortRelease(3333);
}

export async function ensureServer(): Promise<void> {
  if (await isServerRunning()) {
    // Server is already responding to health checks — clear any stale error.
    serverExitError = null;
    return;
  }

  if (serverStartupPromise) {
    await serverStartupPromise;
    return;
  }

  serverStartupPromise = (async () => {
    if (await isServerRunning()) {
      serverExitError = null;
      return;
    }

    // If a previous server process is lingering, clean it up first.
    if (serverProcess || serverExitError) {
      await stopServer();
    }

    // Ensure the port is free before spawning.
    await waitForPortRelease(3333);

    startedServer = true;
    serverExitError = null;
    serverProcess = Bun.spawn(["bun", "run", TEST_SERVER_SCRIPT], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: "3333",
      },
    });

    pipeServerLogs(serverProcess.stdout, "stdout");
    pipeServerLogs(serverProcess.stderr, "stderr");
    watchServerExit(serverProcess);

    try {
      await waitForServer(STARTUP_TIMEOUT_MS);
    } catch (error) {
      await stopServer();
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
    message.includes("socket connection was closed unexpectedly") ||
    message.includes("E2E server exited with code")
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
    try {
      await ensureServer();

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

process.on("exit", () => {
  // Sync-only: forcefully kill the server process if still running
  if (serverProcess) {
    try { process.kill(-serverProcess.pid, "SIGKILL"); } catch { /* already dead */ }
  }
});
process.on("SIGINT", () => {
  void stopServer().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void stopServer().finally(() => process.exit(0));
});

export const serverReady = ensureServer();

await serverReady;

export const serverUrl = SERVER_URL;
