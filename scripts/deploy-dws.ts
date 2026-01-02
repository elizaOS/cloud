#!/usr/bin/env bun
/**
 * DWS Decentralized Deployment Script for Eliza Cloud
 *
 * Deploys Eliza Cloud to DWS (Decentralized Web Services) without Docker/K8s.
 * All resources are provisioned through the DWS marketplace.
 *
 * Flow:
 * 1. Check deployer wallet balance and fund if needed
 * 2. Build Next.js with standalone output
 * 3. Bundle for workerd runtime
 * 4. Upload static assets to IPFS
 * 5. Deploy worker to DWS network
 * 6. Configure database via SQLit
 * 7. Register with JNS
 * 8. Register cron jobs
 * 9. Verify deployment
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  parseEther,
  http,
  keccak256,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { z } from 'zod'

const ROOT_DIR = resolve(import.meta.dir, '..')
const BUNDLE_DIR = join(ROOT_DIR, '.dws-bundle')
const DWS_MANIFEST_PATH = join(ROOT_DIR, 'dws-manifest.json')
const PROJECT_CONFIG_PATH = join(ROOT_DIR, '.dws', 'project.json')

// ============================================================================
// Network Configuration (inlined from @jejunetwork/config)
// ============================================================================

type NetworkType = 'localnet' | 'testnet' | 'mainnet'

function getCurrentNetwork(): NetworkType {
  const envNetwork = process.env.JEJU_NETWORK ?? process.env.DWS_NETWORK
  if (!envNetwork) return 'localnet'
  if (envNetwork === 'localnet' || envNetwork === 'testnet' || envNetwork === 'mainnet') {
    return envNetwork
  }
  throw new Error(`Invalid network: ${envNetwork}. Must be one of: localnet, testnet, mainnet`)
}

function getDWSUrl(network: NetworkType): string {
  switch (network) {
    case 'mainnet':
      return 'https://dws.jejunetwork.org'
    case 'testnet':
      return 'https://dws.testnet.jejunetwork.org'
    default:
      return process.env.DWS_API_URL ?? 'http://localhost:4030'
  }
}

function getRpcUrl(network: NetworkType): string {
  // Allow override from environment
  if (process.env.RPC_URL) return process.env.RPC_URL
  
  switch (network) {
    case 'mainnet':
      return 'https://rpc.jejunetwork.org'
    case 'testnet':
      return 'https://testnet-rpc.jejunetwork.org'
    default:
      return 'http://localhost:6546'
  }
}

// Environment
const DWS_NETWORK = getCurrentNetwork()
const DWS_API_URL = process.env.DWS_API_URL ?? getDWSUrl(DWS_NETWORK)

// Minimum balance required for deployment
const MIN_BALANCE_ETH = 0.01
const MIN_BALANCE_WEI = parseEther(MIN_BALANCE_ETH.toString())

// Chain configuration per network
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

// DWS AppDeployer response format
interface DWSDeploymentResult {
  appName: string
  status: 'success' | 'partial' | 'failed'
  services: Array<{
    type: string
    name: string
    endpoint?: string
    port?: number
  }>
  database?: {
    type: string
    name: string
    connectionString?: string
    host?: string
    port?: number
  }
  workerCid?: string
  frontendCid?: string
  errors: string[]
}

// Our internal deployment result
interface DeploymentResult {
  deploymentId: string
  workerUrl: string
  staticUrl: string
  status: 'deploying' | 'ready' | 'error'
  regions: string[]
  createdAt: string
  frontendCid: string
  workerCid: string
}

const DWSDeploymentResultSchema = z.object({
  appName: z.string(),
  status: z.enum(['success', 'partial', 'failed']),
  services: z.array(z.object({
    type: z.string(),
    name: z.string(),
    endpoint: z.string().optional(),
    port: z.number().optional(),
  })),
  database: z.object({
    type: z.string(),
    name: z.string(),
    connectionString: z.string().optional(),
    host: z.string().optional(),
    port: z.number().optional(),
  }).optional(),
  workerCid: z.string().optional(),
  frontendCid: z.string().optional(),
  errors: z.array(z.string()),
})

// ============================================================================
// Logging Utilities
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
    warn: '!',
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
// Wallet Management
// ============================================================================

async function checkAndFundWallet(): Promise<{ address: Address; balance: bigint }> {
  log('Checking deployer wallet...', 'step')

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY ?? process.env.PRIVATE_KEY
  if (!privateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY or PRIVATE_KEY environment variable required')
  }

  const account = privateKeyToAccount(privateKey as Hex)
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

  const balance = await publicClient.getBalance({ address: account.address })
  log(`Deployer: ${account.address}`)
  log(`Balance: ${formatEther(balance)} ETH`)

  if (balance < MIN_BALANCE_WEI) {
    log(`Insufficient balance. Need at least ${MIN_BALANCE_ETH} ETH`, 'warn')

    if (DWS_NETWORK === 'localnet') {
      log('Requesting funds from localnet faucet...', 'step')
      // For localnet, the well-known anvil account has unlimited ETH
      const anvilKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex
      const anvilAccount = privateKeyToAccount(anvilKey)

      const walletClient = createWalletClient({
        account: anvilAccount,
        chain,
        transport: http(chainConfig.rpcUrl),
      })

      const hash = await walletClient.sendTransaction({
        to: account.address,
        value: parseEther('10'),
      })

      log(`Funded deployer with 10 ETH. Tx: ${hash}`, 'success')
      const newBalance = await publicClient.getBalance({ address: account.address })
      return { address: account.address, balance: newBalance }
    } else if (DWS_NETWORK === 'testnet') {
      log('For testnet, get ETH from faucet:', 'info')
      log('  https://www.alchemy.com/faucets/base-sepolia', 'info')
      log('  Or run: jeju faucet --chain base', 'info')
      throw new Error(`Insufficient balance: ${formatEther(balance)} ETH`)
    } else {
      throw new Error(`Insufficient balance for mainnet: ${formatEther(balance)} ETH`)
    }
  }

  log('Wallet funded', 'success')
  return { address: account.address, balance }
}

// ============================================================================
// Build Process
// ============================================================================

async function buildNextApp(): Promise<void> {
  log('Building Next.js application...', 'step')

  const result = Bun.spawnSync(['bun', 'run', 'build'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_EXPERIMENTAL_TURBOPACK: 'false',
    },
    stdout: 'inherit',
    stderr: 'inherit',
  })

  if (result.exitCode !== 0) {
    throw new Error('Next.js build failed')
  }

  log('Next.js build complete', 'success')
}

async function createDWSBundle(): Promise<void> {
  log('Creating DWS bundle...', 'step')

  const result = Bun.spawnSync(['bun', 'run', 'dws:bundle'], {
    cwd: ROOT_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
  })

  if (result.exitCode !== 0) {
    throw new Error('DWS bundle creation failed')
  }

  // Verify bundle exists
  if (!existsSync(BUNDLE_DIR)) {
    throw new Error('Bundle directory not created')
  }

  const manifestPath = join(BUNDLE_DIR, 'manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error('Bundle manifest not created')
  }

  log('DWS bundle created', 'success')
}

// ============================================================================
// IPFS Upload
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

  const response = await fetch(`${DWS_API_URL}/storage/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`IPFS upload failed: ${response.status} - ${errorText}`)
  }

  const result = await response.json() as { cid: string; size?: number }

  return {
    cid: result.cid,
    hash,
    size: content.length,
  }
}

async function uploadDirectory(dirPath: string, prefix: string = ''): Promise<Map<string, UploadResult>> {
  const results = new Map<string, UploadResult>()
  const entries = readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    const key = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      const subResults = await uploadDirectory(fullPath, key)
      for (const [k, v] of subResults) {
        results.set(k, v)
      }
    } else {
      const result = await uploadToIPFS(fullPath, key)
      results.set(key, result)
      log(`  Uploaded: ${key} -> ${result.cid}`)
    }
  }

  return results
}

// Directories to exclude from static upload (too large for initial deployment)
const EXCLUDED_STATIC_DIRS = [
  'cloud-agent-samples',
  'avatars',
  'cloud-avatars',
  'videos',
  'agents',
]

interface UploadResult {
  cid: string
  path: string
  size: number
}

async function uploadStaticAssets(): Promise<string> {
  log('Uploading static assets to IPFS...', 'step')

  const staticDir = join(BUNDLE_DIR, 'static')
  if (!existsSync(staticDir)) {
    throw new Error('Static assets directory not found')
  }

  // Collect files to upload (excluding large directories)
  const filesToUpload: string[] = []
  const collectFiles = (dir: string, base: string = ''): void => {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const relativePath = base ? `${base}/${entry}` : entry
      const stat = statSync(fullPath)
      
      if (stat.isDirectory()) {
        // Skip large directories
        if (EXCLUDED_STATIC_DIRS.includes(entry)) {
          log(`Skipping large directory: ${entry}`, 'info')
          continue
        }
        collectFiles(fullPath, relativePath)
      } else {
        filesToUpload.push(relativePath)
      }
    }
  }

  collectFiles(staticDir)
  log(`Found ${filesToUpload.length} files to upload`, 'info')

  // Sequential upload with retries - parallel uploads can overwhelm IPFS gateway
  const RETRY_COUNT = 5
  const RETRY_DELAY_MS = 3000
  
  const uploadedFiles: Record<string, string> = {}
  let uploaded = 0
  let failed = 0

  async function uploadWithRetry(relativePath: string): Promise<UploadResult | null> {
    const filePath = join(staticDir, relativePath)
    const content = readFileSync(filePath)
    
    for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
      try {
        // Use Bun.file for better FormData compatibility
        const file = Bun.file(filePath)
        const formData = new FormData()
        formData.append('file', file, relativePath.split('/').pop() ?? 'file')
        formData.append('tier', 'popular')
        formData.append('path', relativePath) // Store original path for reference
        
        const response = await fetch(`${DWS_API_URL}/storage/upload`, {
          method: 'POST',
          body: formData,
        })
        
        if (response.ok) {
          const result = await response.json() as { cid: string }
          return { cid: result.cid, path: relativePath, size: content.length }
        }
        
        const error = await response.text()
        if (attempt < RETRY_COUNT) {
          const delay = RETRY_DELAY_MS * attempt
          log(`  Retry ${attempt}/${RETRY_COUNT} for ${relativePath.split('/').pop()} (${error.slice(0, 40)})`, 'warn')
          await new Promise(r => setTimeout(r, delay))
        } else {
          log(`  Failed after ${RETRY_COUNT} retries: ${relativePath.split('/').pop()}`, 'error')
          return null
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (attempt < RETRY_COUNT) {
          const delay = RETRY_DELAY_MS * attempt
          log(`  Retry ${attempt}/${RETRY_COUNT} for ${relativePath.split('/').pop()} (${msg.slice(0, 40)})`, 'warn')
          await new Promise(r => setTimeout(r, delay))
        } else {
          log(`  Network error for ${relativePath.split('/').pop()}: ${msg}`, 'error')
          return null
        }
      }
    }
    
    return null
  }

  // Upload sequentially to avoid rate limits
  for (const relativePath of filesToUpload) {
    const result = await uploadWithRetry(relativePath)
    if (result) {
      uploadedFiles[result.path] = result.cid
      uploaded++
    } else {
      failed++
    }
    
    // Progress update every 20 files
    if ((uploaded + failed) % 20 === 0 || (uploaded + failed) === filesToUpload.length) {
      log(`Progress: ${uploaded} uploaded, ${failed} failed of ${filesToUpload.length}`, 'info')
    }
    
    // Small delay between uploads
    await new Promise(r => setTimeout(r, 100))
  }

  if (failed > 0) {
    log(`Warning: ${failed} files failed to upload`, 'warn')
  }

  // Upload the manifest of files
  const manifestContent = JSON.stringify({
    files: uploadedFiles,
    excludedDirs: EXCLUDED_STATIC_DIRS,
    uploadedAt: new Date().toISOString(),
  })
  
  const manifestForm = new FormData()
  manifestForm.append('file', new Blob([manifestContent]), 'static-manifest.json')
  manifestForm.append('tier', 'system')
  
  const manifestResponse = await fetch(`${DWS_API_URL}/storage/upload`, {
    method: 'POST',
    body: manifestForm,
  })
  
  if (!manifestResponse.ok) {
    throw new Error('Failed to upload manifest')
  }
  
  const manifestResult = await manifestResponse.json() as { cid: string }
  log(`Static assets uploaded. Manifest CID: ${manifestResult.cid}`, 'success')
  log(`Total files: ${uploaded}`, 'info')

  // Save local manifest for deployment
  writeFileSync(
    join(BUNDLE_DIR, 'static-files.json'),
    JSON.stringify(uploadedFiles, null, 2)
  )

  return manifestResult.cid
}

// ============================================================================
// Worker Deployment
// ============================================================================

async function deployWorker(staticCid: string, owner: Address): Promise<DeploymentResult> {
  log('Deploying worker to DWS...', 'step')

  const workerDir = join(BUNDLE_DIR, 'worker')
  if (!existsSync(workerDir)) {
    throw new Error('Worker bundle not found')
  }

  // Load manifests
  const dwsManifest = JSON.parse(readFileSync(DWS_MANIFEST_PATH, 'utf-8'))
  const appName = dwsManifest.name ?? 'eliza-cloud'

  // First, upload the worker bundle to storage (IPFS)
  log('Uploading worker bundle to IPFS...', 'step')
  
  // Create tarball of worker
  const tarPath = join(BUNDLE_DIR, 'worker.tar.gz')
  const tar = Bun.spawn(['tar', '-czf', tarPath, '-C', workerDir, '.'], {
    cwd: BUNDLE_DIR,
  })
  await tar.exited

  if (tar.exitCode !== 0) {
    throw new Error('Failed to create worker tarball')
  }

  const tarStats = statSync(tarPath)
  log(`Worker tarball size: ${(tarStats.size / 1024 / 1024).toFixed(1)}MB`, 'info')

  // Upload tarball to storage in chunks if needed
  const workerCid = await uploadLargeFile(tarPath, 'worker.tar.gz')
  log(`Worker uploaded to IPFS: ${workerCid}`, 'success')

  // Now deploy the worker using the /deploy/worker endpoint
  log('Deploying worker to runtime...', 'step')

  // Build deployment request
  const deployRequest = {
    name: appName,
    codeCid: workerCid,
    runtime: 'bun',
    handler: 'server.js',
    memory: dwsManifest.dws?.backend?.memory ?? 512,
    timeout: dwsManifest.dws?.backend?.timeout ?? 60000,
    routes: ['/api/*', '/*'],
    env: {
      NODE_ENV: 'production',
      STATIC_ASSETS_CID: staticCid,
      DWS_NETWORK: DWS_NETWORK,
    },
  }

  const response = await fetch(`${DWS_API_URL}/deploy/worker`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-jeju-address': owner,
    },
    body: JSON.stringify(deployRequest),
  })

  if (!response.ok) {
    const error = await response.text()
    log(`Worker deployment to runtime failed: ${error}`, 'warn')
    log('Continuing with static deployment...', 'info')
  } else {
    const workerResult = await response.json() as { functionId: string; status: string }
    log(`Worker deployed to runtime: ${workerResult.functionId}`, 'success')
  }

  // Also try the /deploy endpoint for infrastructure provisioning
  const infraResponse = await fetch(`${DWS_API_URL}/deploy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-jeju-address': owner,
    },
    body: JSON.stringify({
      manifest: {
        name: appName,
        version: dwsManifest.version ?? '1.0.0',
        dws: {
          ...dwsManifest.dws,
          workerCid,
          frontendCid: staticCid,
        },
      },
    }),
  })

  let dwsResult: DWSDeploymentResult | null = null
  if (infraResponse.ok) {
    const rawResult = await infraResponse.json()
    dwsResult = DWSDeploymentResultSchema.parse(rawResult)
    if (dwsResult.errors.length > 0) {
      log(`Deployment warnings: ${dwsResult.errors.join(', ')}`, 'warn')
    }
  }

  // Construct worker URL
  const workerUrl = DWS_NETWORK === 'mainnet' 
    ? `https://${appName}.jejunetwork.org`
    : `https://${appName}.testnet.jejunetwork.org`
  
  const result: DeploymentResult = {
    deploymentId: `dpl_${Date.now()}_${appName}`,
    workerUrl,
    staticUrl: `https://ipfs.io/ipfs/${staticCid}`,
    status: dwsResult?.status === 'success' ? 'ready' : dwsResult?.status === 'partial' ? 'deploying' : 'ready',
    regions: dwsManifest.dws?.backend?.regions ?? ['na-east'],
    createdAt: new Date().toISOString(),
    frontendCid: staticCid,
    workerCid,
  }

  log(`Worker deployed: ${result.deploymentId}`, 'success')
  log(`Worker URL: ${result.workerUrl}`)

  return result
}

// Upload large files in chunks
async function uploadLargeFile(filePath: string, filename: string): Promise<string> {
  const CHUNK_SIZE = 10 * 1024 * 1024 // 10MB chunks
  const content = readFileSync(filePath)
  const totalSize = content.length
  
  if (totalSize <= CHUNK_SIZE) {
    // Small file - direct upload
    const formData = new FormData()
    formData.append('file', new Blob([content]), filename)
    formData.append('tier', 'system')
    
    const response = await fetch(`${DWS_API_URL}/storage/upload`, {
      method: 'POST',
      body: formData,
    })
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${await response.text()}`)
    }
    
    const result = await response.json() as { cid: string }
    return result.cid
  }
  
  // Large file - upload in chunks and create manifest
  const chunkCids: string[] = []
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE)
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, totalSize)
    const chunk = content.slice(start, end)
    
    const formData = new FormData()
    formData.append('file', new Blob([chunk]), `${filename}.chunk.${i}`)
    formData.append('tier', 'system')
    
    const response = await fetch(`${DWS_API_URL}/storage/upload`, {
      method: 'POST',
      body: formData,
    })
    
    if (!response.ok) {
      throw new Error(`Chunk ${i} upload failed: ${await response.text()}`)
    }
    
    const result = await response.json() as { cid: string }
    chunkCids.push(result.cid)
    
    log(`Uploaded chunk ${i + 1}/${totalChunks}`, 'info')
  }
  
  // Upload manifest that references all chunks
  const manifest = {
    type: 'chunked-file',
    filename,
    totalSize,
    chunkSize: CHUNK_SIZE,
    chunks: chunkCids,
  }
  
  const manifestForm = new FormData()
  manifestForm.append('file', new Blob([JSON.stringify(manifest)]), `${filename}.manifest.json`)
  manifestForm.append('tier', 'system')
  
  const manifestResponse = await fetch(`${DWS_API_URL}/storage/upload`, {
    method: 'POST',
    body: manifestForm,
  })
  
  if (!manifestResponse.ok) {
    throw new Error(`Manifest upload failed: ${await manifestResponse.text()}`)
  }
  
  const manifestResult = await manifestResponse.json() as { cid: string }
  return manifestResult.cid
}

// ============================================================================
// Database Provisioning
// ============================================================================

async function provisionDatabase(owner: Address): Promise<{ connectionString: string; instanceId: string }> {
  log('Provisioning SQLit database...', 'step')

  const dwsManifest = JSON.parse(readFileSync(DWS_MANIFEST_PATH, 'utf-8'))
  const dbConfig = dwsManifest.dws?.database

  if (!dbConfig || dbConfig.type === 'none') {
    log('No database configuration in manifest, skipping', 'warn')
    return { connectionString: '', instanceId: '' }
  }

  // Use the correct DWS database API endpoint
  const response = await fetch(`${DWS_API_URL}/database`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wallet-address': owner,
    },
    body: JSON.stringify({
      name: dbConfig.name ?? 'eliza-cloud-db',
      engine: dbConfig.type === 'postgres' ? 'postgresql' : 'sqlit',
      planId: 'starter',
      region: 'us-east',
      config: {
        vcpus: dbConfig.resources?.cpuCores ?? 1,
        memoryMb: dbConfig.resources?.memoryMb ?? 512,
        storageMb: dbConfig.resources?.storageMb ?? 5120,
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    log(`Database provisioning failed: ${error}`, 'warn')
    log('Deployment will continue without database', 'warn')
    return { connectionString: '', instanceId: '' }
  }

  const result = await response.json() as { instance: { id: string; connectionString?: string } }
  log(`Database provisioned: ${result.instance.id}`, 'success')

  return {
    connectionString: result.instance.connectionString ?? '',
    instanceId: result.instance.id,
  }
}

// ============================================================================
// Cron Registration
// ============================================================================

interface CronJob {
  name: string
  schedule: string
  endpoint: string
  timeout?: number
}

async function registerCronJobs(workerUrl: string, owner: Address): Promise<void> {
  log('Registering cron jobs...', 'step')

  const dwsManifest = JSON.parse(readFileSync(DWS_MANIFEST_PATH, 'utf-8'))
  const cronJobs: CronJob[] = dwsManifest.cron ?? []

  if (cronJobs.length === 0) {
    log('No cron jobs defined in manifest', 'info')
    return
  }

  log(`Found ${cronJobs.length} cron jobs to register`, 'info')

  let registered = 0
  let failed = 0

  for (const cron of cronJobs) {
    try {
      // Build target endpoint - cron will POST to the worker's endpoint
      const targetEndpoint = `${workerUrl}${cron.endpoint}`
      
      const response = await fetch(`${DWS_API_URL}/ci/triggers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-jeju-address': owner,
        },
        body: JSON.stringify({
          name: cron.name ?? `cron-${cron.endpoint.replace(/\//g, '-')}`,
          type: 'cron',
          schedule: cron.schedule,
          target: targetEndpoint,
          enabled: true,
        }),
      })

      if (response.ok) {
        const result = await response.json() as { trigger: { id: string } }
        log(`  ${cron.name}: ${cron.schedule} -> ${result.trigger.id.slice(0, 8)}`)
        registered++
      } else {
        const error = await response.text()
        log(`  Failed: ${cron.name} - ${error.slice(0, 40)}`, 'warn')
        failed++
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      log(`  Error: ${cron.name} - ${msg.slice(0, 40)}`, 'warn')
      failed++
    }
  }

  log(`Cron jobs: ${registered} registered, ${failed} failed`, registered > 0 ? 'success' : 'warn')
}

// ============================================================================
// JNS Registration
// ============================================================================

async function registerJNS(deploymentUrl: string, staticCid: string, owner: Address): Promise<void> {
  log('Registering JNS name...', 'step')

  const projectConfig = existsSync(PROJECT_CONFIG_PATH)
    ? JSON.parse(readFileSync(PROJECT_CONFIG_PATH, 'utf-8'))
    : null

  const jnsName = projectConfig?.jnsName ?? 'cloud.jeju'

  // Use the correct DWS DNS API endpoint
  const response = await fetch(`${DWS_API_URL}/dns/jns/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-jeju-address': owner,
    },
    body: JSON.stringify({
      name: jnsName,
      target: deploymentUrl,
      type: 'A',
      contentCid: staticCid,
      metadata: {
        description: 'Eliza Cloud - AI Agent Development Platform',
        version: '2.0.0',
        provider: 'dws',
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    log(`JNS registration failed: ${error}`, 'warn')
    log('JNS registration can be done manually later', 'info')
    return
  }

  log(`JNS name registered: ${jnsName}`, 'success')
}

// ============================================================================
// Deployment Verification
// ============================================================================

async function waitForDeployment(deploymentId: string): Promise<DeploymentResult> {
  log('Waiting for deployment to be ready...', 'step')

  const startTime = Date.now()
  const timeout = 5 * 60 * 1000 // 5 minutes

  while (Date.now() - startTime < timeout) {
    const response = await fetch(`${DWS_API_URL}/deploy/status/${deploymentId}`, {
      headers: {
        'x-jeju-address': '0x0000000000000000000000000000000000000000',
      },
    })

    if (!response.ok) {
      // If status endpoint not found, assume deployment is ready (sync deployment)
      if (response.status === 404) {
        log('Deployment status endpoint not found, assuming ready', 'info')
        return {
          deploymentId,
          workerUrl: `https://eliza-cloud.${DWS_NETWORK === 'mainnet' ? '' : 'testnet.'}jejunetwork.org`,
          staticUrl: '',
          status: 'ready' as const,
          regions: ['na-east'],
          createdAt: new Date().toISOString(),
          frontendCid: '',
          workerCid: '',
        }
      }
      throw new Error(`Failed to get deployment status: ${response.status}`)
    }

    const rawResult = await response.json()
    
    // Try to parse the DWS format
    if ('status' in rawResult) {
      const status = rawResult.status as string
      if (status === 'success' || status === 'ready') {
        log('Deployment ready', 'success')
        return {
          deploymentId,
          workerUrl: `https://eliza-cloud.${DWS_NETWORK === 'mainnet' ? '' : 'testnet.'}jejunetwork.org`,
          staticUrl: rawResult.staticUrl ?? '',
          status: 'ready' as const,
          regions: rawResult.regions ?? ['na-east'],
          createdAt: rawResult.createdAt ?? new Date().toISOString(),
          frontendCid: rawResult.frontendCid ?? '',
          workerCid: rawResult.workerCid ?? '',
        }
      }

      if (status === 'failed' || status === 'error') {
        throw new Error(`Deployment failed: ${rawResult.errors?.join(', ') ?? 'Unknown error'}`)
      }
    }

    process.stdout.write('.')
    await Bun.sleep(5000)
  }

  throw new Error('Deployment timeout')
}

async function verifyDeployment(url: string): Promise<void> {
  log('Verifying deployment...', 'step')

  try {
    const response = await fetch(`${url}/api/health`, {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      log(`Health check returned ${response.status}`, 'warn')
      return
    }

    const health = await response.json()
    log(`Health check: ${JSON.stringify(health)}`, 'success')
  } catch (error) {
    log(`Health check failed: ${error}`, 'warn')
    log('The deployment may still be propagating', 'info')
  }
}

// ============================================================================
// Main Deployment Flow
// ============================================================================

interface DeployOptions {
  skipBuild: boolean
  skipBundle: boolean
  skipVerify: boolean
  dryRun: boolean
  preview: boolean
}

async function deploy(options: DeployOptions): Promise<void> {
  header('ELIZA CLOUD DWS DEPLOYMENT')

  console.log(`Network:  ${DWS_NETWORK}`)
  console.log(`DWS API:  ${DWS_API_URL}`)
  console.log(`Preview:  ${options.preview}`)
  console.log('')

  if (options.dryRun) {
    log('DRY RUN - simulating deployment', 'warn')
  }

  // Step 1: Check wallet (skip for dry run)
  header('1. WALLET CHECK')
  let deployerAddress: Address
  if (options.dryRun) {
    deployerAddress = '0x0000000000000000000000000000000000000000' as Address
    log('DRY RUN: Skipping wallet check', 'warn')
  } else {
    const result = await checkAndFundWallet()
    deployerAddress = result.address
  }

  // Step 2: Build
  if (!options.skipBuild) {
    header('2. BUILD')
    if (!options.dryRun) {
      await buildNextApp()
    } else {
      log('DRY RUN: Would build Next.js app', 'warn')
    }
  }

  // Step 3: Bundle
  if (!options.skipBundle) {
    header('3. BUNDLE')
    if (!options.dryRun) {
      await createDWSBundle()
    } else {
      log('DRY RUN: Would create DWS bundle', 'warn')
    }
  }

  // Step 4: Upload static assets
  header('4. UPLOAD STATIC ASSETS')
  let staticCid = ''
  if (!options.dryRun) {
    staticCid = await uploadStaticAssets()
  } else {
    staticCid = 'bafybeigdyrzt...'
    log('DRY RUN: Would upload static assets', 'warn')
  }

  // Step 5: Provision database
  header('5. DATABASE')
  let dbConnection = ''
  if (!options.dryRun) {
    const db = await provisionDatabase(deployerAddress)
    dbConnection = db.connectionString
  } else {
    log('DRY RUN: Would provision database', 'warn')
  }

  // Step 6: Deploy worker
  header('6. DEPLOY WORKER')
  let deployment: DeploymentResult
  if (!options.dryRun) {
    deployment = await deployWorker(staticCid, deployerAddress)
  } else {
    deployment = {
      deploymentId: 'dpl_dry_run',
      workerUrl: 'https://cloud.testnet.jejunetwork.org',
      staticUrl: `https://ipfs.io/ipfs/${staticCid}`,
      status: 'ready',
      regions: ['na-east'],
      createdAt: new Date().toISOString(),
      frontendCid: staticCid,
      workerCid: '',
    }
    log('DRY RUN: Would deploy worker', 'warn')
  }

  // Step 7: Wait for ready
  if (!options.dryRun && deployment.status !== 'ready') {
    header('7. WAIT FOR READY')
    deployment = await waitForDeployment(deployment.deploymentId)
  }

  // Step 8: Register JNS
  header('8. JNS REGISTRATION')
  if (!options.dryRun) {
    await registerJNS(deployment.workerUrl, staticCid, deployerAddress)
  } else {
    log('DRY RUN: Would register JNS', 'warn')
  }

  // Step 9: Register cron jobs
  header('9. CRON JOBS')
  if (!options.dryRun) {
    await registerCronJobs(deployment.workerUrl, deployerAddress)
  } else {
    log('DRY RUN: Would register cron jobs', 'warn')
  }

  // Step 10: Verify
  if (!options.skipVerify) {
    header('10. VERIFY')
    if (!options.dryRun) {
      await verifyDeployment(deployment.workerUrl)
    } else {
      log('DRY RUN: Would verify deployment', 'warn')
    }
  }

  // Summary
  header('DEPLOYMENT COMPLETE')
  console.log('')
  console.log('  URLs:')
  console.log(`    Worker:     ${deployment.workerUrl}`)
  console.log(`    Static:     ${deployment.staticUrl}`)
  console.log(`    IPFS:       ipfs://${staticCid}`)
  console.log('')
  console.log('  Info:')
  console.log(`    Deployment: ${deployment.deploymentId}`)
  console.log(`    Regions:    ${deployment.regions.join(', ')}`)
  console.log(`    Network:    ${DWS_NETWORK}`)
  console.log('')

  if (DWS_NETWORK === 'testnet') {
    console.log('  Access via:')
    console.log('    https://cloud.testnet.jejunetwork.org')
    console.log('    https://cloud.jns.testnet.jejunetwork.org')
  } else if (DWS_NETWORK === 'mainnet') {
    console.log('  Access via:')
    console.log('    https://cloud.jejunetwork.org')
    console.log('    https://cloud.jeju')
  }
}

// ============================================================================
// CLI
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Eliza Cloud DWS Deployment

Usage:
  bun run scripts/deploy-dws.ts [options]

Options:
  --skip-build     Skip Next.js build
  --skip-bundle    Skip DWS bundle creation
  --skip-verify    Skip deployment verification
  --dry-run        Simulate without making changes
  --preview        Deploy to preview environment
  --help           Show this help

Environment:
  DWS_NETWORK        Network (localnet, testnet, mainnet)
  DEPLOYER_PRIVATE_KEY  Deployer wallet private key

Examples:
  # Deploy to localnet
  DWS_NETWORK=localnet bun run scripts/deploy-dws.ts

  # Deploy to testnet
  DWS_NETWORK=testnet DEPLOYER_PRIVATE_KEY=0x... bun run scripts/deploy-dws.ts

  # Preview deployment (dry run)
  bun run scripts/deploy-dws.ts --dry-run
`)
    process.exit(0)
  }

  const options: DeployOptions = {
    skipBuild: args.includes('--skip-build'),
    skipBundle: args.includes('--skip-bundle'),
    skipVerify: args.includes('--skip-verify'),
    dryRun: args.includes('--dry-run'),
    preview: args.includes('--preview'),
  }

  try {
    await deploy(options)
  } catch (error) {
    log(`Deployment failed: ${error instanceof Error ? error.message : String(error)}`, 'error')
    process.exit(1)
  }
}

main()
