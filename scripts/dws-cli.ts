#!/usr/bin/env bun
/**
 * DWS CLI - Vercel-like deployment CLI for DWS
 *
 * Commands:
 *   dws              Deploy to production (alias: dws deploy)
 *   dws dev          Start local development server
 *   dws build        Build the project
 *   dws deploy       Deploy to DWS
 *   dws deploy --preview  Deploy preview environment
 *   dws env          Manage environment variables
 *   dws logs         Stream deployment logs
 *   dws domains      Manage custom domains
 *   dws rollback     Rollback to previous deployment
 *   dws inspect      Inspect deployment details
 *   dws ls           List deployments
 *   dws rm           Remove a deployment
 *   dws link         Link to a DWS project
 *   dws pull         Pull environment variables
 *   dws whoami       Show current user
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { spawn } from 'child_process'
import { getDWSUrl, getCurrentNetwork, type NetworkType } from '@jejunetwork/config'

const ROOT_DIR = resolve(import.meta.dir, '..')
const DWS_DIR = join(ROOT_DIR, '.dws')
const CONFIG_FILE = join(DWS_DIR, 'project.json')
const ENV_FILE = join(DWS_DIR, '.env.local')

// DWS Configuration - use centralized config
const DWS_NETWORK = (process.env.DWS_NETWORK ?? process.env.JEJU_NETWORK ?? 'localnet') as NetworkType

// Get API URL from centralized config or env override
function getDWSApiUrl(): string {
  if (process.env.DWS_API_URL) return process.env.DWS_API_URL
  return getDWSUrl(DWS_NETWORK)
}

// Get deployment domain based on network
function getDeploymentDomain(): string {
  switch (DWS_NETWORK) {
    case 'mainnet':
      return 'jejunetwork.org'
    case 'testnet':
      return 'testnet.jejunetwork.org'
    default:
      return 'dws.local'
  }
}

const DWS_API_URL = getDWSApiUrl()

interface ProjectConfig {
  projectId: string
  orgId: string
  name: string
  framework: 'nextjs' | 'remix' | 'astro' | 'static'
  buildCommand: string
  outputDirectory: string
  installCommand: string
  devCommand: string
  rootDirectory: string
  regions: string[]
  linkedAt: string
}

interface Deployment {
  id: string
  url: string
  state: 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED' | 'QUEUED'
  target: 'production' | 'preview'
  createdAt: string
  buildLogs?: string
  meta: {
    gitBranch?: string
    gitCommit?: string
    gitMessage?: string
  }
}

// ============================================================================
// Utilities
// ============================================================================

function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warn: '\x1b[33m',
  }
  const reset = '\x1b[0m'
  const prefix = type === 'error' ? '✖' : type === 'success' ? '✓' : type === 'warn' ? '⚠' : '▲'
  console.log(`${colors[type]}${prefix}${reset} ${message}`)
}

function spinner(message: string): { stop: (success?: boolean) => void } {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let i = 0
  const id = setInterval(() => {
    process.stdout.write(`\r\x1b[36m${frames[i++ % frames.length]}\x1b[0m ${message}`)
  }, 80)

  return {
    stop: (success = true) => {
      clearInterval(id)
      process.stdout.write('\r' + ' '.repeat(message.length + 5) + '\r')
      if (success) {
        log(message, 'success')
      }
    },
  }
}

async function fetchDWS(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${DWS_API_URL}${path}`
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

function loadConfig(): ProjectConfig | null {
  if (!existsSync(CONFIG_FILE)) return null
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
}

function saveConfig(config: ProjectConfig): void {
  if (!existsSync(DWS_DIR)) mkdirSync(DWS_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

async function getGitInfo(): Promise<{ branch: string; commit: string; message: string } | null> {
  try {
    const branch = Bun.spawnSync(['git', 'rev-parse', '--abbrev-ref', 'HEAD']).stdout.toString().trim()
    const commit = Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD']).stdout.toString().trim()
    const message = Bun.spawnSync(['git', 'log', '-1', '--pretty=%B']).stdout.toString().trim().split('\n')[0]
    return { branch, commit, message }
  } catch {
    return null
  }
}

// ============================================================================
// Commands
// ============================================================================

async function cmdDev() {
  log('Starting development server...')
  const config = loadConfig()

  const cmd = config?.devCommand ?? 'bun run dev:quick'
  const [binary, ...args] = cmd.split(' ')

  const proc = spawn(binary, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      DWS_API_URL,
      DWS_NETWORK,
    },
  })

  proc.on('error', (err) => {
    log(`Failed to start dev server: ${err.message}`, 'error')
    process.exit(1)
  })
}

async function cmdBuild() {
  const spin = spinner('Building project...')

  try {
    const config = loadConfig()
    const buildCmd = config?.buildCommand ?? 'bun run build:dws'
    const [binary, ...args] = buildCmd.split(' ')

    const result = Bun.spawnSync([binary, ...args], {
      cwd: ROOT_DIR,
      env: { ...process.env, NODE_ENV: 'production' },
    })

    if (result.exitCode !== 0) {
      spin.stop(false)
      log('Build failed', 'error')
      console.error(result.stderr.toString())
      process.exit(1)
    }

    spin.stop()
    log('Build completed successfully', 'success')
  } catch (error) {
    spin.stop(false)
    log(`Build error: ${error}`, 'error')
    process.exit(1)
  }
}

async function cmdDeploy(options: { preview?: boolean; prod?: boolean; force?: boolean }) {
  const config = loadConfig()

  if (!config) {
    log('Project not linked. Run `dws link` first.', 'error')
    process.exit(1)
  }

  const gitInfo = await getGitInfo()
  const target = options.preview ? 'preview' : 'production'
  const domain = getDeploymentDomain()
  const deployUrl = options.preview
    ? `${gitInfo?.branch ?? 'preview'}-${config.name}.${domain}`
    : `${config.name}.${domain}`

  console.log('')
  console.log(`\x1b[1mDeploying to ${target} (${DWS_NETWORK})\x1b[0m`)
  console.log('')
  console.log(`  Project:  ${config.name}`)
  console.log(`  Network:  ${DWS_NETWORK}`)
  console.log(`  API:      ${DWS_API_URL}`)
  console.log(`  URL:      https://${deployUrl}`)
  if (gitInfo) {
    console.log(`  Branch:   ${gitInfo.branch}`)
    console.log(`  Commit:   ${gitInfo.commit}`)
  }
  console.log('')

  // Step 1: Build
  const buildSpin = spinner('Building...')
  try {
    const buildCmd = config.buildCommand ?? 'bun run build:dws'
    const [binary, ...args] = buildCmd.split(' ')
    const result = Bun.spawnSync([binary, ...args], {
      cwd: ROOT_DIR,
      env: { ...process.env, NODE_ENV: 'production' },
    })

    if (result.exitCode !== 0) {
      buildSpin.stop(false)
      log('Build failed', 'error')
      console.error(result.stderr.toString())
      process.exit(1)
    }
    buildSpin.stop()
  } catch (error) {
    buildSpin.stop(false)
    log(`Build error: ${error}`, 'error')
    process.exit(1)
  }

  // Step 2: Upload
  const uploadSpin = spinner('Uploading...')
  try {
    // Bundle the output
    const bundleDir = join(ROOT_DIR, '.dws-bundle')
    if (!existsSync(bundleDir)) {
      uploadSpin.stop(false)
      log('Bundle not found. Build may have failed.', 'error')
      process.exit(1)
    }

    // Create deployment
    const deployResponse = await fetchDWS('/deploy/create', {
      method: 'POST',
      body: JSON.stringify({
        projectId: config.projectId,
        name: config.name,
        target,
        framework: config.framework,
        regions: config.regions,
        meta: gitInfo ? {
          gitBranch: gitInfo.branch,
          gitCommit: gitInfo.commit,
          gitMessage: gitInfo.message,
        } : undefined,
      }),
    })

    if (!deployResponse.ok) {
      uploadSpin.stop(false)
      const err = await deployResponse.text()
      log(`Failed to create deployment: ${err}`, 'error')
      process.exit(1)
    }

    const deployment: Deployment = await deployResponse.json()
    uploadSpin.stop()

    // Step 3: Upload artifacts
    const artifactSpin = spinner('Uploading artifacts...')

    // Create tarball
    const tarPath = join(bundleDir, 'deployment.tar.gz')
    Bun.spawnSync(['tar', '-czf', tarPath, '-C', bundleDir, '.'])

    const formData = new FormData()
    formData.append('deploymentId', deployment.id)
    formData.append('artifact', Bun.file(tarPath), 'deployment.tar.gz')

    const uploadResponse = await fetch(`${DWS_API_URL}/deploy/${deployment.id}/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!uploadResponse.ok) {
      artifactSpin.stop(false)
      const errorText = await uploadResponse.text()
      log(`Failed to upload artifacts: ${uploadResponse.status} - ${errorText}`, 'error')
      process.exit(1)
    }
    artifactSpin.stop()

    // Step 4: Wait for deployment
    const deploySpin = spinner('Deploying...')
    let status = deployment.state

    while (status === 'QUEUED' || status === 'BUILDING') {
      await new Promise((r) => setTimeout(r, 2000))

      const statusResponse = await fetchDWS(`/deploy/${deployment.id}`)
      if (statusResponse.ok) {
        const updated: Deployment = await statusResponse.json()
        status = updated.state
      }
    }

    deploySpin.stop()

    if (status === 'READY') {
      console.log('')
      log(`Deployed to ${target}`, 'success')
      console.log('')
      console.log(`  \x1b[1mProduction:\x1b[0m https://${deployUrl}`)
      console.log(`  \x1b[1mInspect:\x1b[0m    https://dws.${domain}/deployments/${deployment.id}`)
      console.log('')
    } else {
      log(`Deployment failed with status: ${status}`, 'error')
      process.exit(1)
    }
  } catch (error) {
    uploadSpin.stop(false)
    log(`Deployment error: ${error}`, 'error')
    process.exit(1)
  }
}

async function cmdLink() {
  console.log('')
  console.log('\x1b[1mLink to DWS Project\x1b[0m')
  console.log('')

  // Detect framework
  const packageJson = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf-8'))
  let framework: ProjectConfig['framework'] = 'static'

  if (packageJson.dependencies?.next) framework = 'nextjs'
  else if (packageJson.dependencies?.remix) framework = 'remix'
  else if (packageJson.dependencies?.astro) framework = 'astro'

  log(`Detected framework: ${framework}`)

  const config: ProjectConfig = {
    projectId: `prj_${crypto.randomUUID().slice(0, 12)}`,
    orgId: `org_${crypto.randomUUID().slice(0, 8)}`,
    name: packageJson.name ?? 'my-project',
    framework,
    buildCommand: 'bun run build:dws',
    outputDirectory: '.dws-bundle',
    installCommand: 'bun install',
    devCommand: 'bun run dev:quick',
    rootDirectory: '.',
    regions: ['na-east'],
    linkedAt: new Date().toISOString(),
  }

  saveConfig(config)

  console.log('')
  log(`Linked to ${config.name}`, 'success')
  console.log('')
  console.log(`  Project ID: ${config.projectId}`)
  console.log(`  Framework:  ${config.framework}`)
  console.log(`  Regions:    ${config.regions.join(', ')}`)
  console.log('')
}

async function cmdEnv(subcommand: string, args: string[]) {
  const config = loadConfig()
  if (!config) {
    log('Project not linked. Run `dws link` first.', 'error')
    process.exit(1)
  }

  switch (subcommand) {
    case 'ls':
    case 'list': {
      const response = await fetchDWS(`/deploy/projects/${config.projectId}/env`)
      if (!response.ok) {
        log('Failed to list environment variables', 'error')
        process.exit(1)
      }
      const envVars = await response.json()

      console.log('')
      console.log('\x1b[1mEnvironment Variables\x1b[0m')
      console.log('')

      if (envVars.length === 0) {
        console.log('  No environment variables configured')
      } else {
        for (const env of envVars) {
          const value = env.value.length > 20 ? env.value.slice(0, 20) + '...' : env.value
          console.log(`  ${env.key}=${value} (${env.target})`)
        }
      }
      console.log('')
      break
    }

    case 'add': {
      const [key, value] = args
      if (!key || !value) {
        log('Usage: dws env add <key> <value>', 'error')
        process.exit(1)
      }

      const response = await fetchDWS(`/deploy/projects/${config.projectId}/env`, {
        method: 'POST',
        body: JSON.stringify({
          key,
          value,
          target: ['production', 'preview', 'development'],
        }),
      })

      if (!response.ok) {
        log('Failed to add environment variable', 'error')
        process.exit(1)
      }

      log(`Added ${key}`, 'success')
      break
    }

    case 'rm':
    case 'remove': {
      const [key] = args
      if (!key) {
        log('Usage: dws env rm <key>', 'error')
        process.exit(1)
      }

      const response = await fetchDWS(`/deploy/projects/${config.projectId}/env/${key}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        log('Failed to remove environment variable', 'error')
        process.exit(1)
      }

      log(`Removed ${key}`, 'success')
      break
    }

    case 'pull': {
      const response = await fetchDWS(`/deploy/projects/${config.projectId}/env`)
      if (!response.ok) {
        log('Failed to pull environment variables', 'error')
        process.exit(1)
      }
      const envVars = await response.json()

      const envContent = envVars
        .filter((e: { target: string[] }) => e.target.includes('development'))
        .map((e: { key: string; value: string }) => `${e.key}=${e.value}`)
        .join('\n')

      writeFileSync(ENV_FILE, envContent)
      log(`Pulled ${envVars.length} environment variables to .dws/.env.local`, 'success')
      break
    }

    default:
      log(`Unknown env command: ${subcommand}`, 'error')
      console.log('Available commands: ls, add, rm, pull')
      process.exit(1)
  }
}

async function cmdLogs(deploymentId?: string) {
  const config = loadConfig()
  if (!config) {
    log('Project not linked. Run `dws link` first.', 'error')
    process.exit(1)
  }

  // If no deployment ID, get the latest
  if (!deploymentId) {
    const response = await fetchDWS(`/deploy/projects/${config.projectId}/deployments?limit=1`)
    if (!response.ok) {
      log('Failed to get latest deployment', 'error')
      process.exit(1)
    }
    const deployments = await response.json()
    if (deployments.length === 0) {
      log('No deployments found', 'error')
      process.exit(1)
    }
    deploymentId = deployments[0].id
  }

  log(`Streaming logs for deployment ${deploymentId}...`)
  console.log('')

  const response = await fetch(`${DWS_API_URL}/deploy/${deploymentId}/logs?follow=true`)
  if (!response.ok || !response.body) {
    log('Failed to stream logs', 'error')
    process.exit(1)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    process.stdout.write(text)
  }
}

async function cmdLs() {
  const config = loadConfig()
  if (!config) {
    log('Project not linked. Run `dws link` first.', 'error')
    process.exit(1)
  }

  const response = await fetchDWS(`/deploy/projects/${config.projectId}/deployments?limit=10`)
  if (!response.ok) {
    log('Failed to list deployments', 'error')
    process.exit(1)
  }

  const deployments: Deployment[] = await response.json()

  console.log('')
  console.log('\x1b[1mDeployments\x1b[0m')
  console.log('')

  if (deployments.length === 0) {
    console.log('  No deployments found')
  } else {
    for (const d of deployments) {
      const age = getRelativeTime(new Date(d.createdAt))
      const stateColor =
        d.state === 'READY' ? '\x1b[32m' : d.state === 'ERROR' ? '\x1b[31m' : '\x1b[33m'
      console.log(
        `  ${stateColor}●\x1b[0m ${d.url.padEnd(40)} ${d.target.padEnd(12)} ${age}`,
      )
    }
  }
  console.log('')
}

async function cmdRollback(deploymentId?: string) {
  const config = loadConfig()
  if (!config) {
    log('Project not linked. Run `dws link` first.', 'error')
    process.exit(1)
  }

  if (!deploymentId) {
    // Get previous production deployment
    const response = await fetchDWS(
      `/deploy/projects/${config.projectId}/deployments?target=production&limit=2`,
    )
    if (!response.ok) {
      log('Failed to get deployments', 'error')
      process.exit(1)
    }
    const deployments: Deployment[] = await response.json()
    if (deployments.length < 2) {
      log('No previous deployment to rollback to', 'error')
      process.exit(1)
    }
    deploymentId = deployments[1].id
  }

  const spin = spinner('Rolling back...')

  const response = await fetchDWS(`/deploy/${deploymentId}/promote`, {
    method: 'POST',
  })

  if (!response.ok) {
    spin.stop(false)
    log('Failed to rollback', 'error')
    process.exit(1)
  }

  spin.stop()
  log(`Rolled back to deployment ${deploymentId}`, 'success')
}

async function cmdDomains(subcommand: string, args: string[]) {
  const config = loadConfig()
  if (!config) {
    log('Project not linked. Run `dws link` first.', 'error')
    process.exit(1)
  }

  switch (subcommand) {
    case 'ls':
    case 'list': {
      const response = await fetchDWS(`/deploy/projects/${config.projectId}/domains`)
      if (!response.ok) {
        log('Failed to list domains', 'error')
        process.exit(1)
      }
      const domains = await response.json()

      console.log('')
      console.log('\x1b[1mDomains\x1b[0m')
      console.log('')

      if (domains.length === 0) {
        console.log('  No custom domains configured')
      } else {
        for (const d of domains) {
          const status = d.verified ? '\x1b[32m✓\x1b[0m' : '\x1b[33m○\x1b[0m'
          console.log(`  ${status} ${d.domain}`)
        }
      }
      console.log('')
      break
    }

    case 'add': {
      const [domain] = args
      if (!domain) {
        log('Usage: dws domains add <domain>', 'error')
        process.exit(1)
      }

      const response = await fetchDWS(`/deploy/projects/${config.projectId}/domains`, {
        method: 'POST',
        body: JSON.stringify({ domain }),
      })

      if (!response.ok) {
        log('Failed to add domain', 'error')
        process.exit(1)
      }

      const result = await response.json()
      log(`Added ${domain}`, 'success')

      if (result.verification) {
        console.log('')
        console.log('Add the following DNS records to verify ownership:')
        console.log('')
        for (const record of result.verification.records) {
          console.log(`  ${record.type} ${record.name} ${record.value}`)
        }
      }
      break
    }

    case 'rm':
    case 'remove': {
      const [domain] = args
      if (!domain) {
        log('Usage: dws domains rm <domain>', 'error')
        process.exit(1)
      }

      const response = await fetchDWS(
        `/deploy/projects/${config.projectId}/domains/${encodeURIComponent(domain)}`,
        { method: 'DELETE' },
      )

      if (!response.ok) {
        log('Failed to remove domain', 'error')
        process.exit(1)
      }

      log(`Removed ${domain}`, 'success')
      break
    }

    default:
      log(`Unknown domains command: ${subcommand}`, 'error')
      console.log('Available commands: ls, add, rm')
      process.exit(1)
  }
}

async function cmdInspect(deploymentId?: string) {
  const config = loadConfig()
  if (!config) {
    log('Project not linked. Run `dws link` first.', 'error')
    process.exit(1)
  }

  if (!deploymentId) {
    const response = await fetchDWS(`/deploy/projects/${config.projectId}/deployments?limit=1`)
    if (!response.ok) {
      log('Failed to get latest deployment', 'error')
      process.exit(1)
    }
    const deployments = await response.json()
    if (deployments.length === 0) {
      log('No deployments found', 'error')
      process.exit(1)
    }
    deploymentId = deployments[0].id
  }

  const response = await fetchDWS(`/deploy/${deploymentId}`)
  if (!response.ok) {
    log('Failed to inspect deployment', 'error')
    process.exit(1)
  }

  const deployment: Deployment = await response.json()

  console.log('')
  console.log('\x1b[1mDeployment Details\x1b[0m')
  console.log('')
  console.log(`  ID:       ${deployment.id}`)
  console.log(`  URL:      ${deployment.url}`)
  console.log(`  State:    ${deployment.state}`)
  console.log(`  Target:   ${deployment.target}`)
  console.log(`  Created:  ${deployment.createdAt}`)

  if (deployment.meta.gitBranch) {
    console.log('')
    console.log('\x1b[1mGit Info\x1b[0m')
    console.log('')
    console.log(`  Branch:   ${deployment.meta.gitBranch}`)
    console.log(`  Commit:   ${deployment.meta.gitCommit}`)
    console.log(`  Message:  ${deployment.meta.gitMessage}`)
  }
  console.log('')
}

async function cmdWhoami() {
  // In a real implementation, this would check the authentication token
  console.log('')
  console.log('  \x1b[1mDWS CLI\x1b[0m')
  console.log('')
  console.log(`  Network:  ${DWS_NETWORK}`)
  console.log(`  API:      ${DWS_API_URL}`)

  const config = loadConfig()
  if (config) {
    console.log('')
    console.log('  \x1b[1mLinked Project\x1b[0m')
    console.log('')
    console.log(`  Name:     ${config.name}`)
    console.log(`  ID:       ${config.projectId}`)
    console.log(`  Org:      ${config.orgId}`)
  }
  console.log('')
}

function getRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function printHelp() {
  console.log(`
\x1b[1mDWS CLI\x1b[0m - Deploy to Decentralized Web Services

\x1b[1mUsage:\x1b[0m
  dws [command] [options]

\x1b[1mCommands:\x1b[0m
  dev              Start local development server
  build            Build the project
  deploy           Deploy to DWS
    --preview      Deploy to preview environment
    --prod         Deploy to production (default)
  env              Manage environment variables
    ls             List all environment variables
    add <key> <value>  Add an environment variable
    rm <key>       Remove an environment variable
    pull           Pull environment variables to local
  logs [id]        Stream deployment logs
  domains          Manage custom domains
    ls             List domains
    add <domain>   Add a domain
    rm <domain>    Remove a domain
  rollback [id]    Rollback to a previous deployment
  inspect [id]     Inspect deployment details
  ls               List deployments
  link             Link to a DWS project
  whoami           Show current configuration

\x1b[1mExamples:\x1b[0m
  $ dws                    # Deploy to production
  $ dws deploy --preview   # Deploy preview
  $ dws env add API_KEY secret123
  $ dws logs
  $ dws rollback

\x1b[1mEnvironment:\x1b[0m
  DWS_API_URL    API endpoint (default: http://localhost:4030)
  DWS_NETWORK    Network (localnet, testnet, mainnet)
`)
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2)
  const command = args[0] ?? 'deploy'

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      printHelp()
      break

    case 'dev':
      await cmdDev()
      break

    case 'build':
      await cmdBuild()
      break

    case 'deploy':
      await cmdDeploy({
        preview: args.includes('--preview'),
        prod: args.includes('--prod'),
        force: args.includes('--force'),
      })
      break

    case 'link':
      await cmdLink()
      break

    case 'env':
      await cmdEnv(args[1] ?? 'ls', args.slice(2))
      break

    case 'logs':
      await cmdLogs(args[1])
      break

    case 'ls':
    case 'list':
      await cmdLs()
      break

    case 'rollback':
      await cmdRollback(args[1])
      break

    case 'domains':
      await cmdDomains(args[1] ?? 'ls', args.slice(2))
      break

    case 'inspect':
      await cmdInspect(args[1])
      break

    case 'whoami':
      await cmdWhoami()
      break

    case 'rm':
    case 'remove':
      log('Remove deployment not yet implemented', 'warn')
      break

    case 'pull':
      await cmdEnv('pull', [])
      break

    default:
      // Default to deploy for backwards compatibility with vercel
      if (command.startsWith('-')) {
        await cmdDeploy({
          preview: args.includes('--preview'),
          prod: args.includes('--prod'),
        })
      } else {
        log(`Unknown command: ${command}`, 'error')
        printHelp()
        process.exit(1)
      }
  }
}

main().catch((error) => {
  log(`Error: ${error.message}`, 'error')
  process.exit(1)
})


