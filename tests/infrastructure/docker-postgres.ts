/**
 * Docker PostgreSQL Infrastructure for Testing
 *
 * Spins up a temporary PostgreSQL container with pgvector for integration tests.
 * Uses Dockerode to manage container lifecycle.
 */

import Docker from "dockerode";
import { Client } from "pg";

const docker = new Docker();

// Container configuration
const CONTAINER_NAME = "eliza-cloud-test-postgres";
const POSTGRES_IMAGE = "pgvector/pgvector:pg16";
const POSTGRES_PORT = 5544; // Different port to avoid conflicts with local postgres
const POSTGRES_USER = "testuser";
const POSTGRES_PASSWORD = "testpass";
const POSTGRES_DB = "eliza_test";

let containerInstance: Docker.Container | null = null;

/**
 * Get the connection string for the test database
 */
export function getConnectionString(): string {
  return `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}`;
}

/**
 * Check if the test container is already running
 */
export async function isRunning(): Promise<boolean> {
  try {
    const containers = await docker.listContainers({ all: true });
    const existing = containers.find((c) =>
      c.Names.some((n) => n === `/${CONTAINER_NAME}`)
    );
    return existing?.State === "running";
  } catch {
    return false;
  }
}

/**
 * Clean up any stale containers from previous test runs
 */
export async function cleanupStaleContainers(): Promise<void> {
  try {
    const containers = await docker.listContainers({ all: true });
    const staleContainers = containers.filter((c) =>
      c.Names.some((n) => n === `/${CONTAINER_NAME}`)
    );

    for (const containerInfo of staleContainers) {
      const container = docker.getContainer(containerInfo.Id);
      console.log(`[DockerPostgres] Removing stale container: ${containerInfo.Id}`);
      if (containerInfo.State === "running") {
        await container.stop().catch(() => {});
      }
      await container.remove({ force: true }).catch(() => {});
    }
  } catch (error) {
    console.warn(`[DockerPostgres] Cleanup warning: ${error}`);
  }
}

/**
 * Start the PostgreSQL container
 */
