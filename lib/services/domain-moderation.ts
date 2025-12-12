import { hasBadWords, minimalBadWordsArray } from "expletives";
import { managedDomainsRepository, type DomainModerationFlag } from "@/db/repositories/managed-domains";
import { logger } from "@/lib/utils/logger";

export interface DomainModerationResult {
  allowed: boolean;
  flags: DomainModerationFlag[];
  requiresReview: boolean;
  suggestedAction?: "block" | "review" | "allow";
}

export interface DomainHealthCheckResult {
  isLive: boolean;
  httpStatus?: number;
  sslValid?: boolean;
  sslExpiresAt?: Date;
  error?: string;
  responseTimeMs?: number;
}

export interface ContentScanResult {
  clean: boolean;
  flags: DomainModerationFlag[];
}

const RESTRICTED_TERMS = new Set([
  // CSAM-related terms (abbreviated for safety)
  "childporn",
  "childp0rn",
  "ch1ldporn",
  "kidporn",
  "kidp0rn",
  "k1dporn",
  "pedo",
  "paedo",
  "pedophile",
  "paedophile",
  "lolita",
  "jailbait",
  "preteen",
  "underage",
  // Violence/terrorism
  "killkids",
  "bombmaking",
  "terrorattack",
  // Scam indicators
  "freemoney",
  "freebitcoin",
  "doubleyour",
  "getrichquick",
]);

const SUSPICIOUS_PATTERNS = [
  // Keyboard walks
  /^[qwerty]{6,}$/i,
  /^[asdfgh]{6,}$/i,
  /^[zxcvbn]{6,}$/i,
  /^[12345]{5,}$/i,
  // Repeated characters
  /(.)\1{4,}/,
  // Random-looking strings (consonant clusters)
  /[bcdfghjklmnpqrstvwxz]{6,}/i,
  // Number-letter-number patterns (like temp domains)
  /^[a-z]\d{4,}[a-z]$/i,
  // All numbers with a letter
  /^\d{5,}[a-z]$/i,
  /^[a-z]\d{5,}$/i,
];

const TRADEMARK_TERMS = new Set([
  "google",
  "facebook",
  "microsoft",
  "apple",
  "amazon",
  "netflix",
  "paypal",
  "coinbase",
  "binance",
  "openai",
  "anthropic",
]);

const extractDomainName = (domain: string): string =>
  domain.toLowerCase().split(".").slice(0, -1).join("");

const normalize = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]/g, "");

const findInSet = (text: string, terms: Set<string>): string | undefined =>
  [...terms].find((term) => normalize(text).includes(term));

const matchesAnyPattern = (text: string, patterns: RegExp[]): boolean =>
  patterns.some((p) => p.test(text));

function calculateEntropy(text: string): number {
  const freq: Record<string, number> = {};
  for (const char of text.toLowerCase()) freq[char] = (freq[char] || 0) + 1;
  return Object.values(freq).reduce((e, count) => {
    const p = count / text.length;
    return e - p * Math.log2(p);
  }, 0);
}

class DomainModerationService {
  async validateDomainName(domain: string): Promise<DomainModerationResult> {
    const name = extractDomainName(domain);
    const now = new Date().toISOString();
    const flags: DomainModerationFlag[] = [];

    const addFlag = (type: DomainModerationFlag["type"], severity: DomainModerationFlag["severity"], reason: string) =>
      flags.push({ type, severity, reason, detectedAt: now });

    logger.debug("[DomainModeration] Validating", { domain });

    // Restricted terms (absolute block)
    const restricted = findInSet(name, RESTRICTED_TERMS);
    if (restricted) {
      addFlag("restricted", "critical", `Contains restricted term: ${restricted}`);
      logger.warn("[DomainModeration] Blocked restricted term", { domain, term: restricted });
      return { allowed: false, flags, requiresReview: false, suggestedAction: "block" };
    }

    // Expletives
    if (hasBadWords(name)) {
      const words = minimalBadWordsArray.filter((w) => name.includes(w.toLowerCase()));
      addFlag("expletive", "high", `Contains expletive: ${words.join(", ")}`);
    }

    // Suspicious patterns
    if (matchesAnyPattern(name, SUSPICIOUS_PATTERNS)) {
      addFlag("suspicious", "medium", "Matches suspicious pattern (possible bot)");
    }

    // High entropy (random-looking)
    if (name.length >= 8 && calculateEntropy(name) > 3.5) {
      addFlag("suspicious", "low", "High entropy suggests random generation");
    }

    // Trademark concerns
    const trademark = findInSet(name, TRADEMARK_TERMS);
    if (trademark) {
      addFlag("trademark", "medium", `May infringe trademark: ${trademark}`);
    }

    const maxSeverity = flags.reduce((max, f) => {
      const order = { critical: 4, high: 3, medium: 2, low: 1 };
      return order[f.severity] > order[max] ? f.severity : max;
    }, "low" as DomainModerationFlag["severity"]);

    if (maxSeverity === "critical") return { allowed: false, flags, requiresReview: false, suggestedAction: "block" };
    if (maxSeverity === "high") return { allowed: false, flags, requiresReview: true, suggestedAction: "review" };
    return { allowed: true, flags, requiresReview: maxSeverity === "medium", suggestedAction: maxSeverity === "medium" ? "review" : "allow" };
  }

