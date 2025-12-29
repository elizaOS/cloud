/**
 * DWS Environment Variable Manager
 *
 * Provides Vercel-like environment variable management:
 * - Encrypted secrets storage
 * - Environment-specific variables (production, preview, development)
 * - Automatic injection during builds
 * - Variable inheritance and overrides
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { dwsConfig } from './config'

// ============================================================================
// Types
// ============================================================================

export type EnvTarget = 'production' | 'preview' | 'development'

export interface EnvVariable {
  key: string
  value: string
  target: EnvTarget[]
  encrypted: boolean
  createdAt: string
  updatedAt: string
}

export interface EnvManagerOptions {
  projectId: string
  projectRoot?: string
}

// ============================================================================
// Environment Variable Manager
// ============================================================================

export class DWSEnvManager {
  private projectId: string
  private projectRoot: string
  private cacheDir: string
  private variables: Map<string, EnvVariable> = new Map()

  constructor(options: EnvManagerOptions) {
    this.projectId = options.projectId
    this.projectRoot = options.projectRoot ?? process.cwd()
    this.cacheDir = join(this.projectRoot, '.dws')
  }

  /**
   * Sync environment variables from DWS
   */
  async sync(): Promise<void> {
    try {
      const response = await fetch(
        `${dwsConfig.apiUrl}/deploy/projects/${this.projectId}/env`,
      )

      if (!response.ok) {
        throw new Error(`Failed to sync: ${response.statusText}`)
      }

      const envVars = await response.json()
      this.variables.clear()

      for (const env of envVars) {
        this.variables.set(env.key, {
          ...env,
          createdAt: env.createdAt ?? new Date().toISOString(),
          updatedAt: env.updatedAt ?? new Date().toISOString(),
        })
      }

      // Cache locally
      this.saveCache()
    } catch (error) {
      // Try to load from cache
      this.loadCache()
    }
  }

  /**
   * Get environment variables for a specific target
   */
  getForTarget(target: EnvTarget): Record<string, string> {
    const result: Record<string, string> = {}

    for (const [key, env] of this.variables) {
      if (env.target.includes(target)) {
        result[key] = env.value
      }
    }

    return result
  }

  /**
   * Set an environment variable
   */
  async set(key: string, value: string, target: EnvTarget[]): Promise<void> {
    const response = await fetch(
      `${dwsConfig.apiUrl}/deploy/projects/${this.projectId}/env`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, target }),
      },
    )

    if (!response.ok) {
      throw new Error(`Failed to set env var: ${response.statusText}`)
    }

    // Update local cache
    this.variables.set(key, {
      key,
      value,
      target,
      encrypted: this.shouldEncrypt(key),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    this.saveCache()
  }

  /**
   * Remove an environment variable
   */
  async remove(key: string): Promise<void> {
    const response = await fetch(
      `${dwsConfig.apiUrl}/deploy/projects/${this.projectId}/env/${key}`,
      { method: 'DELETE' },
    )

    if (!response.ok) {
      throw new Error(`Failed to remove env var: ${response.statusText}`)
    }

    this.variables.delete(key)
    this.saveCache()
  }

  /**
   * List all environment variables
   */
  list(): EnvVariable[] {
    return Array.from(this.variables.values())
  }

  /**
   * Pull environment variables to local .env file
   */
  pullToLocal(target: EnvTarget = 'development'): void {
    const envVars = this.getForTarget(target)
    const envPath = join(this.projectRoot, '.env.local')

    let content = '# DWS Environment Variables\n'
    content += `# Target: ${target}\n`
    content += `# Pulled: ${new Date().toISOString()}\n\n`

    for (const [key, value] of Object.entries(envVars)) {
      // Mask sensitive values
      if (this.shouldEncrypt(key)) {
        content += `# ${key}=********\n`
      } else {
        content += `${key}=${value}\n`
      }
    }

    writeFileSync(envPath, content)
    console.log(`Pulled ${Object.keys(envVars).length} variables to .env.local`)
  }

  /**
   * Push local .env file to DWS
   */
  async pushFromLocal(target: EnvTarget[] = ['development']): Promise<void> {
    const envPath = join(this.projectRoot, '.env.local')

    if (!existsSync(envPath)) {
      throw new Error('.env.local not found')
    }

    const content = readFileSync(envPath, 'utf-8')
    const lines = content.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const [key, ...valueParts] = trimmed.split('=')
      const value = valueParts.join('=')

      if (key && value) {
        await this.set(key, value, target)
      }
    }
  }

  /**
   * Generate build-time environment variables
   */
  generateBuildEnv(target: EnvTarget): Record<string, string> {
    const env = this.getForTarget(target)

    // Add DWS-specific build variables
    return {
      ...env,
      DWS_NETWORK: dwsConfig.network,
      DWS_PROJECT_ID: this.projectId,
      NEXT_PUBLIC_DWS_ENABLED: 'true',
    }
  }

  /**
   * Write environment variables to a file for build
   */
  writeBuildEnvFile(target: EnvTarget): string {
    const env = this.generateBuildEnv(target)
    const envPath = join(this.cacheDir, `.env.${target}`)

    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true })
    }

    const content = Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')

    writeFileSync(envPath, content)
    return envPath
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private shouldEncrypt(key: string): boolean {
    const sensitivePatterns = [
      'SECRET',
      'KEY',
      'TOKEN',
      'PASSWORD',
      'CREDENTIAL',
      'PRIVATE',
      'API_KEY',
      'AUTH',
    ]

    const upperKey = key.toUpperCase()
    return sensitivePatterns.some((p) => upperKey.includes(p))
  }

  private loadCache(): void {
    const cachePath = join(this.cacheDir, 'env-cache.json')

    if (existsSync(cachePath)) {
      try {
        const data = JSON.parse(readFileSync(cachePath, 'utf-8'))
        this.variables = new Map(Object.entries(data))
      } catch {
        // Ignore cache errors
      }
    }
  }

  private saveCache(): void {
    const cachePath = join(this.cacheDir, 'env-cache.json')

    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true })
    }

    const data: Record<string, EnvVariable> = {}
    for (const [key, value] of this.variables) {
      // Don't cache sensitive values
      if (value.encrypted) {
        data[key] = { ...value, value: '********' }
      } else {
        data[key] = value
      }
    }

    writeFileSync(cachePath, JSON.stringify(data, null, 2))
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let defaultManager: DWSEnvManager | null = null

export function getEnvManager(options?: Partial<EnvManagerOptions>): DWSEnvManager {
  if (!defaultManager) {
    const projectConfig = loadProjectConfig()
    defaultManager = new DWSEnvManager({
      projectId: options?.projectId ?? projectConfig?.projectId ?? 'default',
      projectRoot: options?.projectRoot,
    })
  }
  return defaultManager
}

function loadProjectConfig(): { projectId: string } | null {
  try {
    const configPath = join(process.cwd(), '.dws', 'project.json')
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf-8'))
    }
  } catch {
    // Ignore
  }
  return null
}

// ============================================================================
// Build Plugin
// ============================================================================

/**
 * Next.js plugin to inject DWS environment variables during build
 */
export function withDWSEnv(target: EnvTarget = 'production') {
  return (nextConfig: Record<string, unknown>) => {
    const manager = getEnvManager()
    const env = manager.generateBuildEnv(target)

    return {
      ...nextConfig,
      env: {
        ...(nextConfig.env as Record<string, string> | undefined),
        ...env,
      },
    }
  }
}


