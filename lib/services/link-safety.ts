/**
 * Link Safety Service - checks URLs for threats using local patterns and Google Safe Browsing.
 */

import { logger } from "@/lib/utils/logger";
import { parseDomain } from "./community-moderation";

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
  threat: { url: string };
}

const KNOWN_THREAT_DOMAINS = new Set([
  "discord-nitro-free.com", "discordgift.site", "discord-airdrop.com", "discordnitro.gift",
  "dlscord.com", "dlscord.gift", "discorcl.com", "discordc.com",
  "steamcommunity.ru", "steampowered.ru", "steamcommunlty.com", "steamcomrnunity.com",
  "claim-airdrop.xyz", "free-airdrop.io", "connect-wallet.xyz", "wallet-connect.io",
  "metamsk.io", "uniswap-airdrop.com", "opensee.io",
  "login-verify.com", "account-secure.xyz", "verify-account.io",
]);

const SUSPICIOUS_PATTERNS = [
  /disc[o0]rd(?!\.com|\.gg)/i, /telegr[a@]m(?!\.org|\.me)/i, /wh[a@]ts[a@]pp(?!\.com)/i,
  /metam[a@]sk(?!\.io)/i, /c[o0]inbase(?!\.com)/i, /opensee?(?!\.io)/i,
  /free.?nitro/i, /claim.?airdrop/i, /connect.?wallet/i, /verify.?account/i,
  /login.?secure/i, /-official\./i, /\.(xyz|tk|ml|ga|cf|gq)$/i,
];

const URL_SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly",
]);

class LinkSafetyService {
  private apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  private apiUrl = "https://safebrowsing.googleapis.com/v4/threatMatches:find";

  constructor() {
    if (!this.apiKey) {
      logger.warn("[LinkSafety] Google Safe Browsing API key not configured, using local patterns only");
    }
  }

  async checkUrl(url: string): Promise<LinkSafetyResult> {
    const domain = parseDomain(url);
    if (!domain) {
      return { url, safe: false, threats: ["phishing"], source: "local", confidence: 100, domain: url };
    }

    const localResult = this.checkLocalPatterns(url, domain);
    if (!localResult.safe) return localResult;

    if (this.apiKey) {
      const safeBrowsingResult = await this.checkSafeBrowsing(url, domain);
      if (!safeBrowsingResult.safe) return safeBrowsingResult;
    }

    return { url, safe: true, threats: [], source: this.apiKey ? "safe_browsing" : "local", confidence: this.apiKey ? 95 : 70, domain };
  }

  async checkUrls(urls: string[]): Promise<LinkSafetyResult[]> {
    const results: LinkSafetyResult[] = [];
    const urlsToCheck: string[] = [];

    for (const url of urls) {
      const domain = parseDomain(url);
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

    if (this.apiKey && urlsToCheck.length > 0) {
      results.push(...await this.checkSafeBrowsingBatch(urlsToCheck));
    } else {
      for (const url of urlsToCheck) {
        results.push({ url, safe: true, threats: [], source: "local", confidence: 70, domain: this.parseDomain(url)! });
      }
    }

    return results;
  }

  isUrlShortener(url: string): boolean {
    const domain = parseDomain(url);
    return domain ? URL_SHORTENERS.has(domain) : false;
  }

  extractUrls(text: string): string[] {
    return text.match(/https?:\/\/[^\s<>)"']+/gi) ?? [];
  }

  private checkLocalPatterns(url: string, domain: string): LinkSafetyResult {
    const threats: ThreatType[] = [];

    if (KNOWN_THREAT_DOMAINS.has(domain)) threats.push("scam");
    if (SUSPICIOUS_PATTERNS.some((p) => p.test(domain))) threats.push("suspicious_domain");
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) threats.push("suspicious_domain");
    if (domain.split(".").length > 4) threats.push("suspicious_domain");

    if (URL_SHORTENERS.has(domain)) {
      return { url, safe: true, threats: [], source: "local", confidence: 50, domain };
    }

    if (threats.length > 0) {
      return { url, safe: false, threats: [...new Set(threats)], source: "local", confidence: 85, domain };
    }

    return { url, safe: true, threats: [], source: "local", confidence: 70, domain };
  }

  private async checkSafeBrowsing(url: string, domain: string): Promise<LinkSafetyResult> {
    if (!this.apiKey) {
      return { url, safe: true, threats: [], source: "local", confidence: 70, domain };
    }
    const [result] = await this.checkSafeBrowsingBatch([url]);
    return result ?? { url, safe: true, threats: [], source: "unknown", confidence: 50, domain };
  }

  private async checkSafeBrowsingBatch(urls: string[]): Promise<LinkSafetyResult[]> {
    if (!this.apiKey || urls.length === 0) return [];

    const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: { clientId: "eliza-cloud", clientVersion: "1.0.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: urls.map((url) => ({ url })),
        },
      }),
    });

    if (!response.ok) {
      logger.error("[LinkSafety] Safe Browsing API error", { status: response.status });
      return urls.map((url) => ({
        url, safe: true, threats: [], source: "unknown" as const, confidence: 50, domain: this.parseDomain(url)!,
      }));
    }

    const data: { matches?: SafeBrowsingThreat[] } = await response.json();
    const threatsByUrl = new Map<string, ThreatType[]>();

    for (const match of data.matches ?? []) {
      const threats = threatsByUrl.get(match.threat.url) ?? [];
      threats.push(this.mapThreatType(match.threatType));
      threatsByUrl.set(match.threat.url, threats);
    }

    return urls.map((url) => {
      const domain = this.parseDomain(url)!;
      const threats = threatsByUrl.get(url) ?? [];
      return { url, safe: threats.length === 0, threats, source: "safe_browsing" as const, confidence: 95, domain };
    });
  }

  private mapThreatType(type: string): ThreatType {
    const map: Record<string, ThreatType> = {
      MALWARE: "malware",
      SOCIAL_ENGINEERING: "social_engineering",
      UNWANTED_SOFTWARE: "unwanted_software",
      POTENTIALLY_HARMFUL_APPLICATION: "malware",
    };
    return map[type] ?? "phishing";
  }
}

export const linkSafetyService = new LinkSafetyService();
