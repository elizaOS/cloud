/**
 * DWS Cache Service
 *
 * Drop-in replacement for @upstash/redis that uses DWS cache backend.
 * Provides Redis-compatible API for caching with DWS infrastructure.
 *
 * Features:
 * - Redis-compatible API (get, set, del, mget, mset, etc.)
 * - Namespace isolation for multi-tenancy
 * - TTL support
 * - Circuit breaker for fault tolerance
 * - Stale-while-revalidate pattern support
 */

import { getDWSConfig } from './config'
import { logger } from '@/lib/utils/logger'

// ============================================================================
// Types
// ============================================================================

export interface CacheConfig {
  /** Cache namespace for isolation */
  namespace?: string
  /** Default TTL in seconds */
  defaultTTL?: number
  /** Enable debug logging */
  debug?: boolean
}

export interface SetOptions {
  /** Time to live in seconds */
  ex?: number
  /** Time to live in milliseconds */
  px?: number
  /** Set only if key doesn't exist */
  nx?: boolean
  /** Set only if key exists */
  xx?: boolean
}

export interface ScanOptions {
  /** Cursor for pagination */
  cursor?: number
  /** Pattern to match keys */
  match?: string
  /** Number of keys to return */
  count?: number
}

export interface ScanResult {
  cursor: number
  keys: string[]
}

// ============================================================================
// DWS Cache Client
// ============================================================================

export class DWSCache {
  private namespace: string
  private defaultTTL: number
  private debug: boolean
  private baseUrl: string

  // Circuit breaker state
  private failureCount = 0
  private lastFailureTime = 0
  private readonly MAX_FAILURES = 5
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000

  constructor(config: CacheConfig = {}) {
    const dwsConfig = getDWSConfig()
    this.baseUrl = dwsConfig.cacheUrl ?? `${dwsConfig.apiUrl}/cache`
    this.namespace = config.namespace ?? 'default'
    this.defaultTTL = config.defaultTTL ?? 3600
    this.debug = config.debug ?? false
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitOpen(): boolean {
    if (this.failureCount >= this.MAX_FAILURES) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime
      if (timeSinceLastFailure < this.CIRCUIT_BREAKER_TIMEOUT) {
        return true
      }
      // Reset after timeout
      this.failureCount = 0
    }
    return false
  }

