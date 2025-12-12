/**
 * Link Safety Service
 *
 * Checks URLs against known threat databases and patterns.
 * Uses Google Safe Browsing API when available, with fallback to
 * local pattern matching for known scam/phishing domains.
 */

import { logger } from "@/lib/utils/logger";

// =============================================================================
// TYPES
// =============================================================================

export interface LinkSafetyResult {
  url: string;
  safe: boolean;
  threats: ThreatType[];
  source: "safe_browsing" | "local" | "unknown";
  confidence: number;
  domain: string;
}

export type ThreatType =
  | "malware"
  | "phishing"
  | "social_engineering"
  | "unwanted_software"
  | "scam"
  | "suspicious_domain"
  | "blocked_domain";

interface SafeBrowsingThreat {
  threatType: string;
  platformType: string;
  threat: { url: string };
  cacheDuration: string;
}

// =============================================================================
// KNOWN THREAT PATTERNS
// =============================================================================

// Known scam/phishing domains (partial list)
const KNOWN_THREAT_DOMAINS = new Set([
  // Fake Discord
  "discord-nitro-free.com",
  "discordgift.site",
  "discord-airdrop.com",
  "discordnitro.gift",
  "dlscord.com",
  "dlscord.gift",
  "discorcl.com",
  "discordc.com",
  
  // Fake Steam
  "steamcommunity.ru",
  "steampowered.ru",
  "steamcommunlty.com",
  "steamcomrnunity.com",
  
  // Crypto scams
  "claim-airdrop.xyz",
  "free-airdrop.io",
  "connect-wallet.xyz",
  "wallet-connect.io",
  "metamsk.io",
  "uniswap-airdrop.com",
  "opensee.io",
  
  // Generic phishing
  "login-verify.com",
  "account-secure.xyz",
  "verify-account.io",
]);

// Suspicious domain patterns (regex)
const SUSPICIOUS_PATTERNS = [
  // Typosquatting common services
  /disc[o0]rd(?!\.com|\.gg)/i,
  /telegr[a@]m(?!\.org|\.me)/i,
  /wh[a@]ts[a@]pp(?!\.com)/i,
  /metam[a@]sk(?!\.io)/i,
  /c[o0]inbase(?!\.com)/i,
  /opensee?(?!\.io)/i,
  
  // Scam indicators in domain
  /free.?nitro/i,
  /claim.?airdrop/i,
  /connect.?wallet/i,
  /verify.?account/i,
  /login.?secure/i,
  /-official\./i,
  /\.(xyz|tk|ml|ga|cf|gq)$/i, // High-abuse TLDs
];

// URL shorteners that hide destination
const URL_SHORTENERS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
]);

// =============================================================================
// SERVICE
// =============================================================================

class LinkSafetyService {
  private apiKey: string | undefined;
  private apiUrl = "https://safebrowsing.googleapis.com/v4/threatMatches:find";

  constructor() {
    this.apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
    if (!this.apiKey) {
      logger.warn("[LinkSafety] Google Safe Browsing API key not configured, using local patterns only");
    }
  }

  /**
   * Check a single URL for threats.
   */
  async checkUrl(url: string): Promise<LinkSafetyResult> {
    const domain = this.parseDomain(url);
    if (!domain) {
      return { url, safe: false, threats: ["phishing"], source: "local", confidence: 100, domain: url };
    }

    // Check local patterns first (faster)
    const localResult = this.checkLocalPatterns(url, domain);
    if (!localResult.safe) return localResult;

    // If Safe Browsing API is available, check with it
    if (this.apiKey) {
      const safeBrowsingResult = await this.checkSafeBrowsing(url, domain);
      if (!safeBrowsingResult.safe) return safeBrowsingResult;
    }

    return { url, safe: true, threats: [], source: this.apiKey ? "safe_browsing" : "local", confidence: this.apiKey ? 95 : 70, domain };
  }

  /**
   * Check multiple URLs in batch.
   */
  async checkUrls(urls: string[]): Promise<LinkSafetyResult[]> {
    const results: LinkSafetyResult[] = [];
    const urlsToCheck: string[] = [];

    for (const url of urls) {
      const domain = this.parseDomain(url);
      if (!domain) {
        results.push({ url, safe: false, threats: ["phishing"], source: "local", confidence: 100, domain: url });
        continue;
      }

      const localResult = this.checkLocalPatterns(url, domain);
      if (!localResult.safe) {
        results.push(localResult);
      } else {
        urlsToCheck.push(url);
      }
    }

    // Batch check remaining URLs with Safe Browsing if available
    if (this.apiKey && urlsToCheck.length > 0) {
      results.push(...await this.checkSafeBrowsingBatch(urlsToCheck));
    } else {
      for (const url of urlsToCheck) {
        results.push({ url, safe: true, threats: [], source: "local", confidence: 70, domain: this.parseDomain(url)! });
      }
    }

    return results;
  }

