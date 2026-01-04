/**
 * Eliza Cloud DWS Worker
 *
 * DWS-deployable Elysia worker for the Eliza Cloud API.
 * This provides a decentralized backend that can run on DWS workers (workerd/Cloudflare compatible).
 *
 * Pattern follows apps/bazaar/api/worker.ts
 */

import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'

// Worker Environment Types
export interface ElizaCloudEnv {
  // Standard workerd bindings
  TEE_MODE: 'real' | 'simulated'
  TEE_PLATFORM: string
  TEE_REGION: string
  NETWORK: 'localnet' | 'testnet' | 'mainnet'
  RPC_URL: string

  // Service URLs
  DWS_URL: string
  DATABASE_URL: string

  // Cache bindings (optional)
  ELIZA_CACHE?: KVNamespace
}

interface KVNamespace {
  get(key: string): Promise<string | null>
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>
  delete(key: string): Promise<void>
}

// ============================================================================
// API Routes
// ============================================================================

export function createElizaCloudAPI(env?: Partial<ElizaCloudEnv>) {
  const isDev = env?.NETWORK === 'localnet'

  const app = new Elysia().use(
    cors({
      origin: isDev
        ? true
        : [
            'https://cloud.jejunetwork.org',
            'https://cloud.testnet.jejunetwork.org',
            'https://eliza.ai',
          ],
      credentials: true,
    }),
  )

  // Health check
  app.get('/health', () => ({
    status: 'ok',
    service: 'eliza-cloud-api',
    version: '2.0.0',
    teeMode: env?.TEE_MODE ?? 'simulated',
    teePlatform: env?.TEE_PLATFORM ?? 'local',
    network: env?.NETWORK ?? 'localnet',
  }))

  // API Info
  app.get('/api', () => ({
    service: 'eliza-cloud',
    version: '2.0.0',
    description: 'AI Agent Development Platform',
    endpoints: [
      '/health',
      '/api/agents',
      '/api/deployments',
      '/api/credits',
      '/api/auth',
    ],
  }))

  // ============================================================================
  // Agents API
  // ============================================================================

  app.group('/api/agents', (app) =>
    app
      .get('/', async () => {
        // TODO: Fetch from SQLit database
        return {
          agents: [],
          total: 0,
          page: 1,
          limit: 20,
        }
      })
      .get('/:agentId', async ({ params }) => {
        // TODO: Fetch agent details from database
        return {
          id: params.agentId,
          name: 'Agent',
          status: 'active',
        }
      })
      .post('/', async ({ body }) => {
        // TODO: Create agent
        return {
          success: true,
          agentId: crypto.randomUUID(),
        }
      }),
  )

  // ============================================================================
  // Deployments API
  // ============================================================================

  app.group('/api/deployments', (app) =>
    app
      .get('/', async () => {
        return {
          deployments: [],
          total: 0,
        }
      })
      .post('/', async ({ body }) => {
        // TODO: Create deployment via DWS
        return {
          success: true,
          deploymentId: crypto.randomUUID(),
        }
      }),
  )

  // ============================================================================
  // Credits API
  // ============================================================================

  app.group('/api/credits', (app) =>
    app
      .get('/balance', async ({ headers }) => {
        const address = headers['x-wallet-address']
        // TODO: Fetch balance from database
        return {
          balance: 0,
          currency: 'CREDITS',
        }
      })
      .post('/purchase', async ({ body }) => {
        // TODO: Handle credit purchase
        return {
          success: true,
          transactionId: crypto.randomUUID(),
        }
      }),
  )

  // ============================================================================
  // Auth API
  // ============================================================================

  app.group('/api/auth', (app) =>
    app
      .get('/session', async ({ headers }) => {
        // TODO: Validate session
        return {
          authenticated: false,
        }
      })
      .post('/signin', async ({ body }) => {
        // TODO: Handle sign in
        return {
          success: false,
          message: 'Sign in not implemented',
        }
      }),
  )

  // ============================================================================
  // A2A / MCP Protocol Endpoints
  // ============================================================================

  app.get('/.well-known/agent-card.json', () => ({
    name: 'Eliza Cloud',
    description: 'AI Agent Development Platform',
    version: '2.0.0',
    homepage: 'https://cloud.jejunetwork.org',
    capabilities: ['agent-deployment', 'credits', 'monitoring'],
    a2a: '/api/a2a',
    mcp: '/api/mcp',
  }))

  app.group('/api/a2a', (app) =>
    app
      .get('/', () => ({
        protocol: 'a2a',
        version: '1.0.0',
        capabilities: [],
      }))
      .post('/', async ({ body }) => {
        // TODO: Handle A2A requests
        return { error: 'Not implemented' }
      }),
  )

  app.group('/api/mcp', (app) =>
    app
      .get('/', () => ({
        protocol: 'mcp',
        version: '1.0.0',
        capabilities: [],
      }))
      .post('/', async ({ body }) => {
        // TODO: Handle MCP requests
        return { error: 'Not implemented' }
      }),
  )

  return app
}

// ============================================================================
// Worker Export (for DWS/workerd)
// ============================================================================

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

let cachedApp: ReturnType<typeof createElizaCloudAPI> | null = null
let cachedEnvHash: string | null = null

function getAppForEnv(env: ElizaCloudEnv): ReturnType<typeof createElizaCloudAPI> {
  const envHash = `${env.NETWORK}-${env.TEE_MODE}`

  if (cachedApp && cachedEnvHash === envHash) {
    return cachedApp
  }

  cachedApp = createElizaCloudAPI(env).compile()
  cachedEnvHash = envHash
  return cachedApp
}

/**
 * Default export for workerd/Cloudflare Workers
 */
export default {
  async fetch(
    request: Request,
    env: ElizaCloudEnv,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const app = getAppForEnv(env)
    return app.handle(request)
  },
}

// ============================================================================
// Standalone Server (for local dev)
// ============================================================================

const isMainModule = typeof Bun !== 'undefined' && import.meta.path === Bun.main

if (isMainModule) {
  const PORT = parseInt(process.env.PORT ?? '3000', 10)

  const app = createElizaCloudAPI({
    NETWORK: (process.env.NETWORK as 'localnet' | 'testnet' | 'mainnet') ?? 'localnet',
    TEE_MODE: 'simulated',
    TEE_PLATFORM: 'local',
    TEE_REGION: 'local',
    RPC_URL: process.env.RPC_URL ?? 'http://localhost:8545',
    DWS_URL: process.env.DWS_URL ?? 'http://localhost:4010',
    DATABASE_URL: process.env.DATABASE_URL ?? '',
  })

  app.listen(PORT, () => {
    console.log(`Eliza Cloud API Worker running at http://localhost:${PORT}`)
  })
}
