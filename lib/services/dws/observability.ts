/**
 * DWS Observability Service
 *
 * Drop-in replacement for AWS CloudWatch that uses DWS observability backend.
 * Provides logging, metrics, and tracing for containers and applications.
 *
 * Features:
 * - CloudWatch-compatible log retrieval API
 * - Container metrics (CPU, memory, network)
 * - Distributed tracing
 * - Real-time log streaming
 */

import { getDWSConfig } from './config'
import { logger } from '@/lib/utils/logger'

// ============================================================================
// Types
// ============================================================================

export interface LogEntry {
  timestamp: Date
  message: string
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  source?: string
  metadata?: Record<string, unknown>
}

export interface LogQueryOptions {
  /** Container or service ID */
  containerId: string
  /** Start time for logs */
  startTime?: Date
  /** End time for logs */
  endTime?: Date
  /** Log level filter */
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  /** Maximum number of logs to return */
  limit?: number
  /** Pagination token */
  nextToken?: string
  /** Filter pattern */
  filterPattern?: string
}

export interface LogQueryResult {
  logs: LogEntry[]
  nextToken?: string
  hasMore: boolean
}

export interface ContainerMetrics {
  containerId: string
  timestamp: Date
  cpu: {
    usagePercent: number
    cores: number
  }
  memory: {
    usedBytes: number
    totalBytes: number
    usagePercent: number
  }
  network: {
    rxBytes: number
    txBytes: number
    rxPackets: number
    txPackets: number
  }
  disk?: {
    readBytes: number
    writeBytes: number
    readOps: number
    writeOps: number
  }
}

export interface MetricDataPoint {
  timestamp: Date
  value: number
  unit: string
}

export interface MetricQueryOptions {
  containerId: string
  metricName: string
  startTime: Date
  endTime: Date
  period: number // in seconds
  stat: 'Average' | 'Sum' | 'Minimum' | 'Maximum' | 'SampleCount'
}

// ============================================================================
// DWS Observability Client
// ============================================================================

export class DWSObservability {
  private baseUrl: string
  private debug: boolean

  constructor(config?: { debug?: boolean }) {
    const dwsConfig = getDWSConfig()
    this.baseUrl = `${dwsConfig.apiUrl}/observability`
    this.debug = config?.debug ?? false
  }

  // =========================================================================
  // Logging
  // =========================================================================

  /**
   * Query logs for a container
   * Compatible with AWS CloudWatch GetLogEvents
   */
  async getLogs(options: LogQueryOptions): Promise<LogQueryResult> {
    const params = new URLSearchParams()
    params.set('containerId', options.containerId)
    if (options.startTime) params.set('startTime', options.startTime.toISOString())
    if (options.endTime) params.set('endTime', options.endTime.toISOString())
    if (options.level) params.set('level', options.level)
    if (options.limit) params.set('limit', String(options.limit))
    if (options.nextToken) params.set('nextToken', options.nextToken)
    if (options.filterPattern) params.set('filter', options.filterPattern)

    try {
      const response = await fetch(`${this.baseUrl}/logs?${params}`, {
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        throw new Error(`Failed to get logs: ${response.status}`)
      }

      const data = await response.json()
      return {
        logs: data.logs.map((log: Record<string, unknown>) => ({
          timestamp: new Date(log.timestamp as string),
          message: log.message as string,
          level: log.level as LogEntry['level'],
          source: log.source as string | undefined,
          metadata: log.metadata as Record<string, unknown> | undefined,
        })),
        nextToken: data.nextToken,
        hasMore: data.hasMore ?? false,
      }
    } catch (error) {
      if (this.debug) {
        logger.error('[DWS Observability] Failed to get logs', { error, options })
      }
      return { logs: [], hasMore: false }
    }
  }

  /**
   * Stream logs in real-time
   */
  async *streamLogs(
    containerId: string,
    options?: { level?: string; filter?: string },
  ): AsyncGenerator<LogEntry> {
    const params = new URLSearchParams()
    params.set('containerId', containerId)
    if (options?.level) params.set('level', options.level)
    if (options?.filter) params.set('filter', options.filter)

    try {
      const response = await fetch(`${this.baseUrl}/logs/stream?${params}`, {
        signal: AbortSignal.timeout(3600000), // 1 hour max
      })

      if (!response.ok || !response.body) {
        throw new Error(`Failed to stream logs: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))
            yield {
              timestamp: new Date(data.timestamp),
              message: data.message,
              level: data.level,
              source: data.source,
              metadata: data.metadata,
            }
          }
        }
      }
    } catch (error) {
      if (this.debug) {
        logger.error('[DWS Observability] Log stream error', { error })
      }
    }
  }

  /**
   * Push logs to DWS
   */
  async putLogs(containerId: string, logs: LogEntry[]): Promise<void> {
    await fetch(`${this.baseUrl}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        containerId,
        logs: logs.map((log) => ({
          ...log,
          timestamp: log.timestamp.toISOString(),
        })),
      }),
    })
  }

  // =========================================================================
  // Metrics
  // =========================================================================

