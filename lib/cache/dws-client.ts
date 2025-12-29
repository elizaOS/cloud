/**
 * DWS Cache Client - Drop-in replacement for Upstash Redis
 *
 * This module provides a Redis-compatible cache client that uses DWS cache
 * as the backend instead of Upstash Redis. It maintains API compatibility
 * with the existing CacheClient.
 *
 * Usage:
 * - Set DWS_CACHE_ENABLED=true to use DWS cache
 * - Falls back to Upstash Redis if DWS is not available
 */

import { DWSCache } from '@/lib/services/dws/cache'
import { logger } from '@/lib/utils/logger'

/**
 * Cached value wrapper with metadata for stale-while-revalidate.
 */
interface CachedValue<T> {
  data: T
  cachedAt: number
  staleAt: number
}

/**
 * DWS Cache Client with circuit breaker and stale-while-revalidate support.
 */
export class DWSCacheClient {
  private cache: DWSCache | null = null
  private enabled: boolean | null = null
  private initialized = false
  private failureCount = 0
  private lastFailureTime = 0
  private readonly MAX_FAILURES = 5
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000
  private revalidationQueue = new Map<string, Promise<void>>()
  private readonly MAX_REVALIDATION_QUEUE_SIZE = 100
  private readonly REVALIDATION_TIMEOUT_MS = 30000

  private initialize(): void {
    if (this.initialized) return
    this.initialized = true

    // Check if DWS cache is enabled
    const dwsEnabled = process.env.DWS_CACHE_ENABLED === 'true'
    this.enabled = process.env.CACHE_ENABLED !== 'false'

    if (!this.enabled) {
      if (process.env.NODE_ENV === 'production') {
        logger.error(
          '[DWS Cache] CRITICAL: Caching disabled in production. Set CACHE_ENABLED=true.',
        )
      } else {
        logger.warn('[DWS Cache] Caching is disabled via CACHE_ENABLED flag')
      }
      return
    }

    if (dwsEnabled) {
      const namespace = process.env.DWS_CACHE_NAMESPACE ?? 'eliza-cloud'
      this.cache = new DWSCache({
        namespace,
        defaultTTL: 3600,
        debug: process.env.NODE_ENV !== 'production',
      })
      logger.info('[DWS Cache] ✓ Cache client initialized with DWS backend')
    } else {
      // Will fall back to Upstash in the main client.ts
      this.enabled = false
      logger.debug('[DWS Cache] DWS cache not enabled, will use fallback')
    }
  }

  /**
   * Check if DWS cache is enabled and ready
   */
  isEnabled(): boolean {
    this.initialize()
    return this.enabled === true && this.cache !== null
  }

  /**
   * Gets a value from cache.
   */
  async get<T>(key: string): Promise<T | null> {
    this.initialize()
    if (!this.enabled || !this.cache || this.isCircuitOpen()) return null

    try {
      const start = Date.now()
      const value = await this.cache.get<string>(key)
      const duration = Date.now() - start

      if (value === null) {
        this.logMetric(key, 'miss', duration)
        return null
      }

      // Check for corrupted cache values
      if (typeof value === 'string' && value === '[object Object]') {
        logger.warn(`[DWS Cache] Corrupted cache value detected for key ${key}, deleting`)
        await this.del(key)
        return null
      }

      // Parse JSON string back to object
      const parsed: T = typeof value === 'string' ? JSON.parse(value) : value

      if (!this.isValidCacheValue(parsed)) {
        logger.warn(`[DWS Cache] Invalid cached value for key ${key}, deleting`)
        await this.del(key)
        return null
      }

      this.resetFailures()
      this.logMetric(key, 'hit', duration)
      return parsed
    } catch (error) {
      this.recordFailure()
      logger.error(`[DWS Cache] Error getting key ${key}:`, error)
      return null
    }
  }

