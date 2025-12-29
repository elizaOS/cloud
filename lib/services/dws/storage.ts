/**
 * DWS Storage Service
 *
 * Drop-in replacement for @vercel/blob that uses DWS storage backend.
 * Supports IPFS pinning, local caching, and CDN distribution.
 *
 * API is compatible with @vercel/blob:
 * - put(pathname, body, options)
 * - del(url)
 * - list(options)
 * - head(url)
 */

import { z } from 'zod'
import { getDWSConfig } from './config'
import { logger } from '@/lib/utils/logger'

// Types matching @vercel/blob interface
export interface PutBlobResult {
  url: string
  downloadUrl: string
  pathname: string
  contentType: string
  contentDisposition: string
  cid?: string
  ipfsGatewayUrl?: string
}

export interface HeadBlobResult {
  url: string
  downloadUrl: string
  pathname: string
  contentType: string
  contentDisposition: string
  size: number
  uploadedAt: Date
  cacheControl: string
  cid?: string
}

export interface ListBlobResult {
  blobs: ListBlobResultBlob[]
  cursor?: string
  hasMore: boolean
}

export interface ListBlobResultBlob {
  url: string
  downloadUrl: string
  pathname: string
  contentType: string
  size: number
  uploadedAt: Date
  cid?: string
}

export interface PutOptions {
  access?: 'public' | 'private'
  contentType?: string
  addRandomSuffix?: boolean
  cacheControlMaxAge?: number
  multipart?: boolean
  pinToIPFS?: boolean
}

export interface ListOptions {
  prefix?: string
  limit?: number
  cursor?: string
  mode?: 'expanded' | 'folded'
}

// DWS Storage API Response Types
const DWSUploadResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  pathname: z.string(),
  contentType: z.string(),
  size: z.number(),
  cid: z.string().optional(),
  ipfsGatewayUrl: z.string().optional(),
  uploadedAt: z.string(),
})

const DWSListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      url: z.string(),
      pathname: z.string(),
      contentType: z.string(),
      size: z.number(),
      cid: z.string().optional(),
      uploadedAt: z.string(),
    }),
  ),
  cursor: z.string().optional(),
  hasMore: z.boolean(),
})

const DWSHeadResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  pathname: z.string(),
  contentType: z.string(),
  size: z.number(),
  cid: z.string().optional(),
  uploadedAt: z.string(),
  cacheControl: z.string().optional(),
})

/**
 * Upload a file to DWS storage
 * Compatible with @vercel/blob put()
 */
export async function put(
  pathname: string,
  body: string | Buffer | Blob | ReadableStream | ArrayBuffer,
  options: PutOptions = {},
): Promise<PutBlobResult> {
  const config = getDWSConfig()
  const {
    access = 'public',
    contentType = 'application/octet-stream',
    addRandomSuffix = true,
    cacheControlMaxAge,
    pinToIPFS = config.storageProvider !== 'local',
  } = options

  // Generate final pathname
  let finalPathname = pathname
  if (addRandomSuffix) {
    const suffix = crypto.randomUUID().slice(0, 8)
    const lastDot = pathname.lastIndexOf('.')
    if (lastDot > 0) {
      finalPathname = `${pathname.slice(0, lastDot)}-${suffix}${pathname.slice(lastDot)}`
    } else {
      finalPathname = `${pathname}-${suffix}`
    }
  }

  // Convert body to Buffer
  let buffer: Buffer
  if (typeof body === 'string') {
    buffer = Buffer.from(body, 'utf-8')
  } else if (Buffer.isBuffer(body)) {
    buffer = body
  } else if (body instanceof Blob) {
    buffer = Buffer.from(await body.arrayBuffer())
  } else if (body instanceof ArrayBuffer) {
    buffer = Buffer.from(body)
  } else if (isReadableStream(body)) {
    buffer = await streamToBuffer(body)
  } else {
    throw new Error('Unsupported body type')
  }

  logger.info('[DWS Storage] Uploading file', {
    pathname: finalPathname,
    size: buffer.length,
    contentType,
    pinToIPFS,
  })

  const formData = new FormData()
  formData.append('file', new Blob([buffer], { type: contentType }), finalPathname)
  formData.append('pathname', finalPathname)
  formData.append('access', access)
  formData.append('pinToIPFS', String(pinToIPFS))
  if (cacheControlMaxAge !== undefined) {
    formData.append('cacheControlMaxAge', String(cacheControlMaxAge))
  }

  const response = await fetch(`${config.storageUrl}/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DWS storage upload failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const parsed = DWSUploadResponseSchema.parse(data)

  const result: PutBlobResult = {
    url: parsed.url,
    downloadUrl: parsed.url,
    pathname: parsed.pathname,
    contentType: parsed.contentType,
    contentDisposition: `attachment; filename="${encodeURIComponent(finalPathname.split('/').pop() ?? 'file')}"`,
    cid: parsed.cid,
    ipfsGatewayUrl: parsed.ipfsGatewayUrl,
  }

  logger.info('[DWS Storage] Upload complete', {
    pathname: parsed.pathname,
    url: parsed.url,
    cid: parsed.cid,
  })

  return result
}

/**
 * Delete a file from DWS storage
 * Compatible with @vercel/blob del()
 */
export async function del(url: string | string[]): Promise<void> {
  const config = getDWSConfig()
  const urls = Array.isArray(url) ? url : [url]

  logger.info('[DWS Storage] Deleting files', { count: urls.length })

  for (const fileUrl of urls) {
    const response = await fetch(`${config.storageUrl}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: fileUrl }),
    })

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text()
      throw new Error(`DWS storage delete failed: ${response.status} - ${errorText}`)
    }
  }

  logger.info('[DWS Storage] Delete complete', { count: urls.length })
}

