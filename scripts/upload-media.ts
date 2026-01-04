#!/usr/bin/env bun
/**
 * Media Upload Script for DWS Storage
 * 
 * Uploads large media directories to DWS Storage for CDN delivery.
 * These assets are excluded from the main deployment bundle.
 */

import { readdirSync, statSync, existsSync } from 'fs'
import { join, resolve } from 'path'

const ROOT_DIR = resolve(import.meta.dir, '..')
const PUBLIC_DIR = join(ROOT_DIR, 'public')

// Directories to upload to DWS Storage
const MEDIA_DIRS = [
  'cloud-agent-samples',
  'avatars',
  'videos',
  'cloud-avatars',
  'agents',
]

type NetworkType = 'localnet' | 'testnet' | 'mainnet'

function getNetwork(): NetworkType {
  const env = process.env.JEJU_NETWORK ?? process.env.DWS_NETWORK ?? 'localnet'
  if (env === 'localnet' || env === 'testnet' || env === 'mainnet') {
    return env
  }
  return 'localnet'
}

function getStorageUrl(network: NetworkType): string {
  switch (network) {
    case 'mainnet': return 'https://storage.jejunetwork.org'
    case 'testnet': return 'https://storage.testnet.jejunetwork.org'
    default: return process.env.DWS_STORAGE_URL ?? 'http://localhost:5004'
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

interface UploadResult {
  file: string
  cid: string
  size: number
}

async function uploadFile(filePath: string, storageUrl: string): Promise<UploadResult> {
  const file = Bun.file(filePath)
  const fileName = filePath.split('/').pop() || 'file'
  
  const formData = new FormData()
  formData.append('file', file, fileName)
  formData.append('tier', 'popular')
  
  const response = await fetch(`${storageUrl}/api/v0/add?pin=true`, {
    method: 'POST',
    body: formData,
  })
  
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${await response.text()}`)
  }
  
  const result = await response.json() as { Hash?: string; cid?: string }
  const cid = result.Hash || result.cid
  if (!cid) {
    throw new Error('No CID in response')
  }
  
  return { file: fileName, cid, size: file.size }
}

async function uploadDirectory(dirName: string, storageUrl: string): Promise<Map<string, string>> {
  const dirPath = join(PUBLIC_DIR, dirName)
  const results = new Map<string, string>()
  
  if (!existsSync(dirPath)) {
    console.log(`  Directory ${dirName}/ not found, skipping`)
    return results
  }
  
  console.log(`\n📤 Uploading ${dirName}/`)
  
  const files = readdirSync(dirPath)
  let uploaded = 0
  let failed = 0
  let totalSize = 0
  
  for (const file of files) {
    const filePath = join(dirPath, file)
    const stats = statSync(filePath)
    
    if (!stats.isFile()) continue
    
    try {
      const result = await uploadFile(filePath, storageUrl)
      results.set(`/${dirName}/${file}`, result.cid)
      uploaded++
      totalSize += result.size
      
      // Progress every 10 files
      if (uploaded % 10 === 0) {
        console.log(`  Uploaded ${uploaded} files...`)
      }
    } catch (error) {
      console.error(`  Failed: ${file} - ${error}`)
      failed++
    }
    
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 50))
  }
  
  console.log(`  Uploaded ${uploaded} files (${formatBytes(totalSize)}), ${failed} failed`)
  
  return results
}

async function main(): Promise<void> {
  const network = getNetwork()
  const storageUrl = getStorageUrl(network)
  
  console.log('📦 Media Upload Script')
  console.log('======================')
  console.log(`Network: ${network}`)
  console.log(`Storage: ${storageUrl}`)
  
  const dryRun = process.argv.includes('--dry-run')
  if (dryRun) {
    console.log('Mode: DRY RUN')
  }
  
  // Collect all file mappings
  const allMappings = new Map<string, string>()
  
  for (const dir of MEDIA_DIRS) {
    const dirPath = join(PUBLIC_DIR, dir)
    if (!existsSync(dirPath)) continue
    
    if (dryRun) {
      const files = readdirSync(dirPath)
      let totalSize = 0
      for (const file of files) {
        const stats = statSync(join(dirPath, file))
        if (stats.isFile()) totalSize += stats.size
      }
      console.log(`\n📁 ${dir}/ - ${files.length} files (${formatBytes(totalSize)})`)
      console.log('  Would upload to DWS Storage')
    } else {
      const mappings = await uploadDirectory(dir, storageUrl)
      for (const [path, cid] of mappings) {
        allMappings.set(path, cid)
      }
    }
  }
  
  if (!dryRun && allMappings.size > 0) {
    // Save mappings to a manifest file
    const manifest = {
      network,
      uploadedAt: new Date().toISOString(),
      files: Object.fromEntries(allMappings),
    }
    
    const manifestPath = join(ROOT_DIR, '.dws-media-manifest.json')
    await Bun.write(manifestPath, JSON.stringify(manifest, null, 2))
    console.log(`\n📋 Manifest saved: ${manifestPath}`)
    console.log(`   Total files: ${allMappings.size}`)
  }
  
  console.log('\n✅ Upload complete')
  console.log('\nTo serve these assets from CDN, configure your worker with:')
  console.log('  MEDIA_BASE_URL=https://storage.jejunetwork.org/ipfs/')
  
  process.exit(0)
}

main().catch(error => {
  console.error('Upload failed:', error)
  process.exit(1)
})
