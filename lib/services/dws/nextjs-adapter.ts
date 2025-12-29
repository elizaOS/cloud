/**
 * DWS Next.js Adapter
 *
 * Adapts Next.js applications to run on DWS workerd runtime.
 * Provides SSR support with edge-compatible execution.
 *
 * Uses OpenNext-compatible patterns for building Next.js
 * applications that can run on Cloudflare Workers / workerd.
 */

import { z } from 'zod'
import { getDWSConfig } from './config'
import { logger } from '@/lib/utils/logger'

// Build configuration for Next.js on DWS
export interface DWSNextBuildConfig {
  // Output directory for the build
  outputDir: string
  // Whether to enable static export mode
  staticExport: boolean
  // Edge runtime settings
  edge: {
    // Split large bundles for edge compatibility
    splitChunks: boolean
    // Maximum bundle size in KB
    maxBundleSize: number
    // Use standalone output
    standalone: boolean
  }
  // SSR configuration
  ssr: {
    // Enable streaming responses
    streaming: boolean
    // Edge runtime for pages
    edgePages: boolean
    // Server actions runtime
    serverActionsRuntime: 'edge' | 'nodejs'
  }
}

// Default build configuration
export const DEFAULT_BUILD_CONFIG: DWSNextBuildConfig = {
  outputDir: '.open-next',
  staticExport: false,
  edge: {
    splitChunks: true,
    maxBundleSize: 1024, // 1MB
    standalone: true,
  },
  ssr: {
    streaming: true,
    edgePages: true,
    serverActionsRuntime: 'edge',
  },
}

// DWS Worker deployment result
export interface DWSDeploymentResult {
  workerId: string
  url: string
  staticUrl: string
  region: string
  status: 'deploying' | 'ready' | 'error'
  createdAt: Date
  updatedAt: Date
}

