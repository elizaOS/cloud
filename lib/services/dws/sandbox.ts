/**
 * DWS Sandbox Service
 *
 * Drop-in replacement for @vercel/sandbox that uses DWS workerd backend.
 * Provides isolated execution environments for code generation and apps.
 *
 * Features:
 * - V8 isolate-based execution (workerd)
 * - Container fallback for Node.js-specific workloads
 * - File system operations
 * - Dev server support
 * - Snapshot/restore capabilities
 */

import { z } from 'zod'
import { getDWSConfig } from './config'
import { logger } from '@/lib/utils/logger'

// Types matching @vercel/sandbox interface
export interface SandboxInstance {
  id: string
  status: 'initializing' | 'ready' | 'running' | 'stopped' | 'error'
  url: string | null
  domain: (port: number) => string
  runCommand: (params: RunCommandParams) => Promise<CommandResult>
  readFile: (path: string) => Promise<string | null>
  writeFile: (path: string, content: string) => Promise<void>
  listFiles: (path: string) => Promise<FileEntry[]>
  deleteFile: (path: string) => Promise<void>
  stop: () => Promise<void>
  extendTimeout: (durationMs: number) => Promise<void>
}

export interface RunCommandParams {
  cmd: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  detached?: boolean
  timeout?: number
}

export interface CommandResult {
  exitCode: number
  stdout: () => Promise<string>
  stderr: () => Promise<string>
}

export interface FileEntry {
  path: string
  type: 'file' | 'directory'
  size?: number
  modifiedAt?: string
}

export interface SandboxCreateOptions {
  source?: {
    url: string
    type: 'git' | 'tarball'
  }
  resources?: {
    vcpus?: number
    memoryMb?: number
  }
  timeout?: number
  ports?: number[]
  runtime?: 'workerd' | 'node22' | 'bun' | 'docker'
  env?: Record<string, string>
}

// DWS Sandbox API Types
const DWSSandboxSchema = z.object({
  id: z.string(),
  status: z.enum(['initializing', 'ready', 'running', 'stopped', 'error']),
  url: z.string().nullable(),
  ports: z.record(z.string(), z.number()),
  createdAt: z.string(),
  expiresAt: z.string(),
})

const DWSCommandResultSchema = z.object({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
})

const DWSFileEntrySchema = z.object({
  path: z.string(),
  type: z.enum(['file', 'directory']),
  size: z.number().optional(),
  modifiedAt: z.string().optional(),
})

// Global sandbox registry
const sandboxRegistry = new Map<string, DWSSandboxImpl>()

class DWSSandboxImpl implements SandboxInstance {
  id: string
  status: SandboxInstance['status']
  url: string | null
  private config = getDWSConfig()
  private portMap: Record<string, number>
  private expiresAt: Date
  private baseUrl: string

  constructor(data: z.infer<typeof DWSSandboxSchema>) {
    this.id = data.id
    this.status = data.status
    this.url = data.url
    this.portMap = data.ports
    this.expiresAt = new Date(data.expiresAt)
    this.baseUrl = `${this.config.apiUrl}/sandbox/${this.id}`
  }

  domain(port: number): string {
    const mappedPort = this.portMap[String(port)] ?? port
    const baseHost = new URL(this.config.apiUrl).host
    return `https://${this.id}-${port}.${baseHost}`
  }

  async runCommand(params: RunCommandParams): Promise<CommandResult> {
    const response = await fetch(`${this.baseUrl}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: [params.cmd, ...(params.args ?? [])],
        env: params.env,
        cwd: params.cwd,
        background: params.detached ?? false,
        timeout: params.timeout,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Sandbox exec failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const parsed = DWSCommandResultSchema.parse(data)

    // Return lazy-evaluated stdout/stderr to match Vercel Sandbox API
    return {
      exitCode: parsed.exitCode,
      stdout: async () => parsed.stdout,
      stderr: async () => parsed.stderr,
    }
  }

  async readFile(path: string): Promise<string | null> {
    const result = await this.runCommand({
      cmd: 'cat',
      args: [path],
    })

    if (result.exitCode !== 0) {
      return null
    }

    return result.stdout()
  }

  async writeFile(path: string, content: string): Promise<void> {
    // Ensure directory exists
    const dir = path.split('/').slice(0, -1).join('/')
    if (dir) {
      await this.runCommand({
        cmd: 'mkdir',
        args: ['-p', dir],
      })
    }

    // Write file using base64 encoding to handle special characters
    const base64Content = Buffer.from(content, 'utf-8').toString('base64')
    const script = `require('fs').writeFileSync(process.argv[1], Buffer.from(process.argv[2], 'base64').toString('utf-8'))`

    const result = await this.runCommand({
      cmd: 'node',
      args: ['-e', script, path, base64Content],
    })

    if (result.exitCode !== 0) {
      const stderr = await result.stderr()
      throw new Error(`Failed to write file ${path}: ${stderr}`)
    }
  }

  async listFiles(path: string): Promise<FileEntry[]> {
    // Try Linux stat format first
    let result = await this.runCommand({
      cmd: 'sh',
      args: [
        '-c',
        `find ${path} -maxdepth 3 \\( -type f -o -type d \\) -exec stat -c '%n|%F|%s|%Y' {} \\; 2>/dev/null | head -200`,
      ],
    })

    // Fallback to macOS stat format
    if (result.exitCode !== 0) {
      result = await this.runCommand({
        cmd: 'sh',
        args: [
          '-c',
          `find ${path} -maxdepth 3 \\( -type f -o -type d \\) -exec stat -f '%N|%HT|%z|%m' {} \\; 2>/dev/null | head -200`,
        ],
      })
    }

    if (result.exitCode !== 0) {
      return []
    }

    const stdout = await result.stdout()
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [filePath, fileType, size, mtime] = line.split('|')
        const isDir =
          fileType?.toLowerCase().includes('directory') ||
          fileType === 'directory'

        const entry: FileEntry = {
          path: filePath,
          type: isDir ? 'directory' : 'file',
        }

        if (!isDir && size) {
          entry.size = parseInt(size, 10)
        }

        if (mtime) {
          entry.modifiedAt = new Date(parseInt(mtime, 10) * 1000).toISOString()
        }

        return entry
      })
  }

  async deleteFile(path: string): Promise<void> {
    const result = await this.runCommand({
      cmd: 'rm',
      args: ['-rf', path],
    })

    if (result.exitCode !== 0) {
      const stderr = await result.stderr()
      throw new Error(`Failed to delete ${path}: ${stderr}`)
    }
  }

  async stop(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/stop`, {
      method: 'POST',
    })

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text()
      throw new Error(`Failed to stop sandbox: ${response.status} - ${errorText}`)
    }