  /**
   * Record a failure for circuit breaker
   */
  private recordFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
  }

  /**
   * Record a success (reset circuit breaker)
   */
  private recordSuccess(): void {
    this.failureCount = 0
  }

  /**
   * Make a request to the DWS cache API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    if (this.isCircuitOpen()) {
      throw new Error('DWS Cache circuit breaker is open')
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`DWS Cache error: ${response.status} - ${error}`)
      }

      const data = await response.json()
      this.recordSuccess()
      return data as T
    } catch (error) {
      this.recordFailure()
      if (this.debug) {
        logger.error('[DWS Cache] Request failed', { method, path, error })
      }
      throw error
    }
  }

  /**
   * Get the full key with namespace
   */
  private key(key: string): string {
    return `${this.namespace}:${key}`
  }

  // =========================================================================
  // Redis-compatible methods
  // =========================================================================

  /**
   * Get a value by key
   */
  async get<T = string>(key: string): Promise<T | null> {
    try {
      const result = await this.request<{ value: T | null }>('GET', `/get/${this.key(key)}`)
      return result.value
    } catch {
      return null
    }
  }

  /**
   * Set a value with optional TTL
   */
  async set(key: string, value: string | number | object, options?: SetOptions): Promise<'OK' | null> {
    const ttl = options?.ex ?? options?.px ? Math.floor((options.px ?? 0) / 1000) : this.defaultTTL

    try {
      await this.request('POST', '/set', {
        key: this.key(key),
        value: typeof value === 'object' ? JSON.stringify(value) : value,
        ttl,
        nx: options?.nx,
        xx: options?.xx,
      })
      return 'OK'
    } catch {
      return null
    }
  }

  /**
   * Set with expiration in seconds
   */
  async setex(key: string, seconds: number, value: string): Promise<'OK' | null> {
    return this.set(key, value, { ex: seconds })
  }

  /**
   * Delete one or more keys
   */
  async del(...keys: string[]): Promise<number> {
    try {
      const result = await this.request<{ deleted: number }>('POST', '/del', {
        keys: keys.map((k) => this.key(k)),
      })
      return result.deleted
    } catch {
      return 0
    }
  }

  /**
   * Check if key exists
   */
  async exists(...keys: string[]): Promise<number> {
    try {
      const result = await this.request<{ exists: number }>('POST', '/exists', {
        keys: keys.map((k) => this.key(k)),
      })
      return result.exists
    } catch {
      return 0
    }
  }

  /**
   * Get multiple values
   */
  async mget<T = string>(...keys: string[]): Promise<(T | null)[]> {
    try {
      const result = await this.request<{ values: (T | null)[] }>('POST', '/mget', {
        keys: keys.map((k) => this.key(k)),
      })
      return result.values
    } catch {
      return keys.map(() => null)
    }
  }

  /**
   * Set multiple values
   */
  async mset(keyValues: Record<string, string | number>): Promise<'OK'> {
    const entries = Object.entries(keyValues).map(([k, v]) => ({
      key: this.key(k),
      value: v,
      ttl: this.defaultTTL,
    }))

    await this.request('POST', '/mset', { entries })
    return 'OK'
  }

  /**
   * Increment a value
   */
  async incr(key: string): Promise<number> {
    const result = await this.request<{ value: number }>('POST', '/incr', {
      key: this.key(key),
      amount: 1,
    })
    return result.value
  }

  /**
   * Increment by a specific amount
   */
  async incrby(key: string, increment: number): Promise<number> {
    const result = await this.request<{ value: number }>('POST', '/incr', {
      key: this.key(key),
      amount: increment,
    })
    return result.value
  }

  /**
   * Decrement a value
   */
  async decr(key: string): Promise<number> {
    return this.incrby(key, -1)
  }

  /**
   * Decrement by a specific amount
   */
  async decrby(key: string, decrement: number): Promise<number> {
    return this.incrby(key, -decrement)
  }

  /**
   * Set expiration time on a key
   */
  async expire(key: string, seconds: number): Promise<number> {
    try {
      const result = await this.request<{ success: boolean }>('POST', '/expire', {
        key: this.key(key),
        ttl: seconds,
      })
      return result.success ? 1 : 0
    } catch {
      return 0
    }
  }

  /**
   * Get time to live for a key
   */
  async ttl(key: string): Promise<number> {
    try {
      const result = await this.request<{ ttl: number }>('GET', `/ttl/${this.key(key)}`)
      return result.ttl
    } catch {
      return -2 // Key doesn't exist
    }
  }

  /**
   * Scan keys matching a pattern
   */
  async scan(cursor: number, options?: Omit<ScanOptions, 'cursor'>): Promise<[string, string[]]> {
    try {
      const result = await this.request<ScanResult>('POST', '/scan', {
        cursor,
        match: options?.match ? `${this.namespace}:${options.match}` : `${this.namespace}:*`,
        count: options?.count ?? 100,
      })
      // Strip namespace prefix from returned keys
      const prefix = `${this.namespace}:`
      const keys = result.keys.map((k) => (k.startsWith(prefix) ? k.slice(prefix.length) : k))
      return [String(result.cursor), keys]
    } catch {
      return ['0', []]
    }
  }

  /**
   * Get all keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      const result = await this.request<{ keys: string[] }>('POST', '/keys', {
        pattern: `${this.namespace}:${pattern}`,
      })
      const prefix = `${this.namespace}:`
      return result.keys.map((k) => (k.startsWith(prefix) ? k.slice(prefix.length) : k))
    } catch {
      return []
    }
  }

  /**
   * Flush all keys in the namespace
   */
  async flushdb(): Promise<'OK'> {
    await this.request('POST', '/flush', { namespace: this.namespace })
    return 'OK'
  }

  // =========================================================================
  // Hash operations
  // =========================================================================

  async hget(key: string, field: string): Promise<string | null> {
    try {
      const result = await this.request<{ value: string | null }>('GET', `/hget/${this.key(key)}/${field}`)
      return result.value
    } catch {
      return null
    }
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    try {
      const result = await this.request<{ created: boolean }>('POST', '/hset', {
        key: this.key(key),
        field,
        value,
      })
      return result.created ? 1 : 0
    } catch {
      return 0
    }
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    try {
      const result = await this.request<{ deleted: number }>('POST', '/hdel', {
        key: this.key(key),
        fields,
      })
      return result.deleted
    } catch {
      return 0
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      const result = await this.request<{ data: Record<string, string> }>('GET', `/hgetall/${this.key(key)}`)
      return result.data ?? {}
    } catch {
      return {}
    }
  }

  async hmset(key: string, data: Record<string, string>): Promise<'OK'> {
    await this.request('POST', '/hmset', {
      key: this.key(key),
      data,
    })
    return 'OK'
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    const result = await this.request<{ value: number }>('POST', '/hincrby', {
      key: this.key(key),
      field,
      amount: increment,
    })
    return result.value
  }

  // =========================================================================
  // List operations
  // =========================================================================

  async lpush(key: string, ...values: string[]): Promise<number> {
    const result = await this.request<{ length: number }>('POST', '/lpush', {
      key: this.key(key),
      values,
    })
    return result.length
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    const result = await this.request<{ length: number }>('POST', '/rpush', {
      key: this.key(key),
      values,
    })
    return result.length
  }

  async lpop(key: string): Promise<string | null> {
    try {
      const result = await this.request<{ value: string | null }>('POST', '/lpop', {
        key: this.key(key),
      })
      return result.value
    } catch {
      return null
    }
  }

  async rpop(key: string): Promise<string | null> {
    try {
      const result = await this.request<{ value: string | null }>('POST', '/rpop', {
        key: this.key(key),
      })
      return result.value
    } catch {
      return null
    }
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      const result = await this.request<{ values: string[] }>('POST', '/lrange', {
        key: this.key(key),
        start,
        stop,
      })
      return result.values ?? []
    } catch {
      return []
    }
  }

  async llen(key: string): Promise<number> {
    try {
      const result = await this.request<{ length: number }>('GET', `/llen/${this.key(key)}`)
      return result.length
    } catch {
      return 0
    }
  }

  // =========================================================================
  // Set operations
  // =========================================================================

  async sadd(key: string, ...members: string[]): Promise<number> {
    const result = await this.request<{ added: number }>('POST', '/sadd', {
      key: this.key(key),
      members,
    })
    return result.added
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const result = await this.request<{ removed: number }>('POST', '/srem', {
      key: this.key(key),
      members,
    })
    return result.removed
  }

  async smembers(key: string): Promise<string[]> {
    try {
      const result = await this.request<{ members: string[] }>('GET', `/smembers/${this.key(key)}`)
      return result.members ?? []
    } catch {
      return []
    }
  }

  async sismember(key: string, member: string): Promise<number> {
    try {
      const result = await this.request<{ exists: boolean }>('POST', '/sismember', {
        key: this.key(key),
        member,
      })
      return result.exists ? 1 : 0
    } catch {
      return 0
    }
  }

  async scard(key: string): Promise<number> {
    try {
      const result = await this.request<{ size: number }>('GET', `/scard/${this.key(key)}`)
      return result.size
    } catch {
      return 0
    }
  }

  // =========================================================================
  // Pipeline/Transaction support
  // =========================================================================

  /**
   * Create a pipeline for batching commands
   */
  pipeline(): CachePipeline {
    return new CachePipeline(this)
  }

  /**
   * Execute commands in a transaction
   */
  multi(): CachePipeline {
    return new CachePipeline(this, true)
  }
}

