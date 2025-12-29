/**
 * Vercel Domains Service Compatibility Layer
 *
 * This module re-exports the DWS domains service with a Vercel-compatible API.
 * It provides backwards compatibility for existing code that uses Vercel Domains.
 *
 * For new code, prefer using the DWS domains service directly:
 * import { dwsDomainsService } from "@/lib/services/dws/domains";
 */

export {
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
  dwsDomainsService as vercelDomainsService,
  type DomainStatusResult,
  type AddDomainResult,
} from "@/lib/services/dws/domains";
