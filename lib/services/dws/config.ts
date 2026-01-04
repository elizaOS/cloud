/**
 * DWS Configuration
 *
 * Centralized configuration for all DWS services.
 * Reads from environment variables with sensible defaults.
 */

import { z } from 'zod'
import { getDWSUrl, getCurrentNetwork, type NetworkType } from '@jejunetwork/config'

const DWSConfigSchema = z.object({
  // Core DWS endpoints
  apiUrl: z.string().url(),
  storageUrl: z.string().url(),
  execUrl: z.string().url(),
  cacheUrl: z.string().url(),
  observabilityUrl: z.string().url(),
  sqlitEndpoint: z.string().url(),
  sqlitDbid: z.string(),

  // Network configuration
  network: z.enum(['localnet', 'testnet', 'mainnet']),
  nodeId: z.string().min(1),

  // Storage configuration
  storageProvider: z.enum(['ipfs', 'local', 'hybrid']),
  ipfsGatewayUrl: z.string().url().optional(),
  storageCacheTtlMs: z.number().positive(),

  // Sandbox configuration
  sandboxTimeoutMs: z.number().positive(),
  sandboxVcpus: z.number().positive(),
  sandboxMemoryMb: z.number().positive(),

  // Container configuration
  containerRegistry: z.string().optional(),
  containerTimeout: z.number().positive(),

  // TEE configuration
  teeEnabled: z.boolean(),
  teePlatform: z.enum(['dstack', 'intel_tdx', 'amd_sev', 'simulator']),

  // Database configuration
  databaseType: z.enum(['postgres', 'sqlit']),
  databaseUrl: z.string().optional(),

  // Cache configuration
  redisUrl: z.string().optional(),
  cacheEnabled: z.boolean(),

  // DNS configuration
  dnsEnabled: z.boolean(),
  jnsEnabled: z.boolean(),
  defaultDomain: z.string(),

  // Analytics configuration
  analyticsEnabled: z.boolean(),
  analyticsEndpoint: z.string().url().optional(),

  // Cron configuration
  cronEnabled: z.boolean(),
  cronSecret: z.string().optional(),
})

export type DWSConfig = z.infer<typeof DWSConfigSchema>

function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key]
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]
  if (!value) return defaultValue
  return value.toLowerCase() === 'true' || value === '1'
}

let cachedConfig: DWSConfig | null = null

export function getDWSConfig(): DWSConfig {
  if (cachedConfig) return cachedConfig

  // Get network and base URL from centralized config
  const network = (getEnvString('DWS_NETWORK', 'localnet') ?? getCurrentNetwork()) as NetworkType
  const baseUrl = getEnvString('DWS_API_URL', '') || getDWSUrl(network)

  const rawConfig = {
    apiUrl: baseUrl,
    storageUrl: getEnvString('DWS_STORAGE_URL', `${baseUrl}/storage`),
    execUrl: getEnvString('DWS_EXEC_URL', `${baseUrl}/exec`),
    cacheUrl: getEnvString('DWS_CACHE_URL', `${baseUrl}/cache`),
    observabilityUrl: getEnvString('DWS_OBSERVABILITY_URL', `${baseUrl}/observability`),
    sqlitEndpoint: getEnvString('SQLIT_ENDPOINT', 'http://localhost:4661'),
    sqlitDbid: getEnvString('SQLIT_DBID', 'eliza-cloud'),

    network: getEnvString('DWS_NETWORK', 'localnet') as DWSConfig['network'],
    nodeId: getEnvString('DWS_NODE_ID', 'local-node'),

    storageProvider: getEnvString(
      'DWS_STORAGE_PROVIDER',
      'hybrid',
    ) as DWSConfig['storageProvider'],
    ipfsGatewayUrl: process.env.DWS_IPFS_GATEWAY_URL,
    storageCacheTtlMs: getEnvNumber('DWS_STORAGE_CACHE_TTL_MS', 3600000),

    sandboxTimeoutMs: getEnvNumber('DWS_SANDBOX_TIMEOUT_MS', 30 * 60 * 1000),
    sandboxVcpus: getEnvNumber('DWS_SANDBOX_VCPUS', 4),
    sandboxMemoryMb: getEnvNumber('DWS_SANDBOX_MEMORY_MB', 2048),

    containerRegistry: process.env.DWS_CONTAINER_REGISTRY,
    containerTimeout: getEnvNumber('DWS_CONTAINER_TIMEOUT', 15 * 60 * 1000),

    teeEnabled: getEnvBoolean('DWS_TEE_ENABLED', false),
    teePlatform: getEnvString(
      'DWS_TEE_PLATFORM',
      'simulator',
    ) as DWSConfig['teePlatform'],

    databaseType: getEnvString(
      'DWS_DATABASE_TYPE',
      'postgres',
    ) as DWSConfig['databaseType'],
    databaseUrl: process.env.DWS_DATABASE_URL ?? process.env.DATABASE_URL,

    redisUrl: process.env.DWS_REDIS_URL ?? process.env.REDIS_URL,
    cacheEnabled: getEnvBoolean('DWS_CACHE_ENABLED', true),

    dnsEnabled: getEnvBoolean('DWS_DNS_ENABLED', true),
    jnsEnabled: getEnvBoolean('DWS_JNS_ENABLED', true),
    defaultDomain: getEnvString('DWS_DEFAULT_DOMAIN', 'apps.dws.local'),

    analyticsEnabled: getEnvBoolean('DWS_ANALYTICS_ENABLED', true),
    analyticsEndpoint: process.env.DWS_ANALYTICS_ENDPOINT,

    cronEnabled: getEnvBoolean('DWS_CRON_ENABLED', true),
    cronSecret: process.env.DWS_CRON_SECRET,
  }

  const result = DWSConfigSchema.safeParse(rawConfig)
  if (!result.success) {
    console.error('[DWS Config] Validation failed:', result.error.issues)
    throw new Error(
      `Invalid DWS configuration: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
    )
  }

  cachedConfig = result.data
  return cachedConfig
}

export function resetDWSConfig(): void {
  cachedConfig = null
}

/**
 * Check if DWS is configured and available
 */
export async function isDWSAvailable(): Promise<boolean> {
  try {
    const config = getDWSConfig()
    const response = await fetch(`${config.apiUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Get DWS node info
 */
export async function getDWSNodeInfo(): Promise<{
  nodeId: string
  network: string
  version: string
  capabilities: string[]
}> {
  const config = getDWSConfig()
  const response = await fetch(`${config.apiUrl}/info`, {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`Failed to get DWS node info: ${response.status}`)
  }

  return response.json()
}

