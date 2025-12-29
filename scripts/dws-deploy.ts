#!/usr/bin/env bun
/**
 * DWS Deploy Script
 *
 * Deploys the bundled application to DWS.
 * Handles:
 * - Static asset upload to DWS storage
 * - Worker deployment to DWS exec
 * - DNS/domain configuration
 * - Environment variable injection
 */

import { readFileSync, existsSync, createReadStream } from 'fs'
import { join, resolve } from 'path'
import { createTar } from 'tar'

const ROOT_DIR = resolve(import.meta.dir, '..')
const BUNDLE_DIR = join(ROOT_DIR, '.dws-bundle')
const MANIFEST_PATH = join(BUNDLE_DIR, 'manifest.json')
const DWS_MANIFEST_PATH = join(ROOT_DIR, 'dws-manifest.json')

// DWS Configuration from environment
const DWS_API_URL = process.env.DWS_API_URL ?? 'http://localhost:4030'
const DWS_NETWORK = process.env.DWS_NETWORK ?? 'localnet'
const DWS_NODE_ID = process.env.DWS_NODE_ID ?? 'local-node'

interface DeploymentResult {
  deploymentId: string
  workerUrl: string
  staticUrl: string
  status: 'deploying' | 'ready' | 'error'
  regions: string[]
  createdAt: string
}

async function uploadStaticAssets(): Promise<string> {
  console.log('Uploading static assets...')
  
  const staticDir = join(BUNDLE_DIR, 'static')
  if (!existsSync(staticDir)) {
    throw new Error('Static assets not found. Run "bun run dws:bundle" first.')
  }
  
  // Create tarball of static assets
  const tarPath = join(BUNDLE_DIR, 'static.tar.gz')
  
  const tar = Bun.spawn(['tar', '-czf', tarPath, '-C', staticDir, '.'], {
    cwd: BUNDLE_DIR,
  })
  await tar.exited
  
  if (tar.exitCode !== 0) {
    throw new Error('Failed to create static asset tarball')
  }
  
  // Upload to DWS storage
  const formData = new FormData()
  const tarFile = Bun.file(tarPath)
  formData.append('file', tarFile, 'static.tar.gz')
  formData.append('type', 'static-assets')
  formData.append('extract', 'true')
  
  const response = await fetch(`${DWS_API_URL}/storage/upload`, {
    method: 'POST',
    body: formData,
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to upload static assets: ${error}`)
  }
  
  const result = await response.json()
  console.log(`  Static assets uploaded: ${result.url}`)
  
  return result.url
}

async function deployWorker(staticUrl: string): Promise<DeploymentResult> {
  console.log('Deploying worker...')
  
  const workerDir = join(BUNDLE_DIR, 'worker')
  if (!existsSync(workerDir)) {
    throw new Error('Worker bundle not found. Run "bun run dws:bundle" first.')
  }
  
  // Read manifests
  const bundleManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
  const dwsManifest = JSON.parse(readFileSync(DWS_MANIFEST_PATH, 'utf-8'))
  
  // Create tarball of worker
  const tarPath = join(BUNDLE_DIR, 'worker.tar.gz')
  
  const tar = Bun.spawn(['tar', '-czf', tarPath, '-C', workerDir, '.'], {
    cwd: BUNDLE_DIR,
  })
  await tar.exited
  
  if (tar.exitCode !== 0) {
    throw new Error('Failed to create worker tarball')
  }
  
  // Load environment variables (filter sensitive ones)
  const envPath = join(ROOT_DIR, '.env.production')
  let env: Record<string, string> = {}
  
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8')
    const lines = envContent.split('\n')
    
    for (const line of lines) {
      if (line.startsWith('#') || !line.includes('=')) continue
      const [key, ...valueParts] = line.split('=')
      const value = valueParts.join('=').replace(/^["']|["']$/g, '')
      
      // Skip sensitive values - these should be set in DWS secrets
      const sensitiveKeys = ['PRIVATE_KEY', 'SECRET', 'PASSWORD', 'TOKEN', 'API_KEY']
      if (sensitiveKeys.some(k => key.includes(k))) continue
      
      env[key] = value
    }
  }
  
  // Deploy to DWS
  const formData = new FormData()
  const tarFile = Bun.file(tarPath)
  formData.append('worker', tarFile, 'worker.tar.gz')
  formData.append('manifest', JSON.stringify(dwsManifest))
  formData.append('env', JSON.stringify({
    ...env,
    STATIC_ASSETS_URL: staticUrl,
    NODE_ENV: 'production',
    DWS_NETWORK,
    DWS_NODE_ID,
  }))
  formData.append('network', DWS_NETWORK)
  
  const response = await fetch(`${DWS_API_URL}/deploy/nextjs`, {
    method: 'POST',
    body: formData,
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to deploy worker: ${error}`)
  }
  
  const result: DeploymentResult = await response.json()
  console.log(`  Worker deployed: ${result.workerUrl}`)
  console.log(`  Deployment ID: ${result.deploymentId}`)
  
  return result
}

async function waitForDeployment(deploymentId: string): Promise<DeploymentResult> {
  console.log('Waiting for deployment to be ready...')
  
  const startTime = Date.now()
  const timeout = 5 * 60 * 1000 // 5 minutes
  
  while (Date.now() - startTime < timeout) {
    const response = await fetch(`${DWS_API_URL}/deploy/${deploymentId}`)
    
    if (!response.ok) {
      throw new Error(`Failed to get deployment status: ${response.status}`)
    }
    
    const result: DeploymentResult = await response.json()
    
    if (result.status === 'ready') {
      console.log('  Deployment ready.')
      return result
    }
    
    if (result.status === 'error') {
      throw new Error('Deployment failed')
    }
    
    process.stdout.write('.')
    await new Promise(r => setTimeout(r, 5000))
  }
  
  throw new Error('Deployment timeout')
}

async function main(): Promise<void> {
  console.log('DWS Deploy Script')
  console.log('==================')
  console.log('')
  console.log(`Network: ${DWS_NETWORK}`)
  console.log(`API URL: ${DWS_API_URL}`)
  console.log('')
  
  // Check if bundle exists
  if (!existsSync(BUNDLE_DIR) || !existsSync(MANIFEST_PATH)) {
    console.error('Error: Bundle not found.')
    console.error('Run "bun run dws:bundle" first.')
    process.exit(1)
  }
  
  // Upload static assets
  const staticUrl = await uploadStaticAssets()
  
  // Deploy worker
  const deployment = await deployWorker(staticUrl)
  
  // Wait for deployment
  const result = await waitForDeployment(deployment.deploymentId)
  
  console.log('')
  console.log('Deployment complete.')
  console.log('')
  console.log('URLs:')
  console.log(`  Worker:  ${result.workerUrl}`)
  console.log(`  Static:  ${result.staticUrl}`)
  console.log('')
  console.log('Regions:', result.regions.join(', '))
  console.log('')
  
  // Output in a format that can be parsed by CI
  console.log('::set-output name=worker_url::' + result.workerUrl)
  console.log('::set-output name=static_url::' + result.staticUrl)
  console.log('::set-output name=deployment_id::' + result.deploymentId)
}

main().catch((error) => {
  console.error('Deployment failed:', error.message)
  process.exit(1)
})


