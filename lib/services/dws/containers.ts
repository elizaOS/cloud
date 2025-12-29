/**
 * DWS Containers Service
 *
 * Replaces AWS CloudFormation/ECS with DWS container orchestration.
 * Provides production-ready container deployment and management.
 *
 * Features:
 * - Container deployment from Docker images
 * - Per-user container stacks
 * - Health monitoring
 * - Automatic scaling
 * - TEE support
 */

import { z } from 'zod'
import { getDWSConfig } from './config'
import { logger } from '@/lib/utils/logger'

// Container deployment configuration
export interface ContainerStackConfig {
  userId: string
  projectName: string
  userEmail: string
  containerImage: string
  containerPort: number
  containerCpu: number
  containerMemory: number
  architecture?: 'arm64' | 'x86_64'
  environmentVars?: Record<string, string>
  teeRequired?: boolean
  minInstances?: number
  maxInstances?: number
  healthCheckPath?: string
  healthCheckInterval?: number
}

// Container stack outputs
export interface ContainerStackOutputs {
  stackId: string
  stackName: string
  containerUrl: string
  directAccessUrl: string
  status: ContainerStackStatus
  instanceCount: number
  createdAt: Date
  updatedAt: Date
}

export type ContainerStackStatus =
  | 'creating'
  | 'running'
  | 'updating'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'deleted'

// Container metrics
export interface ContainerMetrics {
  cpuPercent: number
  memoryPercent: number
  networkInBytes: number
  networkOutBytes: number
  requestCount: number
  errorRate: number
  latencyP50: number
  latencyP99: number
}

// Container logs
export interface ContainerLogEntry {
  timestamp: Date
  stream: 'stdout' | 'stderr'
  message: string
}

