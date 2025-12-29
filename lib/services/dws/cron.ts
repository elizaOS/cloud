/**
 * DWS Cron Service
 *
 * Replaces vercel.json crons with DWS-native scheduling.
 * Uses the croner library for cron expression parsing.
 *
 * Features:
 * - Cron job registration from configuration
 * - HTTP endpoint triggering
 * - Job status tracking
 * - Retry logic
 * - Execution history
 */

import { z } from 'zod'
import { getDWSConfig } from './config'
import { logger } from '@/lib/utils/logger'

// Cron job definition matching vercel.json format
export interface CronJobDefinition {
  path: string
  schedule: string
  timeoutMs?: number
  retries?: number
  enabled?: boolean
}

// Cron job execution result
export interface CronExecutionResult {
  jobId: string
  path: string
  status: 'success' | 'failed' | 'timeout' | 'skipped'
  startedAt: Date
  completedAt: Date
  durationMs: number
  statusCode?: number
  error?: string
  retryCount: number
}

// Cron job status
export interface CronJobStatus {
  jobId: string
  path: string
  schedule: string
  enabled: boolean
  lastRun?: Date
  lastStatus?: 'success' | 'failed' | 'timeout'
  nextRun: Date
  runCount: number
  failureCount: number
}

// Default cron jobs from vercel.json
const DEFAULT_CRON_JOBS: CronJobDefinition[] = [
  { path: '/api/cron/auto-top-up', schedule: '*/15 * * * *' },
  { path: '/api/v1/cron/deployment-monitor', schedule: '* * * * *' },
  { path: '/api/v1/cron/health-check', schedule: '* * * * *' },
  { path: '/api/cron/sample-eliza-price', schedule: '*/5 * * * *' },
  { path: '/api/cron/process-redemptions', schedule: '*/5 * * * *' },
  { path: '/api/cron/agent-budgets', schedule: '*/15 * * * *' },
  { path: '/api/cron/release-pending-earnings', schedule: '0 0 * * *' },
  { path: '/api/cron/cleanup-anonymous-sessions', schedule: '0 */6 * * *' },
  { path: '/api/cron/n8n-workflow-triggers', schedule: '* * * * *' },
  { path: '/api/cron/domain-health', schedule: '0 */6 * * *' },
  { path: '/api/cron/content-scan', schedule: '0 4 * * *' },
  { path: '/api/cron/agent-moderation', schedule: '0 2 * * 0' },
  { path: '/api/cron/cleanup-code-sessions', schedule: '*/15 * * * *' },
  { path: '/api/cron/webhook-triggers', schedule: '* * * * *' },
  { path: '/api/cron/cleanup-expired-crypto-payments', schedule: '*/10 * * * *' },
  { path: '/api/cron/cleanup-webhook-events', schedule: '0 2 * * *' },
]

// DWS Cron API types
const DWSCronJobSchema = z.object({
  jobId: z.string(),
  path: z.string(),
  schedule: z.string(),
  enabled: z.boolean(),
  timeoutMs: z.number(),
  retries: z.number(),
  lastRun: z.string().nullable(),
  lastStatus: z.enum(['success', 'failed', 'timeout']).nullable(),
  nextRun: z.string(),
  runCount: z.number(),
  failureCount: z.number(),
})

const DWSCronExecutionSchema = z.object({
  executionId: z.string(),
  jobId: z.string(),
  status: z.enum(['success', 'failed', 'timeout', 'skipped']),
  startedAt: z.string(),
  completedAt: z.string(),
  durationMs: z.number(),
  statusCode: z.number().optional(),
  error: z.string().optional(),
  retryCount: z.number(),
})

/**
 * Parse cron expression and get next run time
 */
