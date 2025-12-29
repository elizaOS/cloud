/**
 * EQLite Database Client for Eliza Cloud
 *
 * This module provides database connectivity using EQLite (decentralized SQL)
 * as an alternative to Neon/PostgreSQL. It maintains API compatibility with
 * drizzle-orm for seamless migration.
 *
 * Usage:
 * - Set DWS_DATABASE_ENABLED=true to use EQLite
 * - Set EQLITE_ENDPOINT=http://localhost:4661 for the EQLite proxy
 * - Set EQLITE_DBID=eliza-cloud for the database ID
 */

import { logger } from '@/lib/utils/logger'

// ============================================================================
// Types
// ============================================================================

interface QueryResult<T = Record<string, unknown>> {
  rows: T[]
  rowCount: number
}

interface EQLiteConfig {
  endpoint: string
  dbid: string
  timeout?: number
  debug?: boolean
}

// ============================================================================
// EQLite Client
// ============================================================================

export class EQLiteClient {
  private config: EQLiteConfig
  private connected = false

  constructor(config: EQLiteConfig) {
    this.config = {
      ...config,
      timeout: config.timeout ?? 30000,
      debug: config.debug ?? false,
    }
  }

  /**
   * Connect to EQLite
   */
  async connect(): Promise<this> {
    if (this.connected) return this

    if (this.config.debug) {
      logger.info(`[EQLite] Connecting to ${this.config.endpoint}`)
    }

    // Verify connection
    const result = await this.query('SELECT 1 as test')
    if (result.rows.length > 0) {
      this.connected = true
      logger.info('[EQLite] ✓ Connected to EQLite database')
    }

    return this
  }

  /**
   * Execute a SELECT query
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const formattedSql = this.formatSql(sql, params)
    const rows = await this.fetch<T>('query', formattedSql)
    return {
      rows: rows ?? [],
      rowCount: rows?.length ?? 0,
    }
  }

  /**
   * Execute a write operation (INSERT, UPDATE, DELETE)
   */
  async exec<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const formattedSql = this.formatSql(sql, params)
    const rows = await this.fetch<T>('exec', formattedSql)
    return {
      rows: rows ?? [],
      rowCount: rows?.length ?? 0,
    }
  }

  /**
   * Execute raw SQL
   */
  async execute<T = Record<string, unknown>>(sql: string): Promise<QueryResult<T>> {
    const isRead = sql.trim().toUpperCase().startsWith('SELECT')
    return isRead ? this.query<T>(sql) : this.exec<T>(sql)
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(): Promise<void> {
    await this.exec('BEGIN')
  }

  /**
   * Commit a transaction
   */
  async commit(): Promise<void> {
    await this.exec('COMMIT')
  }

  /**
   * Rollback a transaction
   */
  async rollback(): Promise<void> {
    await this.exec('ROLLBACK')
  }

  /**
   * Run a function within a transaction
   */
  async transaction<T>(fn: (client: this) => Promise<T>): Promise<T> {
    await this.beginTransaction()
    try {
      const result = await fn(this)
      await this.commit()
      return result
    } catch (error) {
      await this.rollback()
      throw error
    }
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    this.connected = false
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private async fetch<T>(
    method: 'query' | 'exec',
    sql: string,
  ): Promise<T[] | null> {
    const uri = `${this.config.endpoint}/v1/${method}`

    const response = await fetch(uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assoc: true,
        database: this.config.dbid,
        query: sql,
      }),
      signal: AbortSignal.timeout(this.config.timeout!),
    })

    if (!response.ok) {
      throw new Error(`EQLite request failed: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()

    if (result.error) {
      throw new Error(`EQLite query error: ${result.error}`)
    }

    return result.data?.rows ?? null
  }

  private formatSql(sql: string, params: unknown[]): string {
    if (params.length === 0) return sql

    let index = 0
    return sql.replace(/\?/g, () => {
      const param = params[index++]
      if (param === null || param === undefined) return 'NULL'
      if (typeof param === 'string') return `'${param.replace(/'/g, "''")}'`
      if (typeof param === 'number') return String(param)
      if (typeof param === 'boolean') return param ? '1' : '0'
      if (param instanceof Date) return `'${param.toISOString()}'`
      if (Array.isArray(param)) return `(${param.map((v) => this.escapeValue(v)).join(', ')})`
      return `'${JSON.stringify(param).replace(/'/g, "''")}'`
    })
  }

  private escapeValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
    if (typeof value === 'number') return String(value)
    if (typeof value === 'boolean') return value ? '1' : '0'
    return `'${String(value).replace(/'/g, "''")}'`
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let eqliteClient: EQLiteClient | null = null

/**
 * Get or create the EQLite client
 */
export function getEQLiteClient(): EQLiteClient | null {
  if (process.env.DWS_DATABASE_ENABLED !== 'true') {
    return null
  }

  if (!eqliteClient) {
    const endpoint = process.env.EQLITE_ENDPOINT ?? 'http://localhost:4661'
    const dbid = process.env.EQLITE_DBID ?? 'eliza-cloud'

    eqliteClient = new EQLiteClient({
      endpoint,
      dbid,
      debug: process.env.NODE_ENV !== 'production',
    })
  }

  return eqliteClient
}

/**
 * Create an EQLite client with custom config
 */
export function createEQLiteClient(config: EQLiteConfig): EQLiteClient {
  return new EQLiteClient(config)
}

/**
 * Check if EQLite is enabled
 */
export function isEQLiteEnabled(): boolean {
  return process.env.DWS_DATABASE_ENABLED === 'true'
}

// ============================================================================
// Drizzle Compatibility
// ============================================================================

/**
 * Create a drizzle-compatible database interface using EQLite
 * This allows using drizzle-orm queries with EQLite backend
 */
export async function createEQLiteDrizzle() {
  const client = getEQLiteClient()
  if (!client) {
    throw new Error('EQLite is not enabled. Set DWS_DATABASE_ENABLED=true')
  }

  await client.connect()

  // Return a drizzle-compatible interface
  return {
    query: client.query.bind(client),
    execute: client.execute.bind(client),
    transaction: client.transaction.bind(client),
    
    // Drizzle-style select/insert/update/delete can be added here
    // For now, use raw SQL through execute()
  }
}

export { EQLiteClient }