// DWS Container API types
const DWSContainerStackSchema = z.object({
  stackId: z.string(),
  stackName: z.string(),
  userId: z.string(),
  projectName: z.string(),
  status: z.enum(['creating', 'running', 'updating', 'stopping', 'stopped', 'failed', 'deleted']),
  containerUrl: z.string(),
  directAccessUrl: z.string().optional(),
  instanceCount: z.number(),
  containerImage: z.string(),
  containerPort: z.number(),
  containerCpu: z.number(),
  containerMemory: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const DWSContainerMetricsSchema = z.object({
  cpuPercent: z.number(),
  memoryPercent: z.number(),
  networkInBytes: z.number(),
  networkOutBytes: z.number(),
  requestCount: z.number(),
  errorRate: z.number(),
  latencyP50: z.number(),
  latencyP99: z.number(),
})

const DWSContainerLogsSchema = z.object({
  entries: z.array(z.object({
    timestamp: z.string(),
    stream: z.enum(['stdout', 'stderr']),
    message: z.string(),
  })),
  nextToken: z.string().optional(),
})

/**
 * DWS Container Service
 */
class DWSContainerService {
  private config = getDWSConfig()

  /**
   * Get stack name for a user and project
   */
  getStackName(userId: string, projectName: string): string {
    const sanitizedProject = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 30)

    return `eliza-${userId.slice(0, 8)}-${sanitizedProject}`
  }

  /**
   * Create a new container stack
   */
  async createStack(config: ContainerStackConfig): Promise<ContainerStackOutputs> {
    const stackName = this.getStackName(config.userId, config.projectName)

    logger.info('[DWS Containers] Creating stack', {
      stackName,
      userId: config.userId,
      projectName: config.projectName,
      image: config.containerImage,
    })

    const response = await fetch(`${this.config.apiUrl}/containers/stacks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stackName,
        userId: config.userId,
        projectName: config.projectName,
        userEmail: config.userEmail,
        containerImage: config.containerImage,
        containerPort: config.containerPort,
        resources: {
          cpu: config.containerCpu,
          memory: config.containerMemory,
          architecture: config.architecture ?? 'arm64',
        },
        env: config.environmentVars ?? {},
        teeRequired: config.teeRequired ?? false,
        scaling: {
          minInstances: config.minInstances ?? 1,
          maxInstances: config.maxInstances ?? 3,
        },
        healthCheck: {
          path: config.healthCheckPath ?? '/health',
          intervalSeconds: config.healthCheckInterval ?? 30,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to create container stack: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const parsed = DWSContainerStackSchema.parse(data)

    logger.info('[DWS Containers] Stack created', {
      stackId: parsed.stackId,
      stackName: parsed.stackName,
      status: parsed.status,
    })

    return {
      stackId: parsed.stackId,
      stackName: parsed.stackName,
      containerUrl: parsed.containerUrl,
      directAccessUrl: parsed.directAccessUrl ?? parsed.containerUrl,
      status: parsed.status,
      instanceCount: parsed.instanceCount,
      createdAt: new Date(parsed.createdAt),
      updatedAt: new Date(parsed.updatedAt),
    }
  }

  /**
   * Update an existing container stack
   */
  async updateStack(
    userId: string,
    projectName: string,
    updates: Partial<ContainerStackConfig>,
  ): Promise<ContainerStackOutputs> {
    const stackName = this.getStackName(userId, projectName)

    logger.info('[DWS Containers] Updating stack', {
      stackName,
      updates: Object.keys(updates),
    })

    const response = await fetch(`${this.config.apiUrl}/containers/stacks/${stackName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        containerImage: updates.containerImage,
        resources: updates.containerCpu || updates.containerMemory ? {
          cpu: updates.containerCpu,
          memory: updates.containerMemory,
        } : undefined,
        env: updates.environmentVars,
        scaling: updates.minInstances || updates.maxInstances ? {
          minInstances: updates.minInstances,
          maxInstances: updates.maxInstances,
        } : undefined,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to update container stack: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const parsed = DWSContainerStackSchema.parse(data)

    logger.info('[DWS Containers] Stack updated', {
      stackId: parsed.stackId,
      status: parsed.status,
    })

    return {
      stackId: parsed.stackId,
      stackName: parsed.stackName,
      containerUrl: parsed.containerUrl,
      directAccessUrl: parsed.directAccessUrl ?? parsed.containerUrl,
      status: parsed.status,
      instanceCount: parsed.instanceCount,
      createdAt: new Date(parsed.createdAt),
      updatedAt: new Date(parsed.updatedAt),
    }
  }

  /**
   * Delete a container stack
   */
  async deleteStack(userId: string, projectName: string): Promise<void> {
    const stackName = this.getStackName(userId, projectName)

    logger.info('[DWS Containers] Deleting stack', { stackName })

    const response = await fetch(`${this.config.apiUrl}/containers/stacks/${stackName}`, {
      method: 'DELETE',
    })

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text()
      throw new Error(`Failed to delete container stack: ${response.status} - ${errorText}`)
    }

    logger.info('[DWS Containers] Stack deleted', { stackName })
  }

  /**
   * Get stack details
   */
  async getStack(userId: string, projectName: string): Promise<ContainerStackOutputs | null> {
    const stackName = this.getStackName(userId, projectName)

    const response = await fetch(`${this.config.apiUrl}/containers/stacks/${stackName}`)

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to get container stack: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const parsed = DWSContainerStackSchema.parse(data)

    return {
      stackId: parsed.stackId,
      stackName: parsed.stackName,
      containerUrl: parsed.containerUrl,
      directAccessUrl: parsed.directAccessUrl ?? parsed.containerUrl,
      status: parsed.status,
      instanceCount: parsed.instanceCount,
      createdAt: new Date(parsed.createdAt),
      updatedAt: new Date(parsed.updatedAt),
    }
  }

  /**
   * Wait for stack to reach a terminal state
   */
  async waitForStack(
    userId: string,
    projectName: string,
    targetStatus: ContainerStackStatus[],
    timeoutMinutes = 15,
  ): Promise<ContainerStackOutputs> {
    const stackName = this.getStackName(userId, projectName)
    const startTime = Date.now()
    const timeoutMs = timeoutMinutes * 60 * 1000

    while (Date.now() - startTime < timeoutMs) {
      const stack = await this.getStack(userId, projectName)

      if (!stack) {
        throw new Error(`Stack ${stackName} not found`)
      }

      if (targetStatus.includes(stack.status)) {
        logger.info('[DWS Containers] Stack reached target status', {
          stackName,
          status: stack.status,
        })
        return stack
      }

      if (stack.status === 'failed') {
        throw new Error(`Stack ${stackName} failed`)
      }

      logger.info('[DWS Containers] Waiting for stack', {
        stackName,
        currentStatus: stack.status,
        targetStatus,
      })

      await new Promise((resolve) => setTimeout(resolve, 10000))
    }

    throw new Error(`Stack ${stackName} timeout after ${timeoutMinutes} minutes`)
  }

  /**
   * Get container metrics
   */
  async getMetrics(
    userId: string,
    projectName: string,
    options: {
      startTime?: Date
      endTime?: Date
      period?: number
    } = {},
  ): Promise<ContainerMetrics[]> {
    const stackName = this.getStackName(userId, projectName)

    const params = new URLSearchParams()
    if (options.startTime) params.set('startTime', options.startTime.toISOString())
    if (options.endTime) params.set('endTime', options.endTime.toISOString())
    if (options.period) params.set('period', String(options.period))

    const response = await fetch(
      `${this.config.apiUrl}/containers/stacks/${stackName}/metrics?${params}`,
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to get container metrics: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    return z.array(DWSContainerMetricsSchema).parse(data)
  }

  /**
   * Get container logs
   */
  async getLogs(
    userId: string,
    projectName: string,
    options: {
      startTime?: Date
      endTime?: Date
      limit?: number
      nextToken?: string
      stream?: 'stdout' | 'stderr'
    } = {},
  ): Promise<{ entries: ContainerLogEntry[]; nextToken?: string }> {
    const stackName = this.getStackName(userId, projectName)

    const params = new URLSearchParams()
    if (options.startTime) params.set('startTime', options.startTime.toISOString())
    if (options.endTime) params.set('endTime', options.endTime.toISOString())
    if (options.limit) params.set('limit', String(options.limit))
    if (options.nextToken) params.set('nextToken', options.nextToken)
    if (options.stream) params.set('stream', options.stream)

    const response = await fetch(
      `${this.config.apiUrl}/containers/stacks/${stackName}/logs?${params}`,
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to get container logs: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const parsed = DWSContainerLogsSchema.parse(data)

    return {
      entries: parsed.entries.map((e) => ({
        timestamp: new Date(e.timestamp),
        stream: e.stream,
        message: e.message,
      })),
      nextToken: parsed.nextToken,
    }
  }

  /**
   * Stream container logs
   */
  async *streamLogs(
    userId: string,
    projectName: string,
    options: {
      follow?: boolean
      tail?: number
      stream?: 'stdout' | 'stderr'
    } = {},
  ): AsyncGenerator<ContainerLogEntry> {
    const stackName = this.getStackName(userId, projectName)

    const params = new URLSearchParams()
    if (options.follow) params.set('follow', 'true')
    if (options.tail) params.set('tail', String(options.tail))
    if (options.stream) params.set('stream', options.stream)

    const response = await fetch(
      `${this.config.apiUrl}/containers/stacks/${stackName}/logs/stream?${params}`,
    )

    if (!response.ok || !response.body) {
      const errorText = await response.text()
      throw new Error(`Failed to stream container logs: ${response.status} - ${errorText}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          
          try {
            const entry = JSON.parse(line)
            yield {
              timestamp: new Date(entry.timestamp),
              stream: entry.stream,
              message: entry.message,
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Restart container instances
   */
  async restart(userId: string, projectName: string): Promise<void> {
    const stackName = this.getStackName(userId, projectName)

    logger.info('[DWS Containers] Restarting stack', { stackName })

    const response = await fetch(`${this.config.apiUrl}/containers/stacks/${stackName}/restart`, {
      method: 'POST',
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to restart container stack: ${response.status} - ${errorText}`)
    }

    logger.info('[DWS Containers] Stack restart initiated', { stackName })
  }

  /**
   * Scale container instances
   */
  async scale(
    userId: string,
    projectName: string,
    instanceCount: number,
  ): Promise<void> {
    const stackName = this.getStackName(userId, projectName)

    logger.info('[DWS Containers] Scaling stack', { stackName, instanceCount })

    const response = await fetch(`${this.config.apiUrl}/containers/stacks/${stackName}/scale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceCount }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to scale container stack: ${response.status} - ${errorText}`)
    }

    logger.info('[DWS Containers] Stack scale initiated', { stackName, instanceCount })
  }

  /**
   * List all stacks for a user
   */
  async listStacks(userId: string): Promise<ContainerStackOutputs[]> {
    const response = await fetch(`${this.config.apiUrl}/containers/stacks?userId=${userId}`)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to list container stacks: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const parsed = z.array(DWSContainerStackSchema).parse(data)

    return parsed.map((s) => ({
      stackId: s.stackId,
      stackName: s.stackName,
      containerUrl: s.containerUrl,
      directAccessUrl: s.directAccessUrl ?? s.containerUrl,
      status: s.status,
      instanceCount: s.instanceCount,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    }))
  }

  /**
   * Execute a command in a running container
   */
  async exec(
    userId: string,
    projectName: string,
    command: string[],
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const stackName = this.getStackName(userId, projectName)

    const response = await fetch(`${this.config.apiUrl}/containers/stacks/${stackName}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to exec in container: ${response.status} - ${errorText}`)
    }

    return response.json()
  }

  /**
   * Get container status by DWS container ID
   */
  async getContainerStatus(dwsContainerId: string): Promise<{
    status: ContainerStackStatus | 'error'
    endpointUrl?: string
    region?: string
    error?: string
  } | null> {
    const response = await fetch(`${this.config.apiUrl}/containers/${dwsContainerId}`)

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      const errorText = await response.text()
      return {
        status: 'error',
        error: `Failed to get container status: ${response.status} - ${errorText}`,
      }
    }

    const data = await response.json()
    const parsed = DWSContainerStackSchema.parse(data)

    return {
      status: parsed.status,
      endpointUrl: parsed.containerUrl,
      region: 'dws-global',
    }
  }

  /**
   * Delete container by DWS container ID
   */
  async deleteContainer(dwsContainerId: string): Promise<void> {
    const response = await fetch(`${this.config.apiUrl}/containers/${dwsContainerId}`, {
      method: 'DELETE',
    })

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text()
      throw new Error(`Failed to delete container: ${response.status} - ${errorText}`)
    }

    logger.info('[DWS Containers] Container deleted', { dwsContainerId })
  }
}

