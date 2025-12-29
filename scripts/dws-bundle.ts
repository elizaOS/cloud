#!/usr/bin/env bun
/**
 * DWS Bundle Script
 *
 * Bundles the Next.js standalone output for DWS deployment.
 * Creates a deployable package with:
 * - Workerd-compatible server bundle
 * - Static assets for CDN
 * - Environment configuration
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

const ROOT_DIR = resolve(import.meta.dir, '..')
const STANDALONE_DIR = join(ROOT_DIR, '.next', 'standalone')
const STATIC_DIR = join(ROOT_DIR, '.next', 'static')
const OUTPUT_DIR = join(ROOT_DIR, '.dws-bundle')
const PUBLIC_DIR = join(ROOT_DIR, 'public')

interface BundleManifest {
  name: string
  version: string
  bundledAt: string
  files: {
    worker: string
    static: string[]
    public: string[]
  }
  checksum: string
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function copyDir(src: string, dest: string): void {
  if (!existsSync(src)) {
    console.log(`  Skipping ${src} (not found)`)
    return
  }
  
  ensureDir(dest)
  const entries = readdirSync(src, { withFileTypes: true })
  
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      cpSync(srcPath, destPath)
    }
  }
}

function getFilesRecursive(dir: string, basePath: string = ''): string[] {
  if (!existsSync(dir)) return []
  
  const files: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const relativePath = join(basePath, entry.name)
    const fullPath = join(dir, entry.name)
    
    if (entry.isDirectory()) {
      files.push(...getFilesRecursive(fullPath, relativePath))
    } else {
      files.push(relativePath)
    }
  }
  
  return files
}

function generateChecksum(content: string): string {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(content)
  return hasher.digest('hex').slice(0, 16)
}

async function createWorkerBundle(): Promise<void> {
  console.log('Creating worker bundle...')
  
  const workerEntry = `
import { serve } from 'bun'
import app from './server/server.js'

// DWS workerd compatibility layer
export default {
  async fetch(request, env, ctx) {
    // Inject environment
    globalThis.process = globalThis.process || { env: {} }
    Object.assign(globalThis.process.env, env)
    
    // Handle request with Next.js
    return app.fetch(request)
  },
}
`.trim()

  const workerDir = join(OUTPUT_DIR, 'worker')
  ensureDir(workerDir)
  
  // Copy standalone server
  copyDir(STANDALONE_DIR, workerDir)
  
  // Write worker entry point
  writeFileSync(join(workerDir, 'index.js'), workerEntry)
  
  console.log('  Worker bundle created')
}

function copyStaticAssets(): void {
  console.log('Copying static assets...')
  
  const staticOut = join(OUTPUT_DIR, 'static', '_next', 'static')
  copyDir(STATIC_DIR, staticOut)
  
  console.log('  Static assets copied')
}

function copyPublicAssets(): void {
  console.log('Copying public assets...')
  
  const publicOut = join(OUTPUT_DIR, 'static')
  copyDir(PUBLIC_DIR, publicOut)
  
  console.log('  Public assets copied')
}

function generateManifest(): void {
  console.log('Generating manifest...')
  
  const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf-8'))
  const staticFiles = getFilesRecursive(join(OUTPUT_DIR, 'static'))
  const publicFiles = getFilesRecursive(PUBLIC_DIR)
  
  const manifest: BundleManifest = {
    name: pkg.name,
    version: pkg.version,
    bundledAt: new Date().toISOString(),
    files: {
      worker: 'worker/index.js',
      static: staticFiles,
      public: publicFiles,
    },
    checksum: generateChecksum(JSON.stringify({ staticFiles, publicFiles })),
  }
  
  writeFileSync(
    join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  )
  
  console.log('  Manifest generated')
}

function generateWorkerdConfig(): void {
  console.log('Generating workerd config...')
  
  const config = `
using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "eliza-cloud", worker = .worker),
  ],
  sockets = [
    (name = "http", address = "*:8080", http = (), service = "eliza-cloud"),
  ],
);

const worker :Workerd.Worker = (
  compatibilityDate = "2024-01-01",
  modules = [
    (name = "worker", esModule = embed "worker/index.js"),
  ],
  bindings = [
    (name = "STATIC_ASSETS_URL", text = ""),
    (name = "NODE_ENV", text = "production"),
  ],
);
`.trim()

  writeFileSync(join(OUTPUT_DIR, 'workerd.capnp'), config)
  
  console.log('  Workerd config generated')
}

async function main(): Promise<void> {
  console.log('DWS Bundle Script')
  console.log('==================')
  console.log('')
  
  // Check if standalone build exists
  if (!existsSync(STANDALONE_DIR)) {
    console.error('Error: Standalone build not found.')
    console.error('Run "bun run build" first.')
    process.exit(1)
  }
  
  // Clean output directory
  if (existsSync(OUTPUT_DIR)) {
    console.log('Cleaning output directory...')
    Bun.spawnSync(['rm', '-rf', OUTPUT_DIR])
  }
  ensureDir(OUTPUT_DIR)
  
  // Bundle
  await createWorkerBundle()
  copyStaticAssets()
  copyPublicAssets()
  generateManifest()
  generateWorkerdConfig()
  
  console.log('')
  console.log('Bundle complete.')
  console.log(`Output: ${OUTPUT_DIR}`)
  console.log('')
  console.log('To deploy:')
  console.log('  bun run dws:deploy')
}

main().catch((error) => {
  console.error('Bundle failed:', error)
  process.exit(1)
})


