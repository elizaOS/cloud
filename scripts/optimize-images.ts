#!/usr/bin/env bun
/**
 * Image Optimization Script
 * 
 * Converts large PNG images to optimized WebP format.
 * Resizes 4096x4096 images to 1024x1024 for web use.
 */

import sharp from 'sharp'
import { readdirSync, statSync, existsSync, unlinkSync, renameSync } from 'fs'
import { join, resolve } from 'path'

const ROOT_DIR = resolve(import.meta.dir, '..')
const PUBLIC_DIR = join(ROOT_DIR, 'public')

// Directories to optimize
const OPTIMIZE_DIRS = [
  'cloud-agent-samples',
  'avatars',
  'cloud-avatars',
]

// Target size for large images (resize if larger)
const MAX_DIMENSION = 1024
const WEBP_QUALITY = 85

interface OptimizeResult {
  file: string
  originalSize: number
  newSize: number
  action: 'converted' | 'resized' | 'skipped' | 'error'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function optimizeImage(filePath: string): Promise<OptimizeResult> {
  const originalStats = statSync(filePath)
  const originalSize = originalStats.size
  const fileName = filePath.split('/').pop() || ''
  
  // Skip if already webp and small enough
  if (filePath.endsWith('.webp') && originalSize < 500 * 1024) {
    return { file: fileName, originalSize, newSize: originalSize, action: 'skipped' }
  }
  
  try {
    const image = sharp(filePath)
    const metadata = await image.metadata()
    
    // Determine if resize needed
    const needsResize = (metadata.width && metadata.width > MAX_DIMENSION) || 
                       (metadata.height && metadata.height > MAX_DIMENSION)
    
    // Skip small images
    if (!needsResize && originalSize < 200 * 1024 && filePath.endsWith('.webp')) {
      return { file: fileName, originalSize, newSize: originalSize, action: 'skipped' }
    }
    
    // Process image
    let pipeline = image
    
    if (needsResize) {
      pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
    }
    
    // Convert to WebP
    const outputPath = filePath.replace(/\.(png|jpg|jpeg)$/i, '.webp')
    await pipeline
      .webp({ quality: WEBP_QUALITY })
      .toFile(outputPath)
    
    const newStats = statSync(outputPath)
    const newSize = newStats.size
    
    // Delete original if different from output
    if (outputPath !== filePath) {
      unlinkSync(filePath)
    }
    
    return { 
      file: fileName, 
      originalSize, 
      newSize, 
      action: needsResize ? 'resized' : 'converted' 
    }
  } catch (error) {
    console.error(`  Error processing ${fileName}:`, error)
    return { file: fileName, originalSize, newSize: originalSize, action: 'error' }
  }
}

async function optimizeDirectory(dirName: string): Promise<void> {
  const dirPath = join(PUBLIC_DIR, dirName)
  
  if (!existsSync(dirPath)) {
    console.log(`  Directory ${dirName}/ not found, skipping`)
    return
  }
  
  console.log(`\n📁 Optimizing ${dirName}/`)
  
  const files = readdirSync(dirPath)
  const imageFiles = files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
  
  if (imageFiles.length === 0) {
    console.log('  No images found')
    return
  }
  
  let totalOriginal = 0
  let totalNew = 0
  let converted = 0
  let resized = 0
  let skipped = 0
  let errors = 0
  
  for (const file of imageFiles) {
    const filePath = join(dirPath, file)
    const result = await optimizeImage(filePath)
    
    totalOriginal += result.originalSize
    totalNew += result.newSize
    
    switch (result.action) {
      case 'converted': converted++; break
      case 'resized': resized++; break
      case 'skipped': skipped++; break
      case 'error': errors++; break
    }
    
    if (result.action !== 'skipped') {
      const savings = ((result.originalSize - result.newSize) / result.originalSize * 100).toFixed(1)
      console.log(`  ${result.action.padEnd(10)} ${result.file.substring(0, 40).padEnd(42)} ${formatBytes(result.originalSize).padStart(10)} → ${formatBytes(result.newSize).padStart(10)} (${savings}% saved)`)
    }
  }
  
  const totalSavings = ((totalOriginal - totalNew) / totalOriginal * 100).toFixed(1)
  console.log(`  ${'─'.repeat(90)}`)
  console.log(`  Summary: ${converted} converted, ${resized} resized, ${skipped} skipped, ${errors} errors`)
  console.log(`  Size: ${formatBytes(totalOriginal)} → ${formatBytes(totalNew)} (${totalSavings}% reduction)`)
}

async function main(): Promise<void> {
  console.log('🖼️  Image Optimization Script')
  console.log('=============================')
  console.log(`Target: ${MAX_DIMENSION}x${MAX_DIMENSION} max, WebP @ ${WEBP_QUALITY}% quality`)
  
  for (const dir of OPTIMIZE_DIRS) {
    await optimizeDirectory(dir)
  }
  
  console.log('\n✅ Optimization complete')
  
  // Show final sizes
  console.log('\n📊 Final Directory Sizes:')
  for (const dir of OPTIMIZE_DIRS) {
    const dirPath = join(PUBLIC_DIR, dir)
    if (existsSync(dirPath)) {
      let totalSize = 0
      const files = readdirSync(dirPath)
      for (const file of files) {
        const filePath = join(dirPath, file)
        try {
          const stats = statSync(filePath)
          if (stats.isFile()) totalSize += stats.size
        } catch { /* skip */ }
      }
      console.log(`  ${formatBytes(totalSize).padStart(10)}  ${dir}/`)
    }
  }
  
  process.exit(0)
}

main().catch(error => {
  console.error('Optimization failed:', error)
  process.exit(1)
})