  async checkDomainHealth(domain: string): Promise<DomainHealthCheckResult> {
    const startTime = Date.now();

    const tryFetch = async (url: string): Promise<DomainHealthCheckResult | null> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
        clearTimeout(timeout);
        return {
          isLive: response.ok || response.status < 500,
          httpStatus: response.status,
          sslValid: url.startsWith("https"),
          responseTimeMs: Date.now() - startTime,
        };
      } catch {
        clearTimeout(timeout);
        return null;
      }
    };

    return (await tryFetch(`https://${domain}`)) ||
           (await tryFetch(`http://${domain}`)) ||
           { isLive: false, sslValid: false, error: "Connection failed" };
  }

  async performHealthCheck(domainId: string): Promise<DomainHealthCheckResult> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain) {
      return { isLive: false, error: "Domain not found" };
    }

    const result = await this.checkDomainHealth(domain.domain);

    // Update domain status
    await managedDomainsRepository.updateHealthStatus(
      domainId,
      result.isLive,
      result.error
    );

    // Log event if status changed
    if (result.isLive !== domain.isLive) {
      await managedDomainsRepository.createEvent({
        domainId,
        eventType: "health_check",
        severity: result.isLive ? "info" : "medium",
        description: result.isLive
          ? "Domain is now responding"
          : `Domain health check failed: ${result.error || "No response"}`,
        detectedBy: "health_monitor",
        evidence: {
          httpResponse: result.httpStatus
            ? { statusCode: result.httpStatus }
            : undefined,
        },
      });
    }

    return result;
  }

  async scanDomainContent(domainId: string): Promise<ContentScanResult> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain) return { clean: true, flags: [] };

    const now = new Date().toISOString();
    const flags: DomainModerationFlag[] = [];

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`https://${domain.domain}`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) return { clean: true, flags: [] };

      const html = await response.text();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 5000);

      const restricted = findInSet(text, RESTRICTED_TERMS);
      if (restricted) flags.push({ type: "content", severity: "critical", reason: `Content contains: ${restricted}`, detectedAt: now });

      if (hasBadWords(text)) {
        const words = minimalBadWordsArray.filter((w) => text.toLowerCase().includes(w.toLowerCase())).slice(0, 3);
        flags.push({ type: "content", severity: "medium", reason: `Content expletives: ${words.join(", ")}`, detectedAt: now });
      }

      if (flags.length > 0) {
        const hasCritical = flags.some((f) => f.severity === "critical");
        await managedDomainsRepository.updateModerationStatus(domainId, hasCritical ? "flagged" : "pending_review", [...(domain.moderationFlags || []), ...flags]);
        await managedDomainsRepository.createEvent({
          domainId,
          eventType: "content_scan",
          severity: hasCritical ? "critical" : "medium",
          description: `Content scan found ${flags.length} issue(s)`,
          detectedBy: "automated_scan",
          evidence: { contentSample: text.slice(0, 200) },
        });
      }

      return { clean: flags.length === 0, flags };
    } catch (error) {
      logger.warn("[DomainModeration] Content scan failed", { domain: domain.domain, error });
      return { clean: true, flags: [] };
    }
  }

  async flagDomain(
    domainId: string,
    reason: string,
    severity: DomainModerationFlag["severity"] = "medium",
    adminUserId?: string
  ): Promise<boolean> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain) return false;

    const flag: DomainModerationFlag = {
      type: "content",
      severity,
      reason,
      detectedAt: new Date().toISOString(),
    };

    await managedDomainsRepository.addModerationFlag(domainId, flag);

    await managedDomainsRepository.createEvent({
      domainId,
      eventType: adminUserId ? "admin_flag" : "auto_flag",
      severity,
      description: reason,
      detectedBy: adminUserId ? "admin" : "system",
      adminUserId,
      actionTaken: "flagged",
      previousStatus: domain.moderationStatus,
      newStatus: severity === "critical" ? "suspended" : "flagged",
    });

    if (severity === "critical") {
      await managedDomainsRepository.update(domainId, {
        moderationStatus: "suspended",
        status: "suspended",
      });
    }

    logger.warn("[DomainModeration] Domain flagged", {
      domain: domain.domain,
      reason,
      severity,
    });

    return true;
  }

  async suspendDomain(
    domainId: string,
    reason: string,
    adminUserId: string
  ): Promise<boolean> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain) return false;

    await managedDomainsRepository.update(domainId, {
      status: "suspended",
      moderationStatus: "suspended",
    });

    await managedDomainsRepository.createEvent({
      domainId,
      eventType: "suspension",
      severity: "critical",
      description: reason,
      detectedBy: "admin",
      adminUserId,
      actionTaken: "suspended",
      previousStatus: domain.status,
      newStatus: "suspended",
    });

    logger.warn("[DomainModeration] Domain suspended", {
      domain: domain.domain,
      reason,
      adminUserId,
    });

    return true;
  }

  async reinstateDomain(
    domainId: string,
    notes: string,
    adminUserId: string
  ): Promise<boolean> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain) return false;

    await managedDomainsRepository.update(domainId, {
      status: "active",
      moderationStatus: "clean",
      moderationFlags: [],
    });

    await managedDomainsRepository.createEvent({
      domainId,
      eventType: "reinstatement",
      severity: "info",
      description: notes,
      detectedBy: "admin",
      adminUserId,
      actionTaken: "reinstated",
      previousStatus: "suspended",
      newStatus: "active",
    });

    logger.info("[DomainModeration] Domain reinstated", {
      domain: domain.domain,
      adminUserId,
    });

    return true;
  }

  getDomainsNeedingReview = () => managedDomainsRepository.listNeedingReview();
  getUnresolvedEvents = () => managedDomainsRepository.listUnresolvedEvents();
}

export const domainModerationService = new DomainModerationService();

