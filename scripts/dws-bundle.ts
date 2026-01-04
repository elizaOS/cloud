#!/usr/bin/env bun
/**
 * DWS Bundle Script
 *
 * Bundles the Next.js 15 standalone output for DWS deployment.
 * Creates a deployable package with:
 * - Workerd-compatible server bundle (adapted from standalone)
 * - Static assets for CDN
 * - Environment configuration
 * - Runtime polyfills for edge compatibility
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, readdirSync, rmSync, statSync } from 'fs'
import { join, resolve } from 'path'

const ROOT_DIR = resolve(import.meta.dir, '..')

// ============================================================================
// Bundle Size Reporting
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function reportBundleSizes(dir: string, label: string): void {
  console.log(`\n📦 ${label} Bundle Sizes:`)
  
  let totalSize = 0
  const entries: Array<{ name: string; size: number }> = []
  
  function collectFiles(currentDir: string, basePath: string = ''): void {
    if (!existsSync(currentDir)) return
    
    let items: ReturnType<typeof readdirSync>
    try {
      items = readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return // Skip directories we can't read
    }
    
    for (const item of items) {
      const fullPath = join(currentDir, item.name)
      const relativePath = basePath ? `${basePath}/${item.name}` : item.name
      
      // Skip node_modules and symlinks
      if (item.name === 'node_modules') continue
      if (item.isSymbolicLink()) continue
      
      try {
        if (item.isDirectory()) {
          collectFiles(fullPath, relativePath)
        } else if (item.isFile()) {
          const stats = statSync(fullPath)
          // Only report JS files over 10KB
          if (item.name.endsWith('.js') && stats.size > 10240) {
            entries.push({ name: relativePath, size: stats.size })
          }
          totalSize += stats.size
        }
      } catch {
        // Skip files/dirs we can't stat
      }
    }
  }
  
  collectFiles(dir)
  
  // Sort by size descending and show top 10
  entries.sort((a, b) => b.size - a.size)
  for (const entry of entries.slice(0, 10)) {
    console.log(`  ${formatBytes(entry.size).padStart(10)}  ${entry.name}`)
  }
  
  if (entries.length > 10) {
    console.log(`  ... and ${entries.length - 10} more files`)
  }
  
  console.log(`  ${'─'.repeat(40)}`)
  console.log(`  ${formatBytes(totalSize).padStart(10)}  Total`)
}
// Next.js standalone output nests under the monorepo path
const STANDALONE_BASE = join(ROOT_DIR, '.next', 'standalone')
const STANDALONE_DIR = join(STANDALONE_BASE, 'vendor', 'eliza-cloud-v2')
const STANDALONE_NODE_MODULES = join(STANDALONE_BASE, 'node_modules')
const STATIC_DIR = join(ROOT_DIR, '.next', 'static')
const OUTPUT_DIR = join(ROOT_DIR, '.dws-bundle')
const PUBLIC_DIR = join(ROOT_DIR, 'public')

interface BundleManifest {
  name: string
  version: string
  framework: string
  bundledAt: string
  files: {
    worker: string
    static: string[]
    public: string[]
  }
  checksum: string
  runtime: 'workerd' | 'bun' | 'node'
  regions: string[]
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

  // Enhanced worker entry with Next.js 15 support and edge polyfills
  const workerEntry = `
/**
 * DWS Worker Entry Point
 * 
 * Adapts Next.js 15 standalone server for workerd/edge runtime.
 * Provides environment injection, static asset routing, and error handling.
 */

// Polyfill process.env for workerd
globalThis.process = globalThis.process || { env: {}, cwd: () => '/' };

// Import Next.js server handler
import handler from './server.js';

// Static asset patterns for CDN routing
const STATIC_PATTERNS = [
  /^\\/_next\\/static\\//,
  /^\\/_next\\/image/,
  /^\\/favicon\\.ico$/,
  /^\\/robots\\.txt$/,
  /^\\/sitemap\\.xml$/,
  /\\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot)$/,
];

function isStaticAsset(pathname) {
  return STATIC_PATTERNS.some(pattern => pattern.test(pathname));
}