export async function startPostgres(): Promise<string> {
  console.log("[DockerPostgres] Starting PostgreSQL container...");

  // Clean up any stale containers first
  await cleanupStaleContainers();

  // Pull image if not available
  try {
    await docker.getImage(POSTGRES_IMAGE).inspect();
    console.log(`[DockerPostgres] Image ${POSTGRES_IMAGE} already exists`);
  } catch {
    console.log(`[DockerPostgres] Pulling image ${POSTGRES_IMAGE}...`);
    await new Promise<void>((resolve, reject) => {
      docker.pull(POSTGRES_IMAGE, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
    console.log(`[DockerPostgres] Image pulled successfully`);
  }

  // Create container
  containerInstance = await docker.createContainer({
    Image: POSTGRES_IMAGE,
    name: CONTAINER_NAME,
    Env: [
      `POSTGRES_USER=${POSTGRES_USER}`,
      `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
      `POSTGRES_DB=${POSTGRES_DB}`,
    ],
    ExposedPorts: {
      "5432/tcp": {},
    },
    HostConfig: {
      PortBindings: {
        "5432/tcp": [{ HostPort: String(POSTGRES_PORT) }],
      },
      AutoRemove: false, // We'll remove manually for better control
    },
  });

  await containerInstance.start();
  console.log(`[DockerPostgres] Container started on port ${POSTGRES_PORT}`);

  // Wait for PostgreSQL to be ready
  await waitForPostgres();

  const connectionString = getConnectionString();
  console.log(`[DockerPostgres] PostgreSQL ready: ${connectionString}`);

  return connectionString;
}

/**
 * Wait for PostgreSQL to accept connections
 */
async function waitForPostgres(maxAttempts = 30, delayMs = 1000): Promise<void> {
  console.log("[DockerPostgres] Waiting for PostgreSQL to be ready...");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const client = new Client({
      host: "localhost",
      port: POSTGRES_PORT,
      user: POSTGRES_USER,
      password: POSTGRES_PASSWORD,
      database: POSTGRES_DB,
      connectionTimeoutMillis: 2000,
    });

    try {
      await client.connect();
      
      // Verify pgvector extension is available
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      console.log("[DockerPostgres] pgvector extension enabled");
      
      await client.end();
      console.log(`[DockerPostgres] PostgreSQL ready after ${attempt} attempt(s)`);
      return;
    } catch (error) {
      await client.end().catch(() => {});
      if (attempt === maxAttempts) {
        throw new Error(`PostgreSQL not ready after ${maxAttempts} attempts: ${error}`);
      }
      console.log(`[DockerPostgres] Waiting... (attempt ${attempt}/${maxAttempts})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/**
 * Stop and remove the PostgreSQL container
 */
export async function stopPostgres(): Promise<void> {
  console.log("[DockerPostgres] Stopping PostgreSQL container...");

  if (containerInstance) {
    try {
      await containerInstance.stop({ t: 5 });
      console.log("[DockerPostgres] Container stopped");
    } catch (error) {
      console.warn(`[DockerPostgres] Stop warning: ${error}`);
    }

    try {
      await containerInstance.remove({ force: true });
      console.log("[DockerPostgres] Container removed");
    } catch (error) {
      console.warn(`[DockerPostgres] Remove warning: ${error}`);
    }

    containerInstance = null;
  }

  // Also clean up any orphaned containers with our name
  await cleanupStaleContainers();
}

/**
 * Get container info for debugging
 */
export async function getContainerInfo(): Promise<Docker.ContainerInfo | null> {
  try {
    const containers = await docker.listContainers({ all: true });
    return containers.find((c) => c.Names.some((n) => n === `/${CONTAINER_NAME}`)) || null;
  } catch {
    return null;
  }
}

/**
 * Run cloud database migrations using drizzle-kit push
 * This applies the actual cloud schema (users, organizations, api_keys, etc.)
 */
export async function runCloudMigrations(connectionString: string): Promise<void> {
  const startTime = Date.now();
  console.log("[DockerPostgres] Running cloud database migrations...");

  // Set DATABASE_URL for drizzle-kit
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = connectionString;

  try {
    // Use child_process to run drizzle-kit push
    const { spawn } = await import("child_process");
    
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("bunx", ["drizzle-kit", "push", "--force"], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: connectionString },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => { stdout += data.toString(); });
      proc.stderr?.on("data", (data) => { stderr += data.toString(); });

      proc.on("close", (code) => {
        if (code !== 0) {
          console.error("[DockerPostgres] Migration stdout:", stdout);
          console.error("[DockerPostgres] Migration stderr:", stderr);
          reject(new Error(`drizzle-kit push failed with exit code ${code}`));
        } else {
          resolve();
        }
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn drizzle-kit: ${err.message}`));
      });
    });

    console.log(`[DockerPostgres] Cloud migrations completed in ${Date.now() - startTime}ms`);
  } finally {
    // Restore original DATABASE_URL
    if (originalUrl) {
      process.env.DATABASE_URL = originalUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  }
}

/**
 * Run ElizaOS agent migrations (entities, memories, rooms, etc.)
 * These are separate from cloud migrations
 */
export async function runAgentMigrations(connectionString: string): Promise<void> {
  const startTime = Date.now();
  console.log("[DockerPostgres] Running ElizaOS agent migrations...");

  // Dynamic import to avoid bundling issues
  const pluginSql = await import("@elizaos/plugin-sql/node");
  const core = await import("@elizaos/core");
  
  // createDatabaseAdapter is the default export or named export
  const createAdapter = (pluginSql as { createDatabaseAdapter?: typeof pluginSql.default }).createDatabaseAdapter || pluginSql.default;

  // Create a temporary agent ID for migrations
  const migrationAgentId = core.stringToUuid("migration-agent-temp") as `${string}-${string}-${string}-${string}-${string}`;

  try {
    const adapter = createAdapter({ postgresUrl: connectionString }, migrationAgentId);
    await adapter.init(); // This runs the ElizaOS schema migrations
    await adapter.close();
    console.log(`[DockerPostgres] Agent migrations completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error("[DockerPostgres] Agent migration error:", error);
    throw error;
  }
}

export default {
  startPostgres,
  stopPostgres,
  getConnectionString,
  isRunning,
  getContainerInfo,
  cleanupStaleContainers,
  runCloudMigrations,
  runAgentMigrations,
};
