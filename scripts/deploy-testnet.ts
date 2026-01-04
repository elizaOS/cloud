#!/usr/bin/env bun
/**
 * Deploy Eliza Cloud V2 to Jeju Testnet
 *
 * This script:
 * 1. Builds the Docker image for linux/amd64
 * 2. Pushes to ECR
 * 3. Deploys to Kubernetes
 * 4. Registers JNS name (cloud.jeju)
 * 5. Verifies the deployment
 */

import { execSync, spawnSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'

const ROOT_DIR = resolve(import.meta.dir, '..')
const K8S_DIR = join(ROOT_DIR, 'k8s')
const ECR_REGISTRY = '502713364895.dkr.ecr.us-east-1.amazonaws.com'
const IMAGE_NAME = 'jeju/eliza-cloud'
const IMAGE_TAG = 'testnet-latest'
const FULL_IMAGE = `${ECR_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}`

interface DeployConfig {
  skipBuild: boolean
  skipPush: boolean
  skipK8s: boolean
  skipJns: boolean
  dryRun: boolean
}

function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warn: '\x1b[33m',
  }
  const reset = '\x1b[0m'
  const prefix = type === 'error' ? 'x' : type === 'success' ? 'check' : type === 'warn' ? 'warning' : 'info'
  console.log(`${colors[type]}[${prefix}]${reset} ${message}`)
}

function exec(cmd: string, options: { cwd?: string; silent?: boolean } = {}): string {
  const { cwd = ROOT_DIR, silent = false } = options
  if (!silent) {
    log(`Running: ${cmd}`)
  }
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }).trim()
  } catch (error) {
    const err = error as Error & { stdout?: Buffer; stderr?: Buffer }
    throw new Error(`Command failed: ${cmd}\n${err.stderr?.toString() || err.message}`)
  }
}

async function buildDockerImage(config: DeployConfig): Promise<void> {
  if (config.skipBuild) {
    log('Skipping Docker build', 'warn')
    return
  }

  log('Building Docker image for linux/amd64...')
  
  if (config.dryRun) {
    log('DRY RUN: Would build Docker image', 'warn')
    return
  }

  // Build with buildx for cross-platform support
  const buildCmd = [
    'docker', 'buildx', 'build',
    '--platform', 'linux/amd64',
    '-t', FULL_IMAGE,
    '-f', 'Dockerfile',
    '.',
    '--load'  // Load into local docker for testing
  ].join(' ')

  exec(buildCmd)
  log('Docker image built successfully', 'success')
}

async function pushToECR(config: DeployConfig): Promise<void> {
  if (config.skipPush) {
    log('Skipping ECR push', 'warn')
    return
  }

  log('Authenticating with ECR...')
  
  if (config.dryRun) {
    log('DRY RUN: Would push to ECR', 'warn')
    return
  }

  // Login to ECR
  const loginCmd = `aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${ECR_REGISTRY}`
  exec(loginCmd)

  // Ensure repository exists
  try {
    exec(`aws ecr describe-repositories --repository-names ${IMAGE_NAME} --region us-east-1`, { silent: true })
  } catch {
    log('Creating ECR repository...')
    exec(`aws ecr create-repository --repository-name ${IMAGE_NAME} --region us-east-1`)
  }

  // Push image
  log('Pushing Docker image to ECR...')
  exec(`docker push ${FULL_IMAGE}`)
  log('Image pushed to ECR successfully', 'success')
}

async function deployToK8s(config: DeployConfig): Promise<void> {
  if (config.skipK8s) {
    log('Skipping Kubernetes deployment', 'warn')
    return
  }

  log('Deploying to Kubernetes...')
  
  if (config.dryRun) {
    log('DRY RUN: Would deploy to Kubernetes', 'warn')
    return
  }

  // Apply the Kubernetes manifests
  const manifestPath = join(K8S_DIR, 'deployment.yaml')
  if (!existsSync(manifestPath)) {
    throw new Error(`Kubernetes manifest not found: ${manifestPath}`)
  }

  exec(`kubectl apply -f ${manifestPath}`)
  
  // Wait for rollout
  log('Waiting for deployment rollout...')
  try {
    exec('kubectl rollout status deployment/eliza-cloud -n eliza-cloud --timeout=300s')
    log('Deployment rolled out successfully', 'success')
  } catch {
    log('Deployment rollout taking longer than expected, checking status...', 'warn')
    const pods = exec('kubectl get pods -n eliza-cloud -o wide')
    console.log(pods)
  }
}