export default {
  async fetch(request, env, ctx) {
    // Inject environment variables
    Object.assign(globalThis.process.env, env);
    
    const url = new URL(request.url);
    
    // Route static assets to CDN if configured
    if (env.STATIC_ASSETS_URL && isStaticAsset(url.pathname)) {
      const staticUrl = new URL(url.pathname, env.STATIC_ASSETS_URL);
      staticUrl.search = url.search;
      
      try {
        const staticResponse = await fetch(staticUrl.toString(), {
          headers: request.headers,
        });
        
        if (staticResponse.ok) {
          const headers = new Headers(staticResponse.headers);
          
          // Add aggressive caching for immutable assets
          if (url.pathname.includes('/_next/static/')) {
            headers.set('Cache-Control', 'public, max-age=31536000, immutable');
          }
          
          headers.set('X-DWS-Source', 'cdn');
          
          return new Response(staticResponse.body, {
            status: staticResponse.status,
            headers,
          });
        }
      } catch (e) {
        // Fall through to Next.js handler
        console.warn('[DWS] Static fetch failed, falling back to handler:', e);
      }
    }
    
    // Handle the request with Next.js
    try {
      const response = await handler(request, env, ctx);
      
      // Add DWS headers
      const headers = new Headers(response.headers);
      headers.set('X-DWS-Powered', 'true');
      headers.set('X-DWS-Region', env.DWS_REGION || 'default');
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error('[DWS] Handler error:', error);
      
      // Return structured error response
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-DWS-Error': 'true',
          },
        }
      );
    }
  },
  
  // Scheduled handler for cron jobs
  async scheduled(event, env, ctx) {
    console.log('[DWS] Scheduled event:', event.cron);
    
    // Inject environment
    Object.assign(globalThis.process.env, env);
    
    // Cron endpoints are defined in dws-manifest.json
    // The DWS scheduler will call these endpoints
    const cronEndpoints = env.CRON_ENDPOINTS ? JSON.parse(env.CRON_ENDPOINTS) : [];
    const endpoint = cronEndpoints.find(e => e.schedule === event.cron);
    
    if (endpoint) {
      const url = new URL(endpoint.endpoint, 'http://localhost');
      const request = new Request(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DWS-Cron': 'true',
          'X-DWS-Cron-Schedule': event.cron,
        },
      });
      
      await this.fetch(request, env, ctx);
    }
  },
};
`.trim()

  const workerDir = join(OUTPUT_DIR, 'worker')
  ensureDir(workerDir)

  // Check if standalone exists at the nested path
  if (!existsSync(STANDALONE_DIR)) {
    // Try the flat structure (older Next.js or non-monorepo)
    const flatStandalone = join(ROOT_DIR, '.next', 'standalone')
    if (existsSync(join(flatStandalone, 'server.js'))) {
      console.log('  Using flat standalone structure')
      copyDir(flatStandalone, workerDir)
    } else {
      throw new Error(`Standalone directory not found. Run 'bun run build' first.`)
    }
  } else {
    // Copy the nested standalone app files
    console.log('  Using nested monorepo standalone structure')
    copyDir(STANDALONE_DIR, workerDir)
    
    // Copy the shared node_modules from standalone root
    if (existsSync(STANDALONE_NODE_MODULES)) {
      console.log('  Copying shared node_modules...')
      copyDir(STANDALONE_NODE_MODULES, join(workerDir, 'node_modules'))
    }
  }

  // Write worker entry point
  writeFileSync(join(workerDir, 'index.js'), workerEntry)

  // Create a package.json for the worker
  const workerPkg = {
    name: 'eliza-cloud-worker',
    type: 'module',
    main: 'index.js',
  }
  writeFileSync(join(workerDir, 'package.json'), JSON.stringify(workerPkg, null, 2))

  // Note: Next.js standalone output is already optimized by the Next.js build process.
  // We cannot re-bundle with Bun.build due to complex runtime dependencies (webpack, critters, react-server-dom, etc.)
  // The standalone output includes minification and tree-shaking from the Next.js build.
  
  console.log('  Worker bundle created')
}

function copyStaticAssets(): void {
  console.log('Copying static assets...')

  const staticOut = join(OUTPUT_DIR, 'static', '_next', 'static')
  copyDir(STATIC_DIR, staticOut)

  console.log('  Static assets copied')
}

// Large media directories that should be uploaded to DWS Storage separately
// These are excluded from the bundle to keep deployment size manageable
const EXCLUDED_PUBLIC_DIRS = [
  'cloud-agent-samples', // 142MB - sample agent images (should be CDN)
  'avatars',             // 35MB - user avatars (should be CDN)
  'videos',              // 10MB - video files (should be CDN)
  'cloud-avatars',       // 9MB - profile avatars (should be CDN)
  'agents',              // 6MB - agent files (should be CDN)
]

function copyPublicAssetsFiltered(src: string, dest: string, excludeDirs: string[]): void {
  if (!existsSync(src)) return
  
  ensureDir(dest)
  const entries = readdirSync(src, { withFileTypes: true })
  
  for (const entry of entries) {
    // Skip excluded directories
    if (entry.isDirectory() && excludeDirs.includes(entry.name)) {
      console.log(`    Skipping ${entry.name}/ (upload separately to DWS Storage)`)
      continue
    }
    
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      cpSync(srcPath, destPath)
    }
  }
}

function copyPublicAssets(): void {
  console.log('Copying public assets (excluding large media)...')

  const publicOut = join(OUTPUT_DIR, 'static')
  copyPublicAssetsFiltered(PUBLIC_DIR, publicOut, EXCLUDED_PUBLIC_DIRS)
  
  // Calculate excluded size
  let excludedSize = 0
  for (const dir of EXCLUDED_PUBLIC_DIRS) {
    const dirPath = join(PUBLIC_DIR, dir)
    if (existsSync(dirPath)) {
      const files = getFilesRecursive(dirPath)
      for (const file of files) {
        try {
          const stats = statSync(join(dirPath, file))
          excludedSize += stats.size
        } catch {
          // Skip files we can't stat
        }
      }
    }
  }
  
  console.log(`  Public assets copied (excluded ${formatBytes(excludedSize)} of media)`)
  console.log('  Note: Upload excluded media to DWS Storage separately for CDN delivery')
}

function generateManifest(): void {
  console.log('Generating manifest...')

  const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf-8'))
  const dwsManifest = existsSync(join(ROOT_DIR, 'dws-manifest.json'))
    ? JSON.parse(readFileSync(join(ROOT_DIR, 'dws-manifest.json'), 'utf-8'))
    : {}

  const staticFiles = getFilesRecursive(join(OUTPUT_DIR, 'static'))
  const publicFiles = getFilesRecursive(PUBLIC_DIR)

  const manifest: BundleManifest = {
    name: pkg.name,
    version: pkg.version,
    framework: 'nextjs',
    bundledAt: new Date().toISOString(),
    files: {
      worker: 'worker/index.js',
      static: staticFiles,
      public: publicFiles,
    },
    checksum: generateChecksum(JSON.stringify({ staticFiles, publicFiles })),
    runtime: dwsManifest.dws?.backend?.runtime ?? 'workerd',
    regions: dwsManifest.dws?.backend?.regions ?? ['na-east'],
  }

  writeFileSync(
    join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  )

  console.log('  Manifest generated')
}

function generateWorkerdConfig(): void {
  console.log('Generating workerd config...')

  const dwsManifest = existsSync(join(ROOT_DIR, 'dws-manifest.json'))
    ? JSON.parse(readFileSync(join(ROOT_DIR, 'dws-manifest.json'), 'utf-8'))
    : {}

  const name = dwsManifest.name ?? 'eliza-cloud'
  const memory = dwsManifest.dws?.backend?.memory ?? 1024

  const config = `