    this.status = 'stopped'
    sandboxRegistry.delete(this.id)
    logger.info('[DWS Sandbox] Stopped', { id: this.id })
  }

  async extendTimeout(durationMs: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/extend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationMs }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to extend timeout: ${response.status} - ${errorText}`)
    }

    this.expiresAt = new Date(Date.now() + durationMs)
    logger.info('[DWS Sandbox] Extended timeout', { id: this.id, durationMs })
  }

  /**
   * Create archive of specified paths
   */
  async createArchive(paths: string[]): Promise<Buffer> {
    const tarFile = `/tmp/snapshot-${Date.now()}.tar.gz`
    const pathArgs = paths.join(' ')

    const result = await this.runCommand({
      cmd: 'sh',
      args: ['-c', `tar -czf ${tarFile} ${pathArgs} 2>/dev/null`],
    })

    if (result.exitCode !== 0) {
      throw new Error(`Failed to create archive: ${await result.stderr()}`)
    }

    const base64Result = await this.runCommand({
      cmd: 'base64',
      args: [tarFile],
    })

    if (base64Result.exitCode !== 0) {
      throw new Error('Failed to encode archive')
    }

    await this.runCommand({
      cmd: 'rm',
      args: ['-f', tarFile],
    })

    return Buffer.from(await base64Result.stdout(), 'base64')
  }

  /**
   * Extract archive to specified path
   */
  async extractArchive(archive: Buffer, targetPath: string): Promise<void> {
    const tarFile = `/tmp/restore-${Date.now()}.tar.gz`
    const base64Content = archive.toString('base64')

    const writeResult = await this.runCommand({
      cmd: 'sh',
      args: ['-c', `echo "${base64Content}" | base64 -d > ${tarFile}`],
    })

    if (writeResult.exitCode !== 0) {
      throw new Error('Failed to write archive')
    }

    await this.runCommand({
      cmd: 'mkdir',
      args: ['-p', targetPath],
    })

    const extractResult = await this.runCommand({
      cmd: 'sh',
      args: ['-c', `tar -xzf ${tarFile} -C ${targetPath}`],
    })

    await this.runCommand({
      cmd: 'rm',
      args: ['-f', tarFile],
    })

    if (extractResult.exitCode !== 0) {
      throw new Error(`Failed to extract archive: ${await extractResult.stderr()}`)
    }
  }
}

/**
 * Sandbox class matching @vercel/sandbox API
 */
export const Sandbox = {
  /**
   * Create a new sandbox instance
   */
  async create(options: SandboxCreateOptions = {}): Promise<SandboxInstance> {
    const config = getDWSConfig()

    const {
      source,
      resources = {},
      timeout = config.sandboxTimeoutMs,
      ports = [3000],
      runtime = 'node22',
      env = {},
    } = options

    logger.info('[DWS Sandbox] Creating sandbox', {
      source: source?.url,
      runtime,
      vcpus: resources.vcpus ?? config.sandboxVcpus,
    })

    const response = await fetch(`${config.apiUrl}/sandbox/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source,
        resources: {
          vcpus: resources.vcpus ?? config.sandboxVcpus,
          memoryMb: resources.memoryMb ?? config.sandboxMemoryMb,
        },
        timeout,
        ports,
        runtime,
        env,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to create sandbox: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const parsed = DWSSandboxSchema.parse(data)
    const sandbox = new DWSSandboxImpl(parsed)

    sandboxRegistry.set(sandbox.id, sandbox)
    logger.info('[DWS Sandbox] Created', { id: sandbox.id, url: sandbox.url })

    return sandbox
  },

  /**
   * Get an existing sandbox by ID
   */
  async get(params: {
    sandboxId: string
    token?: string
    teamId?: string
    projectId?: string
  }): Promise<SandboxInstance> {
    const config = getDWSConfig()

    // Check local registry first
    const cached = sandboxRegistry.get(params.sandboxId)
    if (cached) {
      return cached
    }

    const response = await fetch(
      `${config.apiUrl}/sandbox/${params.sandboxId}`,
      {
        method: 'GET',
      },
    )

    if (!response.ok) {
      throw new Error(`Sandbox ${params.sandboxId} not found`)
    }

    const data = await response.json()
    const parsed = DWSSandboxSchema.parse(data)
    const sandbox = new DWSSandboxImpl(parsed)

    sandboxRegistry.set(sandbox.id, sandbox)
    logger.info('[DWS Sandbox] Retrieved', { id: sandbox.id })

    return sandbox
  },

  /**
   * List all sandboxes
   */
  async list(): Promise<Array<{ id: string; status: string; createdAt: string }>> {
    const config = getDWSConfig()

    const response = await fetch(`${config.apiUrl}/sandbox/list`, {
      method: 'GET',
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to list sandboxes: ${response.status} - ${errorText}`)
    }

    return response.json()
  },
}

/**
 * DWS Sandbox Runtime - Higher-level runtime management
 */
export class DWSSandboxRuntime {
  readonly type = 'dws' as const

  static isConfigured(): boolean {
    try {
      getDWSConfig()
      return true
    } catch {
      return false
    }
  }

  static validateCredentials(): { valid: boolean; missing: string[] } {
    try {
      getDWSConfig()
      return { valid: true, missing: [] }
    } catch {
      return { valid: false, missing: ['DWS_API_URL'] }
    }
  }

  async create(params: {
    templateUrl?: string
    timeout?: number
    vcpus?: number
    ports?: number[]
    env?: Record<string, string>
  }): Promise<SandboxInstance> {
    const sandbox = await Sandbox.create({
      source: params.templateUrl
        ? { url: params.templateUrl, type: 'git' }
        : undefined,
      resources: { vcpus: params.vcpus },
      timeout: params.timeout,
      ports: params.ports,
      env: params.env,
    })

    // Install dependencies
    let install = await sandbox.runCommand({ cmd: 'pnpm', args: ['install'] })
    if (install.exitCode !== 0) {
      install = await sandbox.runCommand({ cmd: 'bun', args: ['install'] })
      if (install.exitCode !== 0) {
        install = await sandbox.runCommand({ cmd: 'npm', args: ['install'] })
        if (install.exitCode !== 0) {
          throw new Error(`Install failed: ${await install.stderr()}`)
        }
      }
    }

    // Write env file if env vars provided
    if (params.env && Object.keys(params.env).length > 0) {
      const envContent = Object.entries(params.env)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n')
      await sandbox.writeFile('.env.local', envContent)
    }

    return sandbox
  }

  async connect(runtimeId: string): Promise<SandboxInstance> {
    return Sandbox.get({ sandboxId: runtimeId })
  }

  async terminate(runtimeId: string): Promise<void> {
    const sandbox = sandboxRegistry.get(runtimeId)
    if (sandbox) {
      await sandbox.stop()
    }
  }

  async isHealthy(runtimeId: string): Promise<boolean> {
    const sandbox = sandboxRegistry.get(runtimeId)
    if (!sandbox) return false

    const result = await sandbox.runCommand({
      cmd: 'curl',
      args: ['-s', '-o', '/dev/null', '-w', '%{http_code}', 'http://localhost:3000'],
    })

    const statusCode = await result.stdout()
    return statusCode === '200' || statusCode === '304'
  }

  async extendTimeout(runtimeId: string, durationMs: number): Promise<void> {
    const sandbox = sandboxRegistry.get(runtimeId)
    if (!sandbox) {
      throw new Error(`Sandbox ${runtimeId} not found`)
    }
    await sandbox.extendTimeout(durationMs)
  }

  getStatus(runtimeId: string): 'running' | 'stopped' | 'unknown' {
    const sandbox = sandboxRegistry.get(runtimeId)
    if (!sandbox) return 'unknown'
    return sandbox.status === 'running' || sandbox.status === 'ready'
      ? 'running'
      : 'stopped'
  }

  getActiveSandboxes(): string[] {
    return Array.from(sandboxRegistry.keys())
  }
}

export const dwsSandboxRuntime = new DWSSandboxRuntime()

// For compatibility with existing code that checks for Vercel credentials
export function getSandboxCredentials() {
  try {
    getDWSConfig()
    return { hasOIDC: false, hasAccessToken: true }
  } catch {
    return { hasOIDC: false, hasAccessToken: false }
  }
}