// Singleton instance
let containerServiceInstance: DWSContainerService | null = null

export function getDWSContainerService(): DWSContainerService {
  if (!containerServiceInstance) {
    containerServiceInstance = new DWSContainerService()
  }
  return containerServiceInstance
}

export function resetDWSContainerService(): void {
  containerServiceInstance = null
}

// Export for compatibility with existing CloudFormation code
export class CloudFormationService {
  private service = getDWSContainerService()

  getStackName(userId: string, projectName: string = 'default'): string {
    return this.service.getStackName(userId, projectName)
  }

  async createUserStack(config: ContainerStackConfig): Promise<string> {
    const result = await this.service.createStack(config)
    return result.stackId
  }

  async updateUserStack(config: ContainerStackConfig): Promise<string> {
    const result = await this.service.updateStack(
      config.userId,
      config.projectName,
      config,
    )
    return result.stackId
  }

  async deleteUserStack(userId: string, projectName: string = 'default'): Promise<void> {
    await this.service.deleteStack(userId, projectName)
  }

  async getStack(userId: string, projectName: string = 'default') {
    return this.service.getStack(userId, projectName)
  }

  async getStackOutputs(userId: string, projectName: string = 'default') {
    const stack = await this.service.getStack(userId, projectName)
    if (!stack) return null

    return {
      containerUrl: stack.containerUrl,
      directAccessUrl: stack.directAccessUrl,
      serviceArn: stack.stackId,
      clusterArn: stack.stackId,
      clusterName: stack.stackName,
      instanceId: stack.stackId,
      instancePublicIp: '',
      instancePublicDns: '',
      targetGroupArn: stack.stackId,
      taskDefinitionArn: stack.stackId,
    }
  }

  async waitForStackComplete(
    userId: string,
    projectName: string = 'default',
    timeoutMinutes = 15,
  ): Promise<string> {
    const result = await this.service.waitForStack(
      userId,
      projectName,
      ['running'],
      timeoutMinutes,
    )
    return result.status
  }

  async waitForStackDeletion(
    userId: string,
    projectName: string = 'default',
    timeoutMinutes = 15,
  ): Promise<void> {
    const stackName = this.service.getStackName(userId, projectName)
    const startTime = Date.now()
    const timeoutMs = timeoutMinutes * 60 * 1000

    while (Date.now() - startTime < timeoutMs) {
      const stack = await this.service.getStack(userId, projectName)
      if (!stack || stack.status === 'deleted') {
        return
      }

      if (stack.status === 'failed') {
        throw new Error(`Stack ${stackName} deletion failed`)
      }

      await new Promise((resolve) => setTimeout(resolve, 10000))
    }

    throw new Error(`Stack ${stackName} deletion timeout`)
  }

  async isSharedInfrastructureDeployed(): Promise<boolean> {
    // DWS handles infrastructure automatically
    return true
  }
}

export const cloudFormationService = new CloudFormationService()

// Export singleton for direct access
export const dwsContainerService = getDWSContainerService()