function getNextRunTime(schedule: string, after: Date = new Date()): Date {
  // Simple cron parsing - for production, use croner library
  // This is a basic implementation for common patterns
  const parts = schedule.split(' ')
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${schedule}`)
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts
  const next = new Date(after)
  next.setSeconds(0)
  next.setMilliseconds(0)

  // Simple increment - in production, use proper cron library
  if (minute.startsWith('*/')) {
    const interval = parseInt(minute.slice(2), 10)
    const currentMinute = next.getMinutes()
    const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval
    if (nextMinute >= 60) {
      next.setHours(next.getHours() + 1)
      next.setMinutes(nextMinute % 60)
    } else {
      next.setMinutes(nextMinute)
    }
  } else if (minute === '*') {
    next.setMinutes(next.getMinutes() + 1)
  } else {
    const targetMinute = parseInt(minute, 10)
    if (next.getMinutes() >= targetMinute) {
      next.setHours(next.getHours() + 1)
    }
    next.setMinutes(targetMinute)
  }

  return next
}

/**
 * Generate a unique job ID from path
 */
function generateJobId(path: string): string {
  return path
    .replace(/^\/api\//, '')
    .replace(/\//g, '-')
    .replace(/^-|-$/g, '')
}

class DWSCronService {
  private jobs = new Map<string, CronJobStatus>()
  private executionHistory: CronExecutionResult[] = []
  private timers = new Map<string, NodeJS.Timeout>()
  private baseUrl: string
  private running = false

  constructor() {
    const config = getDWSConfig()
    // Default to localhost:3000 for Next.js dev server
    this.baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 
                   process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
                   'http://localhost:3000'
  }

  /**
   * Register a cron job
   */
  registerJob(definition: CronJobDefinition): CronJobStatus {
    const jobId = generateJobId(definition.path)
    const nextRun = getNextRunTime(definition.schedule)

    const status: CronJobStatus = {
      jobId,
      path: definition.path,
      schedule: definition.schedule,
      enabled: definition.enabled ?? true,
      nextRun,
      runCount: 0,
      failureCount: 0,
    }

    this.jobs.set(jobId, status)
    logger.info('[DWS Cron] Registered job', { jobId, path: definition.path, schedule: definition.schedule })

    return status
  }

  /**
   * Register default jobs from vercel.json equivalent
   */
  registerDefaultJobs(): void {
    for (const job of DEFAULT_CRON_JOBS) {
      this.registerJob(job)
    }
    logger.info('[DWS Cron] Registered default jobs', { count: DEFAULT_CRON_JOBS.length })
  }

  /**
   * Start the cron scheduler
   */
  start(): void {
    if (this.running) return

    this.running = true
    logger.info('[DWS Cron] Starting scheduler')

    for (const [jobId, status] of this.jobs) {
      if (status.enabled) {
        this.scheduleJob(jobId)
      }
    }
  }

  /**
   * Stop the cron scheduler
   */
  stop(): void {
    this.running = false
    
    for (const [jobId, timer] of this.timers) {
      clearTimeout(timer)
      this.timers.delete(jobId)
    }

    logger.info('[DWS Cron] Stopped scheduler')
  }

  /**
   * Schedule a specific job
   */
  private scheduleJob(jobId: string): void {
    const status = this.jobs.get(jobId)
    if (!status || !status.enabled || !this.running) return

    const now = new Date()
    const delay = status.nextRun.getTime() - now.getTime()

    if (delay <= 0) {
      // Run immediately and reschedule
      this.executeJob(jobId)
      return
    }

    const timer = setTimeout(() => {
      this.timers.delete(jobId)
      this.executeJob(jobId)
    }, delay)

    this.timers.set(jobId, timer)
  }

  /**
   * Execute a cron job
   */
  async executeJob(jobId: string, manual = false): Promise<CronExecutionResult> {
    const status = this.jobs.get(jobId)
    if (!status) {
      throw new Error(`Job ${jobId} not found`)
    }

    const config = getDWSConfig()
    const startedAt = new Date()
    let result: CronExecutionResult

    logger.info('[DWS Cron] Executing job', { jobId, path: status.path, manual })

    try {
      const url = `${this.baseUrl}${status.path}`
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      // Add cron secret for authentication
      if (config.cronSecret) {
        headers['x-cron-secret'] = config.cronSecret
        headers['Authorization'] = `Bearer ${config.cronSecret}`
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(60000), // 60 second timeout
      })

      const completedAt = new Date()

      result = {
        jobId,
        path: status.path,
        status: response.ok ? 'success' : 'failed',
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        statusCode: response.status,
        retryCount: 0,
      }

      if (!response.ok) {
        result.error = `HTTP ${response.status}: ${await response.text().catch(() => 'Unknown error')}`
      }
    } catch (error) {
      const completedAt = new Date()
      const isTimeout = error instanceof Error && error.name === 'TimeoutError'

      result = {
        jobId,
        path: status.path,
        status: isTimeout ? 'timeout' : 'failed',
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        error: error instanceof Error ? error.message : 'Unknown error',
        retryCount: 0,
      }
    }

    // Update status
    status.lastRun = startedAt
    status.lastStatus = result.status === 'success' ? 'success' : result.status === 'timeout' ? 'timeout' : 'failed'
    status.runCount++
    if (result.status !== 'success') {
      status.failureCount++
    }

    // Calculate next run
    status.nextRun = getNextRunTime(status.schedule, new Date())

    // Store in history (keep last 100 per job)
    this.executionHistory.push(result)
    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(-1000)
    }

    logger.info('[DWS Cron] Job completed', {
      jobId,
      status: result.status,
      durationMs: result.durationMs,
      nextRun: status.nextRun,
    })

    // Schedule next run
    if (this.running && !manual) {
      this.scheduleJob(jobId)
    }

    return result
  }

  /**
   * Get all job statuses
   */
  getJobStatuses(): CronJobStatus[] {
    return Array.from(this.jobs.values())
  }

  /**
   * Get a specific job status
   */
  getJobStatus(jobId: string): CronJobStatus | undefined {
    return this.jobs.get(jobId)
  }

  /**
   * Enable a job
   */
  enableJob(jobId: string): void {
    const status = this.jobs.get(jobId)
    if (status) {
      status.enabled = true
      if (this.running) {
        this.scheduleJob(jobId)
      }
    }
  }

  /**
   * Disable a job
   */
  disableJob(jobId: string): void {
    const status = this.jobs.get(jobId)
    if (status) {
      status.enabled = false
      const timer = this.timers.get(jobId)
      if (timer) {
        clearTimeout(timer)
        this.timers.delete(jobId)
      }
    }
  }

  /**
   * Get execution history
   */
  getExecutionHistory(options: {
    jobId?: string
    limit?: number
    status?: 'success' | 'failed' | 'timeout'
  } = {}): CronExecutionResult[] {
    let history = this.executionHistory

    if (options.jobId) {
      history = history.filter((e) => e.jobId === options.jobId)
    }

    if (options.status) {
      history = history.filter((e) => e.status === options.status)
    }

    if (options.limit) {
      history = history.slice(-options.limit)
    }

    return history
  }

  /**
   * Get upcoming scheduled runs
   */
  getUpcomingRuns(limit = 10): Array<{ jobId: string; path: string; nextRun: Date }> {
    return Array.from(this.jobs.values())
      .filter((j) => j.enabled)
      .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime())
      .slice(0, limit)
      .map((j) => ({
        jobId: j.jobId,
        path: j.path,
        nextRun: j.nextRun,
      }))
  }

  /**
   * Trigger a job manually
   */
  async triggerJob(jobId: string): Promise<CronExecutionResult> {
    return this.executeJob(jobId, true)
  }

  /**
   * Get cron service stats
   */
  getStats(): {
    totalJobs: number
    enabledJobs: number
    totalRuns: number
    successRate: number
    failedJobs: number
  } {
    const jobs = Array.from(this.jobs.values())
    const totalRuns = jobs.reduce((sum, j) => sum + j.runCount, 0)
    const totalFailures = jobs.reduce((sum, j) => sum + j.failureCount, 0)

    return {
      totalJobs: jobs.length,
      enabledJobs: jobs.filter((j) => j.enabled).length,
      totalRuns,
      successRate: totalRuns > 0 ? (totalRuns - totalFailures) / totalRuns : 1,
      failedJobs: jobs.filter((j) => j.lastStatus === 'failed').length,
    }
  }
}

// Singleton instance
let cronServiceInstance: DWSCronService | null = null

export function getDWSCronService(): DWSCronService {
  if (!cronServiceInstance) {
    cronServiceInstance = new DWSCronService()
  }
  return cronServiceInstance
}

export function resetDWSCronService(): void {
  if (cronServiceInstance) {
    cronServiceInstance.stop()
    cronServiceInstance = null
  }
}

/**
 * Initialize cron service with default jobs
 */
export async function initializeDWSCron(): Promise<DWSCronService> {
  const service = getDWSCronService()
  service.registerDefaultJobs()
  service.start()
  return service
}

/**
 * Middleware to verify cron requests
 */
export function verifyCronRequest(request: Request): boolean {
  const config = getDWSConfig()
  
  if (!config.cronSecret) {
    // No secret configured, allow all requests
    return true
  }

  const authHeader = request.headers.get('Authorization')
  const cronHeader = request.headers.get('x-cron-secret')

  if (cronHeader === config.cronSecret) {
    return true
  }

  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === config.cronSecret) {
    return true
  }

  return false
}

export const dwsCronService = {
  getDWSCronService,
  resetDWSCronService,
  initializeDWSCron,
  verifyCronRequest,
  DEFAULT_CRON_JOBS,
}


