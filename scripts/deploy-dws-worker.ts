#!/usr/bin/env bun
/**
 * Deploy DWS Worker
 *
 * Deploys the Eliza Cloud API worker to DWS in the decentralized way:
 * 1. Upload worker.js to IPFS
 * 2. Deploy to DWS workers via /workers endpoint
 * 3. Register with app router via /deploy/apps
 *
 * Pattern follows apps/bazaar/scripts/deploy.ts
 */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import {
  getDWSUrl,
  getCurrentNetwork,
  getRpcUrl,
  type NetworkType,
} from '@jejunetwork/config'
import {
  createPublicClient,
  formatEther,
  http,
  keccak256,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { z } from 'zod'

const ROOT_DIR = resolve(import.meta.dir, '..')
const WORKER_DIR = `${ROOT_DIR}/dist/dws-worker`
const STATIC_FILES_PATH = `${ROOT_DIR}/.dws-bundle/static-files.json`

// Environment
const DWS_NETWORK = (process.env.DWS_NETWORK ?? process.env.JEJU_NETWORK ?? 'testnet') as NetworkType
const DWS_API_URL = process.env.DWS_API_URL ?? getDWSUrl(DWS_NETWORK)

// Chain configuration
const CHAIN_CONFIGS = {
  localnet: {
    id: 31337,
    name: 'Jeju Localnet',
    rpcUrl: 'http://localhost:6546',
  },
  testnet: {
    id: 420690,
    name: 'Jeju Testnet',
    rpcUrl: getRpcUrl('testnet'),
  },
  mainnet: {
    id: 420691,
    name: 'Jeju Mainnet',
    rpcUrl: getRpcUrl('mainnet'),
  },
} as const

// Schemas
const IPFSUploadResponseSchema = z.object({
  cid: z.string(),
  size: z.number().optional(),
})

const WorkerDeployResponseSchema = z.object({
  functionId: z.string(),
  name: z.string(),
  codeCid: z.string(),
  status: z.string(),
})

// ============================================================================
// Logging
// ============================================================================

function log(message: string, type: 'info' | 'success' | 'error' | 'warn' | 'step' = 'info'): void {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warn: '\x1b[33m',
    step: '\x1b[35m',
  }
  const reset = '\x1b[0m'
  const prefix = {
    info: 'i',
    success: 'ok',
    error: 'x',
    warn: '.',
    step: '>',
  }
  console.log(`${colors[type]}[${prefix[type]}]${reset} ${message}`)
}

function header(title: string): void {
  console.log('')
  console.log(`\x1b[1m=== ${title} ===\x1b[0m`)
  console.log('')
}

// ============================================================================
// Wallet
// ============================================================================

async function getDeployerAddress(): Promise<Address> {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY ?? process.env.PRIVATE_KEY
  if (!privateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY or PRIVATE_KEY environment variable required')
  }

  const account = privateKeyToAccount(privateKey as Hex)
  return account.address
}

async function checkWalletBalance(address: Address): Promise<bigint> {
  const chainConfig = CHAIN_CONFIGS[DWS_NETWORK]

  const chain = {
    id: chainConfig.id,
    name: chainConfig.name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
  }

  const publicClient = createPublicClient({
    chain,
    transport: http(chainConfig.rpcUrl),
  })

  return publicClient.getBalance({ address })
}

// ============================================================================
// Upload to IPFS
// ============================================================================

interface UploadResult {
  cid: string
  hash: Hex
  size: number
}

async function uploadToIPFS(filePath: string, name: string): Promise<UploadResult> {
  const content = readFileSync(filePath)
  const hash = keccak256(content) as Hex

  const formData = new FormData()
  formData.append('file', new Blob([content]), name)
  formData.append('name', name)
  formData.append('tier', 'system')

  const response = await fetch(`${DWS_API_URL}/storage/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`IPFS upload failed: ${response.status} - ${errorText}`)
  }

  const rawJson: unknown = await response.json()
  const parsed = IPFSUploadResponseSchema.safeParse(rawJson)
  if (!parsed.success) {
    throw new Error(`Invalid upload response: ${parsed.error.message}`)
  }

  return {
    cid: parsed.data.cid,
    hash,
    size: content.length,
  }
}

// ============================================================================
// Deploy Worker
// ============================================================================

async function deployWorker(
  owner: Address,
  workerUpload: UploadResult,
): Promise<{ functionId: string; endpoint: string }> {
  log('Deploying worker to DWS...', 'step')

  // Read worker code directly (small file, can POST directly)
  const workerPath = `${WORKER_DIR}/dws-worker.js`
  const workerCode = readFileSync(workerPath)

  const formData = new FormData()
  formData.append('code', new Blob([workerCode]), 'dws-worker.js')
  formData.append('name', 'eliza-cloud-api')
  formData.append('runtime', 'bun')
  formData.append('handler', 'dws-worker.default.fetch')
  formData.append('memory', '512')
  formData.append('timeout', '30000')

  const response = await fetch(`${DWS_API_URL}/workers`, {
    method: 'POST',
    headers: {
      'x-jeju-address': owner,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Worker deployment failed: ${response.status} - ${errorText}`)
  }

  const rawJson: unknown = await response.json()
  const parsed = WorkerDeployResponseSchema.safeParse(rawJson)
  if (!parsed.success) {
    throw new Error(`Invalid deploy response: ${parsed.error.message}`)
  }

  const functionId = parsed.data.functionId
  const endpoint = `${DWS_API_URL}/workers/${functionId}/http`

  log(`Worker deployed: ${functionId}`, 'success')
  log(`Endpoint: ${endpoint}`)

  return { functionId, endpoint }
}

