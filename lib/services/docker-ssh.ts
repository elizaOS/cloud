/**
 * DockerSSHClient — Reusable SSH client wrapper for Docker node operations.
 *
 * Provides connection pooling, command execution with timeouts, and proper
 * cleanup.  Designed for orchestrating Docker containers on remote Hetzner
 * VPS nodes via SSH.
 *
 * Reference: milady-cloud/backend/services/container-orchestrator.ts (executeSSH)
 */

import { Client as SSHClient } from "ssh2";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { logger } from "@/lib/utils/logger";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_SSH_PORT = 22;
const DEFAULT_SSH_USERNAME = process.env.MILADY_SSH_USER || "root";
const DEFAULT_SSH_KEY_PATH =
  process.env.MILADY_SSH_KEY_PATH ||
  path.join(os.homedir(), ".ssh", "id_ed25519");

/** TCP / handshake timeout for new connections (ms). */
const CONNECTION_TIMEOUT_MS = 10_000;

/** Default timeout for a single command execution (ms). */
const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DockerSSHConfig {
  hostname: string;
  port?: number;
  username?: string;
  privateKeyPath?: string;
}

// ---------------------------------------------------------------------------
// DockerSSHClient
// ---------------------------------------------------------------------------

export class DockerSSHClient {
  private readonly hostname: string;
  private readonly port: number;
  private readonly username: string;
  private readonly privateKeyPath: string;

  private client: SSHClient | null = null;
  private connected = false;

  // ---- Static connection pool ------------------------------------------

  private static pool = new Map<string, DockerSSHClient>();
  private lastActivityMs = 0;

  /** Idle timeout — pooled connections unused for this long are auto-closed. */
  private static readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Get (or create) a pooled client for the given hostname.
   * Uses default SSH port / user / key unless the pool entry was created
   * with different settings earlier.
   *
   * Pool key includes hostname + port to avoid collisions when two nodes
   * share a hostname but use different SSH ports.
   */
  static getClient(hostname: string, port?: number): DockerSSHClient {
    const effectivePort = port ?? DEFAULT_SSH_PORT;
    const poolKey = `${hostname}:${effectivePort}`;
    let client = DockerSSHClient.pool.get(poolKey);
    if (client) {
      // Evict stale connections (handles serverless cold-start reconnections)
      if (client.connected && Date.now() - client.lastActivityMs > DockerSSHClient.IDLE_TIMEOUT_MS) {
        logger.info(`[docker-ssh] Evicting idle connection for ${poolKey}`);
        client.disconnect().catch(() => {});
        DockerSSHClient.pool.delete(poolKey);
        client = undefined;
      }
    }
    if (!client) {
      client = new DockerSSHClient({ hostname, port: effectivePort });
      DockerSSHClient.pool.set(poolKey, client);
    }
    return client;
  }

  /** Disconnect and remove every pooled client. */
  static async disconnectAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const client of DockerSSHClient.pool.values()) {
      promises.push(
        client.disconnect().catch((err) => {
          logger.warn(
            `[docker-ssh] error disconnecting pooled client ${client.hostname}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }),
      );
    }
    await Promise.all(promises);
    DockerSSHClient.pool.clear();
  }

  // ---- Constructor -----------------------------------------------------

  constructor(config: DockerSSHConfig) {
    this.hostname = config.hostname;
    this.port = config.port ?? DEFAULT_SSH_PORT;
    this.username = config.username ?? DEFAULT_SSH_USERNAME;
    this.privateKeyPath = config.privateKeyPath ?? DEFAULT_SSH_KEY_PATH;
  }

  // ---- Public API ------------------------------------------------------

  /**
   * Establish the SSH connection.  Resolves once the `ready` event fires.
   * If the client is already connected this is a no-op.
   */
  async connect(): Promise<void> {
    if (this.connected && this.client) {
      return;
    }

    // Read private key
    let privateKey: Buffer;
    try {
      privateKey = fs.readFileSync(this.privateKeyPath);
    } catch (err) {
      throw new Error(
        `[docker-ssh] Failed to read SSH key at ${this.privateKeyPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return new Promise<void>((resolve, reject) => {
      const conn = new SSHClient();

      const timeout = setTimeout(() => {
        conn.end();
        reject(
          new Error(
            `[docker-ssh] Connection to ${this.hostname}:${this.port} timed out after ${CONNECTION_TIMEOUT_MS}ms`,
          ),
        );
      }, CONNECTION_TIMEOUT_MS);

      conn.on("ready", () => {
        clearTimeout(timeout);
        this.client = conn;
        this.connected = true;
        logger.info(
          `[docker-ssh] Connected to ${this.hostname}:${this.port}`,
        );
        resolve();
      });

      conn.on("error", (err) => {
        clearTimeout(timeout);
        this.connected = false;
        this.client = null;
        reject(
          new Error(
            `[docker-ssh] Connection error for ${this.hostname}: ${err.message}`,
          ),
        );
      });

      conn.on("close", () => {
        this.connected = false;
        this.client = null;
      });

      conn.connect({
        host: this.hostname,
        port: this.port,
        username: this.username,
        privateKey,
        readyTimeout: CONNECTION_TIMEOUT_MS,
      });
    });
  }

  /**
   * Execute a shell command over the SSH connection.
   *
   * @param command  – Shell command string.
   * @param timeoutMs – Per-command timeout (defaults to 60 s).
   * @returns Combined stdout + stderr output.
   */
  async exec(command: string, timeoutMs?: number): Promise<string> {
    // Auto-connect if needed
    if (!this.connected || !this.client) {
      await this.connect();
    }
    this.lastActivityMs = Date.now();

    const effectiveTimeout = timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    const client = this.client!;

    return new Promise<string>((resolve, reject) => {
      let output = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(
            new Error(
              `[docker-ssh] Command timed out after ${effectiveTimeout}ms on ${this.hostname}: ${command.slice(0, 120)}`,
            ),
          );
        }
      }, effectiveTimeout);

      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            reject(
              new Error(
                `[docker-ssh] exec error on ${this.hostname}: ${err.message}`,
              ),
            );
          }
          return;
        }

        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;

          if (code !== 0) {
            reject(
              new Error(
                `[docker-ssh] Command exited with code ${code} on ${this.hostname}: ${output.trim()}`,
              ),
            );
          } else {
            resolve(output);
          }
        });

        stream.on("error", (streamErr: Error) => {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            reject(
              new Error(
                `[docker-ssh] stream error on ${this.hostname}: ${streamErr.message}`,
              ),
            );
          }
        });
      });
    });
  }

  /**
   * Gracefully close the SSH connection.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        this.client.end();
      } catch {
        // swallow – best-effort
      }
      this.client = null;
      this.connected = false;
      logger.info(`[docker-ssh] Disconnected from ${this.hostname}`);
    }
  }

  /** Whether the underlying SSH session is open. */
  get isConnected(): boolean {
    return this.connected;
  }
}
