#!/usr/bin/env bun
/**
 * Build DWS Worker
 *
 * Builds the Eliza Cloud API worker for DWS deployment.
 * Creates a single bundled worker.js file like Bazaar does.
 *
 * Pattern follows apps/bazaar/scripts/build.ts
 */

import { existsSync, rmSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const ROOT_DIR = resolve(import.meta.dir, '..')
const WORKER_DIR = `${ROOT_DIR}/dist/dws-worker`

async function buildWorker(): Promise<void> {
  console.log('Building DWS API worker...')

  // Clean and create output directory
  if (existsSync(WORKER_DIR)) {
    rmSync(WORKER_DIR, { recursive: true })
  }
  mkdirSync(WORKER_DIR, { recursive: true })

  // Build the worker with Bun
  const result = await Bun.build({
    entrypoints: [`${ROOT_DIR}/api/dws-worker.ts`],
    outdir: WORKER_DIR,
    target: 'bun',
    minify: true,
    sourcemap: 'external',
    external: [
      // Externalize Node.js built-ins that aren't needed
      'bun:sqlite',
      'child_process',
      'node:child_process',
      'node:fs',
      'node:path',
      'node:crypto',
    ],
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  })

  if (!result.success) {
    console.error('Worker build failed:')
    for (const log of result.logs) console.error(log)
    throw new Error('Worker build failed')
  }

  // Generate metadata
  let gitCommit = 'unknown'
  let gitBranch = 'unknown'
  try {
    const commitResult = Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD'])
    if (commitResult.success) {
      gitCommit = new TextDecoder().decode(commitResult.stdout).trim()
    }
    const branchResult = Bun.spawnSync([
      'git',
      'rev-parse',
      '--abbrev-ref',
      'HEAD',
    ])
    if (branchResult.success) {
      gitBranch = new TextDecoder().decode(branchResult.stdout).trim()
    }
  } catch {
    // Git not available
  }

  const metadata = {
    name: 'eliza-cloud-api',
    version: '2.0.0',
    entrypoint: 'dws-worker.js',
    compatibilityDate: '2025-06-01',
    buildTime: new Date().toISOString(),
    git: { commit: gitCommit, branch: gitBranch },
    runtime: 'workerd',
  }

  await Bun.write(
    `${WORKER_DIR}/metadata.json`,
    JSON.stringify(metadata, null, 2),
  )

  // Check output size
  const workerFile = Bun.file(`${WORKER_DIR}/dws-worker.js`)
  const sizeKB = (await workerFile.size) / 1024

  console.log(`  Worker built: ${WORKER_DIR}/dws-worker.js`)
  console.log(`  Size: ${sizeKB.toFixed(1)}KB`)
}

async function main(): Promise<void> {
  console.log('Building Eliza Cloud DWS Worker')
  console.log('================================')
  console.log('')

  await buildWorker()

  console.log('')
  console.log('Build complete.')
  console.log('')
  console.log('To deploy:')
  console.log('  bun run scripts/deploy-dws-worker.ts')
}

main().catch((error) => {
  console.error('Build failed:', error)
  process.exit(1)
})