// ============================================================================
// Register App with Router
// ============================================================================

async function registerApp(
  owner: Address,
  frontendStaticFiles: Record<string, string>,
  backendWorkerId: string,
  backendEndpoint: string,
): Promise<void> {
  log('Registering app with DWS router...', 'step')

  const body = {
    name: 'eliza-cloud',
    jnsName: 'cloud.jeju',
    frontendCid: null, // Using staticFiles instead
    spa: true,
    apiPaths: ['/api', '/health', '/.well-known'],
    backendWorkerId,
    backendEndpoint,
  }

  const response = await fetch(`${DWS_API_URL}/deploy/apps`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-jeju-address': owner,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    log(`App registration warning: ${errorText}`, 'warn')
    return
  }

  const result = await response.json() as { appId: string }
  log(`App registered: ${result.appId}`, 'success')
}

// ============================================================================
// Verify Deployment
// ============================================================================

async function verifyDeployment(workerEndpoint: string): Promise<void> {
  log('Verifying deployment...', 'step')

  try {
    const response = await fetch(`${workerEndpoint}/health`, {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      log(`Health check returned ${response.status}`, 'warn')
      return
    }

    const health = await response.json()
    log(`Health check passed: ${JSON.stringify(health)}`, 'success')
  } catch (error) {
    log(`Health check failed: ${error}`, 'warn')
    log('The worker may still be starting up', 'info')
  }
}

// ============================================================================
// Main
// ============================================================================

async function deploy(): Promise<void> {
  header('ELIZA CLOUD DWS WORKER DEPLOYMENT')

  console.log(`Network:  ${DWS_NETWORK}`)
  console.log(`DWS API:  ${DWS_API_URL}`)
  console.log('')

  // 1. Get deployer
  header('1. DEPLOYER')
  const owner = await getDeployerAddress()
  log(`Deployer: ${owner}`)

  try {
    const balance = await checkWalletBalance(owner)
    log(`Balance: ${formatEther(balance)} ETH`)
  } catch (error) {
    log(`Could not check balance: ${error}`, 'warn')
  }

  // 2. Check build exists
  header('2. BUILD CHECK')
  const workerPath = `${WORKER_DIR}/dws-worker.js`
  if (!existsSync(workerPath)) {
    log('Worker not built. Building now...', 'step')
    const buildResult = Bun.spawnSync(['bun', 'run', 'scripts/build-dws-worker.ts'], {
      cwd: ROOT_DIR,
      stdout: 'inherit',
      stderr: 'inherit',
    })
    if (buildResult.exitCode !== 0) {
      throw new Error('Worker build failed')
    }
  }
  log('Worker build found', 'success')

  // 3. Upload worker to IPFS
  header('3. UPLOAD WORKER')
  const workerUpload = await uploadToIPFS(workerPath, 'eliza-cloud-api.js')
  log(`Worker CID: ${workerUpload.cid}`, 'success')
  log(`Size: ${(workerUpload.size / 1024).toFixed(1)}KB`)

  // 4. Deploy worker
  header('4. DEPLOY WORKER')
  const { functionId, endpoint } = await deployWorker(owner, workerUpload)

  // 5. Load static files (if available)
  header('5. FRONTEND')
  let staticFiles: Record<string, string> = {}
  if (existsSync(STATIC_FILES_PATH)) {
    staticFiles = JSON.parse(readFileSync(STATIC_FILES_PATH, 'utf-8'))
    log(`Loaded ${Object.keys(staticFiles).length} static files from previous upload`, 'success')
  } else {
    log('No static files found. Frontend will need to be deployed separately.', 'warn')
  }

  // 6. Register with app router
  header('6. REGISTER APP')
  await registerApp(owner, staticFiles, functionId, endpoint)

  // 7. Verify
  header('7. VERIFY')
  await verifyDeployment(endpoint)

  // Summary
  header('DEPLOYMENT COMPLETE')
  console.log('')
  console.log('  Worker ID:    ' + functionId)
  console.log('  Worker CID:   ' + workerUpload.cid)
  console.log('  Endpoint:     ' + endpoint)
  console.log('')
  console.log('  URLs:')
  if (DWS_NETWORK === 'testnet') {
    console.log('    https://cloud.testnet.jejunetwork.org')
  } else if (DWS_NETWORK === 'mainnet') {
    console.log('    https://cloud.jejunetwork.org')
  }
  console.log('')
}

// CLI
async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Eliza Cloud DWS Worker Deployment

Usage:
  bun run scripts/deploy-dws-worker.ts [options]

Options:
  --help           Show this help

Environment:
  DWS_NETWORK        Network (localnet, testnet, mainnet)
  DEPLOYER_PRIVATE_KEY  Deployer wallet private key

Examples:
  # Deploy to testnet
  DWS_NETWORK=testnet DEPLOYER_PRIVATE_KEY=0x... bun run scripts/deploy-dws-worker.ts
`)
    process.exit(0)
  }

  try {
    await deploy()
  } catch (error) {
    log(`Deployment failed: ${error instanceof Error ? error.message : String(error)}`, 'error')
    process.exit(1)
  }
}

main()