  /**
   * Get current container metrics
   */
  async getContainerMetrics(containerId: string): Promise<ContainerMetrics | null> {
    try {
      const response = await fetch(`${this.baseUrl}/metrics/${containerId}`, {
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        return null
      }

      const data = await response.json()
      return {
        containerId,
        timestamp: new Date(data.timestamp),
        cpu: data.cpu,
        memory: data.memory,
        network: data.network,
        disk: data.disk,
      }
    } catch (error) {
      if (this.debug) {
        logger.error('[DWS Observability] Failed to get metrics', { error, containerId })
      }
      return null
    }
  }

  /**
   * Query metric data over time
   * Compatible with AWS CloudWatch GetMetricData
   */
  async getMetricData(options: MetricQueryOptions): Promise<MetricDataPoint[]> {
    const params = new URLSearchParams()
    params.set('containerId', options.containerId)
    params.set('metricName', options.metricName)
    params.set('startTime', options.startTime.toISOString())
    params.set('endTime', options.endTime.toISOString())
    params.set('period', String(options.period))
    params.set('stat', options.stat)

    try {
      const response = await fetch(`${this.baseUrl}/metrics/query?${params}`, {
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        return []
      }

      const data = await response.json()
      return data.dataPoints.map((point: Record<string, unknown>) => ({
        timestamp: new Date(point.timestamp as string),
        value: point.value as number,
        unit: point.unit as string,
      }))
    } catch (error) {
      if (this.debug) {
        logger.error('[DWS Observability] Failed to query metrics', { error, options })
      }
      return []
    }
  }

  /**
   * Put custom metric data
   */
  async putMetricData(
    containerId: string,
    metricName: string,
    value: number,
    unit: string,
  ): Promise<void> {
    await fetch(`${this.baseUrl}/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        containerId,
        metricName,
        value,
        unit,
        timestamp: new Date().toISOString(),
      }),
    })
  }

  // =========================================================================
  // Tracing
  // =========================================================================

  /**
   * Get traces for a container
   */
  async getTraces(
    containerId: string,
    options?: { startTime?: Date; endTime?: Date; limit?: number },
  ): Promise<Array<{
    traceId: string
    spanId: string
    parentSpanId?: string
    operationName: string
    startTime: Date
    duration: number
    status: 'OK' | 'ERROR'
    tags: Record<string, string>
  }>> {
    const params = new URLSearchParams()
    params.set('containerId', containerId)
    if (options?.startTime) params.set('startTime', options.startTime.toISOString())
    if (options?.endTime) params.set('endTime', options.endTime.toISOString())
    if (options?.limit) params.set('limit', String(options.limit))

    try {
      const response = await fetch(`${this.baseUrl}/traces?${params}`, {
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        return []
      }

      const data = await response.json()
      return data.traces.map((trace: Record<string, unknown>) => ({
        ...trace,
        startTime: new Date(trace.startTime as string),
      }))
    } catch {
      return []
    }
  }

  // =========================================================================
  // Health & Status
  // =========================================================================

  /**
   * Check container health
   */
  async checkHealth(containerId: string): Promise<{
    healthy: boolean
    status: string
    checks: Array<{ name: string; status: 'pass' | 'fail'; message?: string }>
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/health/${containerId}`, {
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        return {
          healthy: false,
          status: 'unreachable',
          checks: [],
        }
      }

      return response.json()
    } catch {
      return {
        healthy: false,
        status: 'error',
        checks: [],
      }
    }
  }
}

// ============================================================================
// CloudWatch Compatibility Layer
// ============================================================================

/**
 * CloudWatch-compatible client for backwards compatibility
 */
export class CloudWatchLogsClient {
  private obs: DWSObservability

  constructor(_config?: Record<string, unknown>) {
    this.obs = new DWSObservability()
  }

  async send(command: GetLogEventsCommand): Promise<{ events: OutputLogEvent[] }> {
    const result = await this.obs.getLogs({
      containerId: command.logGroupName,
      startTime: command.startTime ? new Date(command.startTime) : undefined,
      endTime: command.endTime ? new Date(command.endTime) : undefined,
      limit: command.limit,
      nextToken: command.nextToken,
    })

    return {
      events: result.logs.map((log) => ({
        timestamp: log.timestamp.getTime(),
        message: log.message,
        ingestionTime: log.timestamp.getTime(),
      })),
    }
  }
}

export class GetLogEventsCommand {
  logGroupName: string
  logStreamName?: string
  startTime?: number
  endTime?: number
  limit?: number
  nextToken?: string

  constructor(input: {
    logGroupName: string
    logStreamName?: string
    startTime?: number
    endTime?: number
    limit?: number
    nextToken?: string
  }) {
    this.logGroupName = input.logGroupName
    this.logStreamName = input.logStreamName
    this.startTime = input.startTime
    this.endTime = input.endTime
    this.limit = input.limit
    this.nextToken = input.nextToken
  }
}

export interface OutputLogEvent {
  timestamp?: number
  message?: string
  ingestionTime?: number
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a DWS observability client
 */
export function createObservabilityClient(config?: { debug?: boolean }): DWSObservability {
  return new DWSObservability(config)
}

// Default export
export const dwsObservabilityService = {
  createClient: createObservabilityClient,
  DWSObservability,
  CloudWatchLogsClient,
  GetLogEventsCommand,
}