  /**
   * Gets a value with stale-while-revalidate support.
   */
  async getWithSWR<T>(
    key: string,
    staleTTL: number,
    revalidate: () => Promise<T>,
    ttl?: number,
  ): Promise<T | null> {
    const effectiveTTL = ttl ?? staleTTL * 2
    this.initialize()

    if (!this.enabled || !this.cache || this.isCircuitOpen()) {
      return await revalidate()
    }

    try {
      const start = Date.now()
      const value = await this.cache.get<string>(key)
      const duration = Date.now() - start

      if (value === null) {
        this.logMetric(key, 'miss', duration)
        const fresh = await revalidate()
        if (fresh !== null) {
          await this.set(
            key,
            {
              data: fresh,
              cachedAt: Date.now(),
              staleAt: Date.now() + staleTTL * 1000,
            } as CachedValue<T>,
            effectiveTTL,
          )
        }
        return fresh
      }

      const raw = typeof value === 'string' ? JSON.parse(value) : value
      const parsed = raw as CachedValue<T>

      const now = Date.now()
      const isStale = now > parsed.staleAt

      if (isStale) {
        this.logMetric(key, 'stale', duration)
        const staleData = parsed.data

        if (this.revalidationQueue.size >= this.MAX_REVALIDATION_QUEUE_SIZE) {
          logger.warn(
            `[DWS Cache] Revalidation queue full. Skipping background revalidation for key: ${key}`,
          )
          return staleData
        }

        if (!this.revalidationQueue.has(key)) {
          const timeoutPromise = new Promise<T | null>((_, reject) => {
            setTimeout(() => reject(new Error('Revalidation timeout')), this.REVALIDATION_TIMEOUT_MS)
          })

          const revalidationPromise = Promise.race([revalidate(), timeoutPromise])
            .then((fresh) => {
              if (fresh !== null) {
                return this.set(
                  key,
                  {
                    data: fresh,
                    cachedAt: Date.now(),
                    staleAt: Date.now() + staleTTL * 1000,
                  } as CachedValue<T>,
                  effectiveTTL,
                )
              }
            })
            .finally(() => {
              this.revalidationQueue.delete(key)
            })

          this.revalidationQueue.set(key, revalidationPromise)
        }

        return staleData
      }

      this.logMetric(key, 'hit', duration)
      this.resetFailures()
      return parsed.data
    } catch (error) {
      this.recordFailure()
      logger.error(`[DWS Cache] Error in getWithSWR for key ${key}:`, error)
      return await revalidate()
    }
  }

  /**
   * Sets a value in cache.
   */
  async set<T>(key: string, value: T, ttl: number = 3600): Promise<void> {
    this.initialize()
    if (!this.enabled || !this.cache || this.isCircuitOpen()) return

    try {
      const start = Date.now()
      const serialized = typeof value === 'string' ? value : JSON.stringify(value)
      await this.cache.set(key, serialized, { ex: ttl })
      const duration = Date.now() - start

      this.resetFailures()
      this.logMetric(key, 'set', duration)
    } catch (error) {
      this.recordFailure()
      logger.error(`[DWS Cache] Error setting key ${key}:`, error)
    }
  }

  /**
   * Deletes one or more keys from cache.
   */
  async del(...keys: string[]): Promise<number> {
    this.initialize()
    if (!this.enabled || !this.cache) return 0

    try {
      const deleted = await this.cache.del(...keys)
      return deleted
    } catch (error) {
      logger.error(`[DWS Cache] Error deleting keys:`, error)
      return 0
    }
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
      this.failureCount = 0
    }
    return false
  }

  private recordFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
  }

  private resetFailures(): void {
    this.failureCount = 0
  }

  private isValidCacheValue(value: unknown): boolean {
    return (
      value !== null &&
      value !== undefined &&
      typeof value !== 'undefined' &&
      !(typeof value === 'string' && value === '[object Object]')
    )
  }

  private logMetric(key: string, type: 'hit' | 'miss' | 'stale' | 'set', duration: number): void {
    if (process.env.NODE_ENV !== 'production') {
      const prefix = key.split(':')[0]
      logger.debug(`[DWS Cache] ${type.toUpperCase()} ${prefix}:* (${duration}ms)`)
    }
  }
}

// Export singleton instance
export const dwsCacheClient = new DWSCacheClient()


