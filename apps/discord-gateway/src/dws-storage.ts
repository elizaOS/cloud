/**
 * DWS Storage Client for Discord Gateway
 *
 * Lightweight storage client that calls DWS storage API.
 * Replaces @vercel/blob for the discord gateway microservice.
 */

const DWS_STORAGE_URL = process.env.DWS_STORAGE_URL ?? 'http://localhost:4030/storage'

export interface PutBlobResult {
  url: string
  downloadUrl: string
  pathname: string
  contentType: string
  contentDisposition: string
}

export interface ListBlobResult {
  blobs: Array<{
    url: string
    pathname: string
    contentType: string
    size: number
    uploadedAt: Date
  }>
  cursor?: string
  hasMore: boolean
}

export interface ListOptions {
  prefix?: string
  limit?: number
  cursor?: string
}

export interface PutOptions {
  access?: 'public' | 'private'
  contentType?: string
  addRandomSuffix?: boolean
  cacheControlMaxAge?: number
}

/**
 * Upload a file to DWS storage
 */
export async function put(
  pathname: string,
  body: Buffer | string | Blob,
  options: PutOptions = {},
): Promise<PutBlobResult> {
  const {
    access = 'public',
    contentType = 'application/octet-stream',
    addRandomSuffix = true,
    cacheControlMaxAge,
  } = options

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

  let buffer: Buffer
  if (typeof body === 'string') {
    buffer = Buffer.from(body, 'utf-8')
  } else if (Buffer.isBuffer(body)) {
    buffer = body
  } else if (body instanceof Blob) {
    buffer = Buffer.from(await body.arrayBuffer())
  } else {
    throw new Error('Unsupported body type')
  }

  const formData = new FormData()
  formData.append('file', new Blob([buffer], { type: contentType }), finalPathname)
  formData.append('pathname', finalPathname)
  formData.append('access', access)
  if (cacheControlMaxAge !== undefined) {
    formData.append('cacheControlMaxAge', String(cacheControlMaxAge))
  }

  const response = await fetch(`${DWS_STORAGE_URL}/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DWS storage upload failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json()

  return {
    url: data.url,
    downloadUrl: data.url,
    pathname: data.pathname,
    contentType: data.contentType || contentType,
    contentDisposition: `attachment; filename="${encodeURIComponent(finalPathname.split('/').pop() ?? 'file')}"`,
  }
}

/**
 * Delete a file from DWS storage
 */
export async function del(url: string | string[]): Promise<void> {
  const urls = Array.isArray(url) ? url : [url]

  for (const fileUrl of urls) {
    const response = await fetch(`${DWS_STORAGE_URL}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: fileUrl }),
    })

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text()
      throw new Error(`DWS storage delete failed: ${response.status} - ${errorText}`)
    }
  }
}

/**
 * List files in DWS storage
 */
export async function list(options: ListOptions = {}): Promise<ListBlobResult> {
  const { prefix, limit = 1000, cursor } = options

  const params = new URLSearchParams()
  if (prefix) params.set('prefix', prefix)
  if (limit) params.set('limit', String(limit))
  if (cursor) params.set('cursor', cursor)

  const response = await fetch(`${DWS_STORAGE_URL}/list?${params.toString()}`, {
    method: 'GET',
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DWS storage list failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json()

  return {
    blobs: (data.items || []).map((item: { url: string; pathname: string; contentType: string; size: number; uploadedAt: string }) => ({
      url: item.url,
      pathname: item.pathname,
      contentType: item.contentType,
      size: item.size,
      uploadedAt: new Date(item.uploadedAt),
    })),
    cursor: data.cursor,
    hasMore: data.hasMore,
  }
}