/**
 * List files in DWS storage
 * Compatible with @vercel/blob list()
 */
export async function list(options: ListOptions = {}): Promise<ListBlobResult> {
  const config = getDWSConfig()
  const { prefix, limit = 1000, cursor, mode = 'expanded' } = options

  const params = new URLSearchParams()
  if (prefix) params.set('prefix', prefix)
  if (limit) params.set('limit', String(limit))
  if (cursor) params.set('cursor', cursor)
  if (mode) params.set('mode', mode)

  const response = await fetch(`${config.storageUrl}/list?${params.toString()}`, {
    method: 'GET',
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DWS storage list failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const parsed = DWSListResponseSchema.parse(data)

  return {
    blobs: parsed.items.map((item) => ({
      url: item.url,
      downloadUrl: item.url,
      pathname: item.pathname,
      contentType: item.contentType,
      size: item.size,
      uploadedAt: new Date(item.uploadedAt),
      cid: item.cid,
    })),
    cursor: parsed.cursor,
    hasMore: parsed.hasMore,
  }
}

/**
 * Get file metadata from DWS storage
 * Compatible with @vercel/blob head()
 */
export async function head(url: string): Promise<HeadBlobResult | null> {
  const config = getDWSConfig()

  const response = await fetch(`${config.storageUrl}/head`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DWS storage head failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const parsed = DWSHeadResponseSchema.parse(data)

  return {
    url: parsed.url,
    downloadUrl: parsed.url,
    pathname: parsed.pathname,
    contentType: parsed.contentType,
    contentDisposition: `attachment; filename="${encodeURIComponent(parsed.pathname.split('/').pop() ?? 'file')}"`,
    size: parsed.size,
    uploadedAt: new Date(parsed.uploadedAt),
    cacheControl: parsed.cacheControl ?? 'public, max-age=31536000',
    cid: parsed.cid,
  }
}

/**
 * Copy a file within DWS storage
 */
export async function copy(
  fromUrl: string,
  toPathname: string,
  options: PutOptions = {},
): Promise<PutBlobResult> {
  const config = getDWSConfig()

  const response = await fetch(`${config.storageUrl}/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromUrl,
      toPathname,
      ...options,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DWS storage copy failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const parsed = DWSUploadResponseSchema.parse(data)

  return {
    url: parsed.url,
    downloadUrl: parsed.url,
    pathname: parsed.pathname,
    contentType: parsed.contentType,
    contentDisposition: `attachment; filename="${encodeURIComponent(parsed.pathname.split('/').pop() ?? 'file')}"`,
    cid: parsed.cid,
    ipfsGatewayUrl: parsed.ipfsGatewayUrl,
  }
}

/**
 * Get the public URL for a file
 */
export function getPublicUrl(pathname: string): string {
  const config = getDWSConfig()
  return `${config.storageUrl}/public/${pathname}`
}

/**
 * Get the IPFS gateway URL for a file
 */
export function getIPFSUrl(cid: string): string {
  const config = getDWSConfig()
  const gateway = config.ipfsGatewayUrl ?? 'https://ipfs.io/ipfs'
  return `${gateway}/${cid}`
}

// Storage pricing (for compatibility with existing code)
const STORAGE_PRICING = {
  uploadPerMB: '$0.001',
  retrievalPerMB: '$0.0001',
  pinPerGBMonth: '$0.01',
  minUploadFee: '$0.0001',
}

export function calculateUploadCost(sizeBytes: number): number {
  const sizeMB = sizeBytes / (1024 * 1024)
  const perMBCost = parseFloat(STORAGE_PRICING.uploadPerMB.replace('$', ''))
  const minFee = parseFloat(STORAGE_PRICING.minUploadFee.replace('$', ''))
  const cost = sizeMB * perMBCost
  return Math.max(cost, minFee)
}

export function calculateRetrievalCost(sizeBytes: number): number {
  const sizeMB = sizeBytes / (1024 * 1024)
  const perMBCost = parseFloat(STORAGE_PRICING.retrievalPerMB.replace('$', ''))
  return sizeMB * perMBCost
}

export function getStoragePricing() {
  return STORAGE_PRICING
}

// Utility functions
function isReadableStream(obj: unknown): obj is ReadableStream {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'getReader' in obj &&
    typeof (obj as ReadableStream).getReader === 'function'
  )
}

async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }

  return Buffer.concat(chunks)
}

/**
 * Trusted storage hosts for URL validation
 * Updated for DWS storage endpoints
 */
export const TRUSTED_STORAGE_HOSTS = [
  'storage.dws.local',
  'storage.testnet.jejunetwork.org',
  'storage.jejunetwork.org',
  'ipfs.io',
  'w3s.link',
  'dweb.link',
  'cloudflare-ipfs.com',
]

/**
 * Validate that a URL points to a trusted storage host
 */
export function isValidStorageUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return false
    }
    return TRUSTED_STORAGE_HOSTS.some(
      (host) =>
        parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`),
    )
  } catch {
    return false
  }
}

/**
 * Check if URL is from external provider that should be re-uploaded
 */
const EXTERNAL_PROVIDER_HOSTNAMES = [
  'fal.media',
  'fal.ai',
  'replicate.delivery',
  'oaidalleapiprodscus.blob.core.windows.net',
  'blob.vercel-storage.com',
  'public.blob.vercel-storage.com',
]

export function isExternalProviderUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    return EXTERNAL_PROVIDER_HOSTNAMES.some((hostname) =>
      urlObj.hostname.includes(hostname),
    )
  } catch {
    return false
  }
}

/**
 * Ensure URL is from DWS storage, re-uploading if needed
 */
export async function ensureLocalStorageUrl(
  sourceUrl: string,
  options: PutOptions & { 
    filename?: string
    fallbackToOriginal?: boolean 
  },
): Promise<string> {
  if (!isExternalProviderUrl(sourceUrl)) {
    return sourceUrl
  }

  try {
    const response = await fetch(sourceUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const contentType = options.contentType ?? response.headers.get('content-type') ?? 'application/octet-stream'
    const filename = options.filename ?? sourceUrl.split('/').pop() ?? 'file'

    const result = await put(filename, buffer, {
      ...options,
      contentType,
    })

    return result.url
  } catch (error) {
    logger.error('[DWS Storage] Failed to re-upload external URL', { sourceUrl, error })
    if (options.fallbackToOriginal !== false) {
      return sourceUrl
    }
    throw error
  }
}

// Re-export as default storage service for compatibility
export const dwsStorageService = {
  put,
  del,
  list,
  head,
  copy,
  getPublicUrl,
  getIPFSUrl,
  calculateUploadCost,
  calculateRetrievalCost,
  getStoragePricing,
  isValidStorageUrl,
  isExternalProviderUrl,
  ensureLocalStorageUrl,
}