async function registerJNS(config: DeployConfig): Promise<void> {
  if (config.skipJns) {
    log('Skipping JNS registration', 'warn')
    return
  }

  log('Registering JNS name: cloud.jeju')
  
  if (config.dryRun) {
    log('DRY RUN: Would register JNS name', 'warn')
    return
  }

  // JNS registration requires the contracts to be deployed and the deployer key
  // This will be done via the DWS API or directly via smart contract call
  
  try {
    // Check if DWS is available for JNS registration
    const dwsUrl = 'https://dws.testnet.jejunetwork.org'
    const response = await fetch(`${dwsUrl}/health`)
    
    if (response.ok) {
      // Register via DWS API
      const jnsResponse = await fetch(`${dwsUrl}/jns/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'cloud.jeju',
          target: 'https://cloud.testnet.jejunetwork.org',
          type: 'A',
          metadata: {
            description: 'Eliza Cloud - AI Agent Development Platform',
            version: '2.0.0',
            provider: 'eliza-cloud'
          }
        })
      })
      
      if (jnsResponse.ok) {
        log('JNS name registered successfully', 'success')
      } else {
        log(`JNS registration response: ${await jnsResponse.text()}`, 'warn')
      }
    } else {
      log('DWS not available for JNS registration, will need manual registration', 'warn')
    }
  } catch (error) {
    log(`JNS registration failed (DWS may not be online yet): ${error}`, 'warn')
    log('JNS name will need to be registered manually once DWS is online', 'info')
  }
}

async function verifyDeployment(): Promise<void> {
  log('Verifying deployment...')
  
  // Check pods
  const pods = exec('kubectl get pods -n eliza-cloud -o wide', { silent: true })
  console.log('\nPods:')
  console.log(pods)
  
  // Check service
  const svc = exec('kubectl get svc -n eliza-cloud', { silent: true })
  console.log('\nServices:')
  console.log(svc)
  
  // Check ingress
  const ingress = exec('kubectl get ingress -n eliza-cloud', { silent: true })
  console.log('\nIngress:')
  console.log(ingress)
  
  // Try to hit the health endpoint
  log('Checking health endpoint...')
  try {
    const result = exec('kubectl run -n eliza-cloud test-curl --rm -i --restart=Never --image=curlimages/curl -- curl -s http://eliza-cloud/api/health', { silent: true })
    if (result.includes('ok') || result.includes('healthy')) {
      log('Health check passed', 'success')
    } else {
      log(`Health response: ${result}`, 'warn')
    }
  } catch {
    log('Health check via kubectl failed, may need external testing', 'warn')
  }
}

async function main() {
  console.log('')
  console.log('╔═══════════════════════════════════════════════════════════════════╗')
  console.log('║        ELIZA CLOUD V2 - TESTNET DEPLOYMENT                        ║')
  console.log('╚═══════════════════════════════════════════════════════════════════╝')
  console.log('')

  // Parse arguments
  const args = process.argv.slice(2)
  const config: DeployConfig = {
    skipBuild: args.includes('--skip-build'),
    skipPush: args.includes('--skip-push'),
    skipK8s: args.includes('--skip-k8s'),
    skipJns: args.includes('--skip-jns'),
    dryRun: args.includes('--dry-run'),
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: bun run scripts/deploy-testnet.ts [options]')
    console.log('')
    console.log('Options:')
    console.log('  --skip-build    Skip Docker image build')
    console.log('  --skip-push     Skip ECR push')
    console.log('  --skip-k8s      Skip Kubernetes deployment')
    console.log('  --skip-jns      Skip JNS registration')
    console.log('  --dry-run       Show what would be done without executing')
    console.log('  --help          Show this help')
    process.exit(0)
  }

  log(`Target: ${FULL_IMAGE}`)
  log(`Working directory: ${ROOT_DIR}`)
  console.log('')

  try {
    // Step 1: Build Docker image
    console.log('═══════════════════════════════════════════════════════════════════')
    console.log('Step 1: Build Docker Image')
    console.log('═══════════════════════════════════════════════════════════════════')
    await buildDockerImage(config)
    console.log('')

    // Step 2: Push to ECR
    console.log('═══════════════════════════════════════════════════════════════════')
    console.log('Step 2: Push to ECR')
    console.log('═══════════════════════════════════════════════════════════════════')
    await pushToECR(config)
    console.log('')

    // Step 3: Deploy to Kubernetes
    console.log('═══════════════════════════════════════════════════════════════════')
    console.log('Step 3: Deploy to Kubernetes')
    console.log('═══════════════════════════════════════════════════════════════════')
    await deployToK8s(config)
    console.log('')

    // Step 4: Register JNS
    console.log('═══════════════════════════════════════════════════════════════════')
    console.log('Step 4: Register JNS Name')
    console.log('═══════════════════════════════════════════════════════════════════')
    await registerJNS(config)
    console.log('')

    // Step 5: Verify
    console.log('═══════════════════════════════════════════════════════════════════')
    console.log('Step 5: Verify Deployment')
    console.log('═══════════════════════════════════════════════════════════════════')
    await verifyDeployment()
    console.log('')

    // Summary
    console.log('╔═══════════════════════════════════════════════════════════════════╗')
    console.log('║                    DEPLOYMENT COMPLETE                            ║')
    console.log('╠═══════════════════════════════════════════════════════════════════╣')
    console.log('║  URLs:                                                            ║')
    console.log('║    https://cloud.testnet.jejunetwork.org                          ║')
    console.log('║    https://eliza-cloud.testnet.jejunetwork.org                    ║')
    console.log('║                                                                   ║')
    console.log('║  JNS Name: cloud.jeju                                             ║')
    console.log('║                                                                   ║')
    console.log('║  Monitor:                                                         ║')
    console.log('║    kubectl logs -n eliza-cloud -l app.kubernetes.io/name=eliza-cloud -f ║')
    console.log('╚═══════════════════════════════════════════════════════════════════╝')

  } catch (error) {
    log(`Deployment failed: ${error}`, 'error')
    process.exit(1)
  }
}

main()
