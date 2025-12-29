/**
 * DWS Domains Service
 *
 * Drop-in replacement for Vercel Domains API that uses DWS DNS.
 * Supports:
 * - Custom domain management
 * - JNS (Jeju Name Service) resolution
 * - SSL certificate provisioning
 * - DNS verification
 */

import { z } from 'zod'
import { getDWSConfig } from './config'
import { logger } from '@/lib/utils/logger'
import { db } from '@/db'
import { appDomains, type DomainVerificationRecord } from '@/db/schemas/app-domains'
import { eq, and, ne } from 'drizzle-orm'

// Reserved subdomains that cannot be used for apps
const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'admin', 'dashboard', 'app', 'apps', 'auth', 'login',
  'signup', 'register', 'account', 'settings', 'billing', 'docs', 'help',
  'support', 'status', 'cdn', 'static', 'assets', 'media', 'images',
  'files', 'mail', 'email', 'smtp', 'ftp', 'ssh', 'git', 'svn', 'blog',
  'news', 'forum', 'community', 'store', 'shop', 'cart', 'checkout',
  'pay', 'payments', 'webhook', 'webhooks', 'ws', 'wss', 'socket',
  'graphql', 'rest', 'v1', 'v2', 'v3', 'staging', 'dev', 'test', 'demo',
  'preview', 'beta', 'alpha', 'internal', 'private', 'public', 'sandbox', 'debug',
])