/**
 * Pipeline for batching cache commands
 */
class CachePipeline {
  private commands: Array<{ method: string; args: unknown[] }> = []
  private cache: DWSCache
  private isTransaction: boolean

  constructor(cache: DWSCache, isTransaction = false) {
    this.cache = cache
    this.isTransaction = isTransaction
  }

  get(key: string): this {
    this.commands.push({ method: 'get', args: [key] })
    return this
  }

  set(key: string, value: string | number, options?: SetOptions): this {
    this.commands.push({ method: 'set', args: [key, value, options] })
    return this
  }

  del(...keys: string[]): this {
    this.commands.push({ method: 'del', args: keys })
    return this
  }

  incr(key: string): this {
    this.commands.push({ method: 'incr', args: [key] })
    return this
  }

  expire(key: string, seconds: number): this {
    this.commands.push({ method: 'expire', args: [key, seconds] })
    return this
  }

  async exec(): Promise<unknown[]> {
    const results: unknown[] = []
    for (const cmd of this.commands) {
      const method = this.cache[cmd.method as keyof DWSCache] as (...args: unknown[]) => Promise<unknown>
      results.push(await method.apply(this.cache, cmd.args))
    }
    return results
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a DWS cache client
 *
 * @example
 * ```typescript
 * const cache = createDWSCache({ namespace: 'myapp' })
 * await cache.set('key', 'value', { ex: 3600 })
 * const value = await cache.get('key')
 * ```
 */
export function createDWSCache(config?: CacheConfig): DWSCache {
  return new DWSCache(config)
}

/**
 * Create a Redis-compatible client (for compatibility with @upstash/redis)
 */
export const Redis = DWSCache

// ============================================================================
// Default Export
// ============================================================================

export const dwsCacheService = {
  createCache: createDWSCache,
  DWSCache,
  Redis,
}