const DWSDeploymentSchema = z.object({
  workerId: z.string(),
  url: z.string(),
  staticUrl: z.string(),
  region: z.string(),
  status: z.enum(['deploying', 'ready', 'error']),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Generate Next.js configuration for DWS deployment
 */
export function generateNextConfig(): string {
  return `
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  // DWS-specific optimizations
  experimental: {
    // Enable PPR for better edge performance
    ppr: true,
    // Use edge runtime for API routes
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  
  // Optimize for workerd
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize Node.js-specific modules
      config.externals = [...(config.externals || []), {
        'node:crypto': 'crypto',
        'node:buffer': 'buffer',
        'node:stream': 'stream',
        'node:util': 'util',
      }];
    }
    return config;
  },
  
  // Image optimization for DWS CDN
  images: {
    loader: 'custom',
    loaderFile: './lib/dws-image-loader.ts',
    remotePatterns: [
      { protocol: 'https', hostname: 'storage.dws.local' },
      { protocol: 'https', hostname: 'storage.testnet.jejunetwork.org' },
      { protocol: 'https', hostname: 'storage.jejunetwork.org' },
      { protocol: 'https', hostname: 'ipfs.io' },
    ],
  },
  
  // Headers for DWS
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DWS-Powered', value: 'true' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
`.trim()
}

/**
 * Generate DWS image loader for Next.js
 */
export function generateImageLoader(): string {
  return `
'use client';

import { getDWSConfig } from '@/lib/services/dws/config';

export default function dwsImageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) {
  const config = getDWSConfig();
  const q = quality || 75;
  
  // If already a full URL, use DWS image optimizer
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return \`\${config.storageUrl}/optimize?url=\${encodeURIComponent(src)}&w=\${width}&q=\${q}\`;
  }
  
  // For relative paths, prefix with CDN
  return \`\${config.storageUrl}/images\${src}?w=\${width}&q=\${q}\`;
}
`.trim()
}

/**
 * Generate workerd worker script for Next.js
 */
export function generateWorkerScript(appPath: string): string {
  return `
import { Router } from './router';
import handler from '${appPath}';

export default {
  async fetch(request, env, ctx) {
    // Inject environment into globalThis for Next.js
    globalThis.process = globalThis.process || { env: {} };
    Object.assign(globalThis.process.env, env);
    
    const url = new URL(request.url);
    
    // Static asset handling
    if (url.pathname.startsWith('/_next/static/')) {
      const staticUrl = env.STATIC_ASSETS_URL + url.pathname;
      const response = await fetch(staticUrl);
      if (response.ok) {
        return new Response(response.body, {
          headers: {
            ...Object.fromEntries(response.headers),
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }
    }
    
    // Handle the request with Next.js handler
    try {
      return await handler(request, env, ctx);
    } catch (error) {
      console.error('[DWS Next.js] Handler error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal Server Error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};
`.trim()
}

/**
 * Generate workerd configuration for Next.js
 */
export function generateWorkerdConfig(params: {
  name: string
  scriptPath: string
  staticAssetsUrl: string
  env: Record<string, string>
  bindings?: Array<{ name: string; type: 'kv' | 'd1' | 'r2' | 'service' }>
}): string {
  const { name, scriptPath, staticAssetsUrl, env, bindings = [] } = params

  const envBindings = Object.entries(env)
    .map(([key, value]) => `      ${key} = "${value}"`)
    .join(',\n')

  const serviceBindings = bindings
    .map((b) => {
      switch (b.type) {
        case 'kv':
          return `      kv_namespaces = [{ binding = "${b.name}", id = "${b.name}" }]`
        case 'd1':
          return `      d1_databases = [{ binding = "${b.name}", database_id = "${b.name}" }]`
        case 'r2':
          return `      r2_buckets = [{ binding = "${b.name}", bucket_name = "${b.name}" }]`
        case 'service':
          return `      services = [{ binding = "${b.name}", service = "${b.name}" }]`
        default:
          return ''
      }
    })
    .filter(Boolean)
    .join('\n')

  return `
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
  compatibilityDate = "2024-01-01",
  modules = [
    (name = "worker", esModule = embed "${scriptPath}"),
  ],
  bindings = [
    (name = "STATIC_ASSETS_URL", text = "${staticAssetsUrl}"),
${envBindings}
  ],
${serviceBindings}
);
`.trim()
}

/**
 * Build and deploy Next.js app to DWS
 */
export async function deployNextApp(params: {
  appId: string
  buildDir: string
  env?: Record<string, string>
  region?: string
}): Promise<DWSDeploymentResult> {
  const config = getDWSConfig()
  const { appId, buildDir, env = {}, region = 'na-east' } = params

  logger.info('[DWS Next.js] Deploying Next.js app', { appId, buildDir, region })

  // Upload build artifacts to DWS storage
  const formData = new FormData()
  
  // In production, we'd tar the build directory and upload
  // For now, we call the DWS deploy API directly
  formData.append('appId', appId)
  formData.append('buildDir', buildDir)
  formData.append('region', region)
  formData.append('env', JSON.stringify(env))
  formData.append('type', 'nextjs')

  const response = await fetch(`${config.apiUrl}/deploy/nextjs`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to deploy Next.js app: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const parsed = DWSDeploymentSchema.parse(data)

  logger.info('[DWS Next.js] Deployment initiated', {
    workerId: parsed.workerId,
    url: parsed.url,
    status: parsed.status,
  })

  return {
    ...parsed,
    createdAt: new Date(parsed.createdAt),
    updatedAt: new Date(parsed.updatedAt),
  }
}

/**
 * Get deployment status
 */
export async function getDeploymentStatus(workerId: string): Promise<DWSDeploymentResult> {
  const config = getDWSConfig()

  const response = await fetch(`${config.apiUrl}/deploy/${workerId}`)

  if (!response.ok) {
    throw new Error(`Failed to get deployment status: ${response.status}`)
  }

  const data = await response.json()
  const parsed = DWSDeploymentSchema.parse(data)

  return {
    ...parsed,
    createdAt: new Date(parsed.createdAt),
    updatedAt: new Date(parsed.updatedAt),
  }
}

/**
 * Wait for deployment to be ready
 */
export async function waitForDeployment(
  workerId: string,
  timeoutMs = 300000,
): Promise<DWSDeploymentResult> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const status = await getDeploymentStatus(workerId)

    if (status.status === 'ready') {
      return status
    }

    if (status.status === 'error') {
      throw new Error('Deployment failed')
    }

    await new Promise((resolve) => setTimeout(resolve, 5000))
  }

  throw new Error('Deployment timeout')
}

/**
 * Delete a deployment
 */
export async function deleteDeployment(workerId: string): Promise<void> {
  const config = getDWSConfig()

  const response = await fetch(`${config.apiUrl}/deploy/${workerId}`, {
    method: 'DELETE',
  })

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete deployment: ${response.status}`)
  }

  logger.info('[DWS Next.js] Deployment deleted', { workerId })
}

export const dwsNextjsAdapter = {
  generateNextConfig,
  generateImageLoader,
  generateWorkerScript,
  generateWorkerdConfig,
  deployNextApp,
  getDeploymentStatus,
  waitForDeployment,
  deleteDeployment,
  DEFAULT_BUILD_CONFIG,
}