using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "${name}", worker = .worker),
  ],
  sockets = [
    (name = "http", address = "*:8080", http = (), service = "${name}"),
  ],
);

const worker :Workerd.Worker = (
  compatibilityDate = "2024-12-01",
  compatibilityFlags = ["nodejs_compat"],
  modules = [
    (name = "worker", esModule = embed "worker/index.js"),
  ],
  bindings = [
    (name = "STATIC_ASSETS_URL", text = ""),
    (name = "NODE_ENV", text = "production"),
    (name = "DWS_REGION", text = "default"),
  ],
  limits = (
    cpuMs = 60000,
    memoryMb = ${memory},
  ),
);
`.trim()

  writeFileSync(join(OUTPUT_DIR, 'workerd.capnp'), config)

  console.log('  Workerd config generated')
}

function generateDeploymentInfo(): void {
  console.log('Generating deployment info...')

  const dwsManifest = existsSync(join(ROOT_DIR, 'dws-manifest.json'))
    ? JSON.parse(readFileSync(join(ROOT_DIR, 'dws-manifest.json'), 'utf-8'))
    : {}

  const deployInfo = {
    name: dwsManifest.name ?? 'eliza-cloud',
    version: dwsManifest.version ?? '2.0.0',
    framework: 'nextjs',
    runtime: 'workerd',
    database: dwsManifest.dws?.database,
    services: dwsManifest.dws?.services,
    cron: dwsManifest.cron ?? [],
    scaling: dwsManifest.dws?.scaling,
    createdAt: new Date().toISOString(),
  }

  writeFileSync(
    join(OUTPUT_DIR, 'deploy-info.json'),
    JSON.stringify(deployInfo, null, 2)
  )

  console.log('  Deployment info generated')
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
    rmSync(OUTPUT_DIR, { recursive: true, force: true })
  }
  ensureDir(OUTPUT_DIR)

  // Bundle
  await createWorkerBundle()
  copyStaticAssets()
  copyPublicAssets()
  generateManifest()
  generateWorkerdConfig()
  generateDeploymentInfo()

  // Report bundle sizes
  reportBundleSizes(join(OUTPUT_DIR, 'worker'), 'Worker')
  reportBundleSizes(join(OUTPUT_DIR, 'static'), 'Static Assets')

  // Print summary
  console.log('')
  console.log('Bundle complete.')
  console.log(`Output: ${OUTPUT_DIR}`)
  console.log('')

  // Show bundle stats
  const staticFiles = getFilesRecursive(join(OUTPUT_DIR, 'static'))
  const workerFiles = getFilesRecursive(join(OUTPUT_DIR, 'worker'))
  console.log('Bundle Stats:')
  console.log(`  Static files: ${staticFiles.length}`)
  console.log(`  Worker files: ${workerFiles.length}`)
  console.log('')
  console.log('To deploy:')
  console.log('  bun run scripts/deploy-dws.ts')
  console.log('')
  console.log('Or use the DWS CLI:')
  console.log('  bun run dws:deploy')
  
  process.exit(0)
}

main().catch((error) => {
  console.error('Bundle failed:', error)
  process.exit(1)
})