  private parseDomain(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  /**
   * Check if a URL is a known URL shortener.
   */
  isUrlShortener(url: string): boolean {
    try {
      const parsed = new URL(url);
      return URL_SHORTENERS.has(parsed.hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  /**
   * Extract all URLs from text content.
   */
  extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>)"']+/gi;
    return text.match(urlRegex) ?? [];
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private checkLocalPatterns(url: string, domain: string): LinkSafetyResult {
    const threats: ThreatType[] = [];

    // Check known threat domains
    if (KNOWN_THREAT_DOMAINS.has(domain)) {
      threats.push("scam");
    }

    // Check suspicious patterns
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(domain)) {
        threats.push("suspicious_domain");
        break;
      }
    }

    // Check for IP address URLs (often phishing)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) {
      threats.push("suspicious_domain");
    }

    // Check for excessive subdomains (often phishing)
    if (domain.split(".").length > 4) {
      threats.push("suspicious_domain");
    }

    // Check for URL shorteners
    if (URL_SHORTENERS.has(domain)) {
      // URL shorteners aren't unsafe by themselves, but we flag them
      return {
        url,
        safe: true,
        threats: [],
        source: "local",
        confidence: 50, // Lower confidence, can't see destination
        domain,
      };
    }

    if (threats.length > 0) {
      return {
        url,
        safe: false,
        threats: [...new Set(threats)],
        source: "local",
        confidence: 85,
        domain,
      };
    }

    return {
      url,
      safe: true,
      threats: [],
      source: "local",
      confidence: 70,
      domain,
    };
  }

  private async checkSafeBrowsing(url: string, domain: string): Promise<LinkSafetyResult> {
    if (!this.apiKey) {
      return { url, safe: true, threats: [], source: "local", confidence: 70, domain };
    }

    const [result] = await this.checkSafeBrowsingBatch([url]);
    return result ?? { url, safe: true, threats: [], source: "unknown", confidence: 50, domain };
  }

  private async checkSafeBrowsingBatch(urls: string[]): Promise<LinkSafetyResult[]> {
    if (!this.apiKey || urls.length === 0) {
      return [];
    }

    const requestBody = {
      client: {
        clientId: "eliza-cloud",
        clientVersion: "1.0.0",
      },
      threatInfo: {
        threatTypes: [
          "MALWARE",
          "SOCIAL_ENGINEERING",
          "UNWANTED_SOFTWARE",
          "POTENTIALLY_HARMFUL_APPLICATION",
        ],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: urls.map((url) => ({ url })),
      },
    };

    const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      logger.error("[LinkSafety] Safe Browsing API error", {
        status: response.status,
        statusText: response.statusText,
      });
      // Return uncertain results
      return urls.map((url) => {
        const parsed = new URL(url);
        return {
          url,
          safe: true,
          threats: [],
          source: "unknown" as const,
          confidence: 50,
          domain: parsed.hostname.toLowerCase(),
        };
      });
    }

    const data: { matches?: SafeBrowsingThreat[] } = await response.json();
    const threatsByUrl = new Map<string, ThreatType[]>();

    if (data.matches) {
      for (const match of data.matches) {
        const threats = threatsByUrl.get(match.threat.url) ?? [];
        threats.push(this.mapThreatType(match.threatType));
        threatsByUrl.set(match.threat.url, threats);
      }
    }

    return urls.map((url) => {
      const parsed = new URL(url);
      const domain = parsed.hostname.toLowerCase();
      const threats = threatsByUrl.get(url) ?? [];

      return {
        url,
        safe: threats.length === 0,
        threats,
        source: "safe_browsing" as const,
        confidence: 95,
        domain,
      };
    });
  }

  private mapThreatType(safeBrowsingType: string): ThreatType {
    switch (safeBrowsingType) {
      case "MALWARE":
        return "malware";
      case "SOCIAL_ENGINEERING":
        return "social_engineering";
      case "UNWANTED_SOFTWARE":
        return "unwanted_software";
      case "POTENTIALLY_HARMFUL_APPLICATION":
        return "malware";
      default:
        return "phishing";
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const linkSafetyService = new LinkSafetyService();

