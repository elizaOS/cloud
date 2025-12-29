/**
 * DWS Cache Client for Discord Gateway
 *
 * Lightweight Redis-compatible cache client that calls DWS cache API.
 * Replaces @upstash/redis for the discord gateway microservice.
 */

const DWS_CACHE_URL = process.env.DWS_CACHE_URL ?? 'http://localhost:4030/cache'

export interface DWSCacheConfig {
  namespace?: string
  defaultTTL?: number
}

/**
 * DWS Cache client compatible with Redis operations
 */
export class DWSCache {
  private namespace: string
  private defaultTTL: number

  constructor(config: DWSCacheConfig = {}) {
    this.namespace = config.namespace ?? 'default'
    this.defaultTTL = config.defaultTTL ?? 3600
  }

  private prefixKey(key: string): string {
    return `${this.namespace}:${key}`
  }

  async get<T = string>(key: string): Promise<T | null> {
    const response = await fetch(`${DWS_CACHE_URL}/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: this.prefixKey(key) }),
    })

    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`DWS cache get failed: ${response.status}`)
    }

    const data = await response.json()
    if (data.value === null || data.value === undefined) return null

    // Try to parse JSON, otherwise return as-is
    if (typeof data.value === 'string') {
      try {
        return JSON.parse(data.value) as T
      } catch {
        return data.value as T
      }
    }
    return data.value as T
  }

  async set(key: string, value: string | number | object, options?: { ex?: number }): Promise<'OK'> {
    const ttl = options?.ex ?? this.defaultTTL
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value)

    const response = await fetch(`${DWS_CACHE_URL}/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: this.prefixKey(key),
        value: serialized,
        ttl,
      }),
    })

    if (!response.ok) {
      throw new Error(`DWS cache set failed: ${response.status}`)
    }

    return 'OK'
  }

  async setex(key: string, seconds: number, value: string | object): Promise<'OK'> {
    return this.set(key, value, { ex: seconds })
  }

  async del(key: string): Promise<number> {
    const response = await fetch(`${DWS_CACHE_URL}/del`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: this.prefixKey(key) }),
    })

    if (!response.ok && response.status !== 404) {
      throw new Error(`DWS cache del failed: ${response.status}`)
    }

    return 1
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const response = await fetch(`${DWS_CACHE_URL}/sadd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: this.prefixKey(key),
        members,
      }),
    })

    if (!response.ok) {
      throw new Error(`DWS cache sadd failed: ${response.status}`)
    }

    const data = await response.json()
    return data.added ?? members.length
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const response = await fetch(`${DWS_CACHE_URL}/srem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: this.prefixKey(key),
        members,
      }),
    })

    if (!response.ok && response.status !== 404) {
      throw new Error(`DWS cache srem failed: ${response.status}`)
    }

    const data = await response.json()
    return data.removed ?? 0
  }

  async smembers(key: string): Promise<string[]> {
    const response = await fetch(`${DWS_CACHE_URL}/smembers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: this.prefixKey(key) }),
    })

    if (!response.ok) {
      if (response.status === 404) return []
      throw new Error(`DWS cache smembers failed: ${response.status}`)
    }

    const data = await response.json()
    return data.members ?? []
  }

  async incr(key: string): Promise<number> {
    const response = await fetch(`${DWS_CACHE_URL}/incr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: this.prefixKey(key) }),
    })

    if (!response.ok) {
      throw new Error(`DWS cache incr failed: ${response.status}`)
    }

    const data = await response.json()
    return data.value
  }

  async expire(key: string, seconds: number): Promise<number> {
    const response = await fetch(`${DWS_CACHE_URL}/expire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: this.prefixKey(key),
        seconds,
      }),
    })

    if (!response.ok && response.status !== 404) {
      throw new Error(`DWS cache expire failed: ${response.status}`)
    }

    return 1
  }

  async ttl(key: string): Promise<number> {
    const response = await fetch(`${DWS_CACHE_URL}/ttl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: this.prefixKey(key) }),
    })

    if (!response.ok) {
      if (response.status === 404) return -2
      throw new Error(`DWS cache ttl failed: ${response.status}`)
    }

    const data = await response.json()
    return data.ttl ?? -1
  }

  async exists(...keys: string[]): Promise<number> {
    const response = await fetch(`${DWS_CACHE_URL}/exists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keys: keys.map((k) => this.prefixKey(k)),
      }),
    })

    if (!response.ok) {
      throw new Error(`DWS cache exists failed: ${response.status}`)
    }

    const data = await response.json()
    return data.count ?? 0
  }
}