// DWS DNS API Response Types
const DWSDomainResponseSchema = z.object({
  name: z.string(),
  verified: z.boolean(),
  sslStatus: z.enum(['pending', 'provisioning', 'active', 'error']),
  sslExpiresAt: z.string().nullable(),
  configuredBy: z.enum(['CNAME', 'A', 'AAAA', 'http']).nullable(),
  verificationRecords: z.array(z.object({
    type: z.enum(['TXT', 'CNAME', 'A', 'AAAA']),
    name: z.string(),
    value: z.string(),
  })),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const DWSDomainConfigSchema = z.object({
  configuredBy: z.enum(['CNAME', 'A', 'AAAA', 'http']).nullable(),
  misconfigured: z.boolean(),
  acceptedChallenges: z.array(z.enum(['dns-01', 'http-01'])),
})

const DWSCertificateSchema = z.object({
  id: z.string(),
  domain: z.string(),
  status: z.enum(['pending', 'active', 'expired', 'error']),
  expiresAt: z.string(),
  issuedAt: z.string(),
})

export interface DomainStatusResult {
  domain: string
  status: 'pending' | 'valid' | 'invalid' | 'unknown'
  configured: boolean
  verified: boolean
  sslStatus: 'pending' | 'provisioning' | 'active' | 'error'
  sslExpiresAt: string | null
  configuredBy: 'CNAME' | 'A' | 'AAAA' | 'http' | null
  records: DomainVerificationRecord[]
  error?: string
}

export interface AddDomainResult {
  success: boolean
  domain: string
  verified: boolean
  verificationRecords: DomainVerificationRecord[]
  error?: string
}

/**
 * Check if a subdomain is reserved
 */
export function isReservedSubdomain(subdomain: string): boolean {
  return RESERVED_SUBDOMAINS.has(subdomain.toLowerCase())
}

/**
 * Check if a custom domain is already in use by another app
 */
export async function isDomainInUse(
  domain: string,
  excludeAppId?: string,
): Promise<{ inUse: boolean; appId?: string }> {
  const normalizedDomain = domain.toLowerCase().trim()

  const existing = await db.query.appDomains.findFirst({
    where: excludeAppId
      ? and(
          eq(appDomains.custom_domain, normalizedDomain),
          ne(appDomains.app_id, excludeAppId),
        )
      : eq(appDomains.custom_domain, normalizedDomain),
  })

  return {
    inUse: !!existing,
    appId: existing?.app_id,
  }
}

/**
 * Add a custom domain via DWS DNS
 */
export async function addDomain(
  appId: string,
  domain: string,
): Promise<AddDomainResult> {
  const config = getDWSConfig()
  const normalizedDomain = domain.toLowerCase().trim()

  // Validate domain format
  const domainRegex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/
  if (!domainRegex.test(normalizedDomain)) {
    return {
      success: false,
      domain: normalizedDomain,
      verified: false,
      verificationRecords: [],
      error: 'Invalid domain format',
    }
  }

  // Check for conflicts with other apps
  const conflict = await isDomainInUse(normalizedDomain, appId)
  if (conflict.inUse) {
    return {
      success: false,
      domain: normalizedDomain,
      verified: false,
      verificationRecords: [],
      error: 'This domain is already connected to another app',
    }
  }

  logger.info('[DWS Domains] Adding domain', { domain: normalizedDomain, appId })

  try {
    const response = await fetch(`${config.apiUrl}/dns/domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: normalizedDomain }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        domain: normalizedDomain,
        verified: false,
        verificationRecords: [],
        error: `Failed to add domain: ${errorText}`,
      }
    }

    const data = await response.json()
    const parsed = DWSDomainResponseSchema.parse(data)

    const verificationRecords: DomainVerificationRecord[] = parsed.verificationRecords.map((v) => ({
      type: v.type as 'TXT' | 'CNAME' | 'A',
      name: v.name,
      value: v.value,
    }))

    // Store in database
    const existingDomain = await db.query.appDomains.findFirst({
      where: eq(appDomains.app_id, appId),
    })

    if (existingDomain) {
      await db
        .update(appDomains)
        .set({
          custom_domain: normalizedDomain,
          custom_domain_verified: parsed.verified,
          verification_records: verificationRecords,
          ssl_status: parsed.sslStatus,
          dws_domain_id: parsed.name,
          updated_at: new Date(),
          verified_at: parsed.verified ? new Date() : null,
        })
        .where(eq(appDomains.id, existingDomain.id))
    } else {
      logger.warn('[DWS Domains] No domain record found for app - app must be deployed first', { appId })
      return {
        success: false,
        domain: normalizedDomain,
        verified: false,
        verificationRecords: [],
        error: 'App must be deployed before adding a custom domain',
      }
    }

    logger.info('[DWS Domains] Domain added', {
      domain: normalizedDomain,
      verified: parsed.verified,
      hasVerification: verificationRecords.length > 0,
    })

    return {
      success: true,
      domain: normalizedDomain,
      verified: parsed.verified,
      verificationRecords,
    }
  } catch (error) {
    logger.error('[DWS Domains] Failed to add domain', { domain: normalizedDomain, error })
    return {
      success: false,
      domain: normalizedDomain,
      verified: false,
      verificationRecords: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get the current status of a domain
 */
export async function getDomainStatus(domain: string): Promise<DomainStatusResult> {
  const config = getDWSConfig()
  const normalizedDomain = domain.toLowerCase().trim()

  try {
    // Get domain info and config from DWS
    const [domainResponse, configResponse, certResponse] = await Promise.all([
      fetch(`${config.apiUrl}/dns/domains/${normalizedDomain}`).catch(() => null),
      fetch(`${config.apiUrl}/dns/domains/${normalizedDomain}/config`).catch(() => null),
      fetch(`${config.apiUrl}/dns/certs?domain=${normalizedDomain}`).catch(() => null),
    ])

    if (!domainResponse?.ok) {
      return {
        domain: normalizedDomain,
        status: 'unknown',
        configured: false,
        verified: false,
        sslStatus: 'pending',
        sslExpiresAt: null,
        configuredBy: null,
        records: [],
        error: 'Domain not found',
      }
    }

    const domainData = DWSDomainResponseSchema.parse(await domainResponse.json())
    
    let configData: z.infer<typeof DWSDomainConfigSchema> | null = null
    if (configResponse?.ok) {
      configData = DWSDomainConfigSchema.parse(await configResponse.json())
    }

    let certData: z.infer<typeof DWSCertificateSchema> | null = null
    if (certResponse?.ok) {
      const certs = await certResponse.json()
      if (Array.isArray(certs) && certs.length > 0) {
        certData = DWSCertificateSchema.parse(certs[0])
      }
    }

    const records: DomainVerificationRecord[] = domainData.verificationRecords.map((v) => ({
      type: v.type as 'TXT' | 'CNAME' | 'A',
      name: v.name,
      value: v.value,
    }))

    // Determine overall status
    let status: DomainStatusResult['status'] = 'pending'
    if (domainData.verified && configData && !configData.misconfigured) {
      status = 'valid'
    } else if (configData?.misconfigured) {
      status = 'invalid'
    }

    // Determine SSL status
    let sslStatus: DomainStatusResult['sslStatus'] = domainData.sslStatus
    let sslExpiresAt: string | null = domainData.sslExpiresAt

    if (certData) {
      sslExpiresAt = certData.expiresAt
      const expiresAt = new Date(certData.expiresAt)
      if (expiresAt > new Date()) {
        sslStatus = 'active'
      } else {
        sslStatus = 'error'
      }
    }

    return {
      domain: normalizedDomain,
      status,
      configured: configData?.configuredBy !== null,
      verified: domainData.verified,
      sslStatus,
      sslExpiresAt,
      configuredBy: configData?.configuredBy ?? null,
      records,
    }
  } catch (error) {
    logger.error('[DWS Domains] Failed to get domain status', { domain: normalizedDomain, error })
    return {
      domain: normalizedDomain,
      status: 'unknown',
      configured: false,
      verified: false,
      sslStatus: 'pending',
      sslExpiresAt: null,
      configuredBy: null,
      records: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Verify a domain manually
 */
export async function verifyDomain(domain: string): Promise<{ verified: boolean; error?: string }> {
  const config = getDWSConfig()
  const normalizedDomain = domain.toLowerCase().trim()

  logger.info('[DWS Domains] Verifying domain', { domain: normalizedDomain })

  try {
    const response = await fetch(`${config.apiUrl}/dns/domains/${normalizedDomain}/verify`, {
      method: 'POST',
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { verified: false, error: errorText }
    }

    const data = await response.json()
    return { verified: data.verified ?? false }
  } catch (error) {
    logger.error('[DWS Domains] Failed to verify domain', { domain: normalizedDomain, error })
    return { verified: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Remove a custom domain
 */
export async function removeDomain(
  appId: string,
  domain: string,
): Promise<{ success: boolean; error?: string }> {
  const config = getDWSConfig()
  const normalizedDomain = domain.toLowerCase().trim()

  logger.info('[DWS Domains] Removing domain', { domain: normalizedDomain, appId })

  try {
    // Remove from DWS
    await fetch(`${config.apiUrl}/dns/domains/${normalizedDomain}`, {
      method: 'DELETE',
    })

    // Update database
    await db
      .update(appDomains)
      .set({
        custom_domain: null,
        custom_domain_verified: false,
        verification_records: [],
        ssl_status: 'pending',
        dws_domain_id: null,
        updated_at: new Date(),
        verified_at: null,
      })
      .where(eq(appDomains.app_id, appId))

    logger.info('[DWS Domains] Domain removed', { domain: normalizedDomain })
    return { success: true }
  } catch (error) {
    logger.error('[DWS Domains] Failed to remove domain', { domain: normalizedDomain, error })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get DNS configuration instructions for a domain
 */
export function getDnsInstructions(
  domain: string,
  isApex: boolean,
): Array<{ type: 'A' | 'AAAA' | 'CNAME'; name: string; value: string; description: string }> {
  const config = getDWSConfig()
  const baseHost = new URL(config.apiUrl).hostname

  if (isApex) {
    // Apex domain (e.g., example.com)
    return [
      {
        type: 'A',
        name: '@',
        value: '76.76.21.21', // DWS anycast IP (placeholder)
        description: 'Point your apex domain to DWS',
      },
      {
        type: 'AAAA',
        name: '@',
        value: '2606:4700::1', // DWS IPv6 (placeholder)
        description: 'Point your apex domain to DWS (IPv6)',
      },
    ]
  }

  // Subdomain (e.g., app.example.com)
  const subdomain = domain.split('.')[0]
  return [
    {
      type: 'CNAME',
      name: subdomain,
      value: `cname.${baseHost}`,
      description: 'Point your subdomain to DWS',
    },
  ]
}

/**
 * Check if a domain is an apex domain
 */
export function isApexDomain(domain: string): boolean {
  const parts = domain.split('.')
  return parts.length === 2
}

/**
 * Validate a subdomain
 */
export function validateSubdomain(subdomain: string): { valid: boolean; error?: string } {
  const normalized = subdomain.toLowerCase().trim()

  if (normalized.length < 3) {
    return { valid: false, error: 'Subdomain must be at least 3 characters' }
  }
  if (normalized.length > 63) {
    return { valid: false, error: 'Subdomain must be at most 63 characters' }
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(normalized)) {
    return { valid: false, error: 'Subdomain can only contain lowercase letters, numbers, and hyphens' }
  }
  if (isReservedSubdomain(normalized)) {
    return { valid: false, error: 'This subdomain is reserved and cannot be used' }
  }

  return { valid: true }
}

/**
 * Get all domains for an app
 */
export async function getDomainsForApp(appId: string) {
  const config = getDWSConfig()
  const domains = await db.query.appDomains.findMany({
    where: eq(appDomains.app_id, appId),
  })

  return domains.map((d) => ({
    id: d.id,
    subdomain: d.subdomain,
    subdomainUrl: `https://${d.subdomain}.${config.defaultDomain}`,
    customDomain: d.custom_domain,
    customDomainUrl: d.custom_domain ? `https://${d.custom_domain}` : null,
    customDomainVerified: d.custom_domain_verified,
    sslStatus: d.ssl_status,
    isPrimary: d.is_primary,
    verificationRecords: d.verification_records,
    createdAt: d.created_at,
    verifiedAt: d.verified_at,
  }))
}

/**
 * Sync domain status from DWS to database
 */
export async function syncDomainStatus(appId: string): Promise<void> {
  const domains = await db.query.appDomains.findMany({
    where: eq(appDomains.app_id, appId),
  })

  for (const domain of domains) {
    if (!domain.custom_domain) continue

    const status = await getDomainStatus(domain.custom_domain)

    await db
      .update(appDomains)
      .set({
        custom_domain_verified: status.verified,
        ssl_status: status.sslStatus,
        verification_records: status.records,
        verified_at: status.verified ? domain.verified_at || new Date() : null,
        updated_at: new Date(),
      })
      .where(eq(appDomains.id, domain.id))

    logger.info('[DWS Domains] Synced domain status', {
      domain: domain.custom_domain,
      verified: status.verified,
      sslStatus: status.sslStatus,
    })
  }
}

/**
 * Register a JNS name for an app
 */
export async function registerJNSName(
  appId: string,
  jnsName: string,
): Promise<{ success: boolean; error?: string }> {
  const config = getDWSConfig()

  if (!config.jnsEnabled) {
    return { success: false, error: 'JNS is not enabled' }
  }

  // Validate JNS name format (e.g., "myapp.jeju")
  if (!jnsName.endsWith('.jeju') && !jnsName.endsWith('.jns')) {
    return { success: false, error: 'JNS name must end with .jeju or .jns' }
  }

  logger.info('[DWS Domains] Registering JNS name', { jnsName, appId })

  try {
    const response = await fetch(`${config.apiUrl}/dns/jns/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: jnsName, appId }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: errorText }
    }

    return { success: true }
  } catch (error) {
    logger.error('[DWS Domains] Failed to register JNS name', { jnsName, error })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export const dwsDomainsService = {
  addDomain,
  getDomainStatus,
  verifyDomain,
  removeDomain,
  getDnsInstructions,
  isApexDomain,
  isReservedSubdomain,
  isDomainInUse,
  validateSubdomain,
  getDomainsForApp,
  syncDomainStatus,
  registerJNSName,
}


