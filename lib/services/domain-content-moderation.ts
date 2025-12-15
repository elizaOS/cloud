/**
 * Domain Content Moderation Service
 * Heuristics → OpenAI Moderation → GPT-4o-mini fallback
 *
 * THRESHOLDS (based on OpenAI moderation API guidance):
 * - sexual/minors > 0.1: Very low threshold for CSAM (err on side of caution)
 * - self-harm/instructions > 0.5: Medium threshold (avoid false positives)
 * - violence/graphic > 0.7: Higher threshold (violence common in news/games)
 */

import { createHash } from "node:crypto";
import { db } from "@/db";
import { eq, desc } from "drizzle-orm";
import { userCharacters } from "@/db/schemas/user-characters";
import {
  managedDomainsRepository,
  type ManagedDomain,
  type DomainModerationFlag,
  type ContentScanCache,
  type SuspensionNotification,
} from "@/db/repositories/managed-domains";
import { logger } from "@/lib/utils/logger";
import { extractErrorMessage } from "@/lib/utils/error-handling";

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY;
const APPEAL_EMAIL =
  process.env.MODERATION_APPEAL_EMAIL || "appeals@eliza.cloud";

// Rate limiting: max 50 OpenAI calls per minute (their limit is 60)
const RATE_LIMIT = { calls: 0, resetAt: 0, max: 50, windowMs: 60000 };
function checkRateLimit(): boolean {
  const now = Date.now();
  if (now > RATE_LIMIT.resetAt) {
    RATE_LIMIT.calls = 0;
    RATE_LIMIT.resetAt = now + RATE_LIMIT.windowMs;
  }
  if (RATE_LIMIT.calls >= RATE_LIMIT.max) return false;
  RATE_LIMIT.calls++;
  return true;
}

type Severity = "none" | "low" | "medium" | "high" | "critical";
const SEV: Record<Severity, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// Patterns use possessive quantifiers where possible to prevent backtracking
// Limited repetition to prevent ReDoS attacks
const CSAM_PATTERNS = [
  /\b(child|kid|minor|underage|preteen|jailbait|loli|shota)\s{0,5}(porn|sex|nude|naked|xxx)/i,
  /\b(pedo|paedo|pedophile|paedophile)\b/i,
  /\bcp\b.{0,20}\b(download|share|trade)\b/i,
];

const ILLEGAL_PATTERNS = [
  /\b(buy|sell|order)\s{0,5}(drugs|cocaine|heroin|meth|fentanyl)\b/i,
  /\b(hitman|assassin|murder)\s{0,10}(for\s{0,3}hire|service)\b/i,
  /\b(credit\s{0,3}card|ssn|identity)\s{0,5}(dump|steal|fraud)\b/i,
  /\b(ransomware|malware|exploit)\s{0,5}(kit|service|as\s{0,3}a\s{0,3}service)\b/i,
  /\b(ddos|botnet)\s{0,5}(attack|service|rent)\b/i,
];

const SCAM_PATTERNS = [
  /\b(double|triple)\s{0,5}your\s{0,5}(bitcoin|crypto|money)\b/i,
  /\b(send|transfer)\s{0,5}\d{1,10}\s{0,5}(btc|eth|usdt).{0,30}\b(receive|get)\s{0,5}\d{1,10}\b/i,
  /\b(nigerian|prince|inheritance|lottery)\s{0,5}(scam|winner)\b/i,
  /\b(free|easy)\s{0,5}(money|bitcoin|crypto)\s{0,5}(no|zero)\s{0,5}(risk|investment)\b/i,
];

export interface DomainScanResult {
  status: "clean" | "flagged" | "needs_review" | "suspended";
  confidence: number;
  flags: DomainModerationFlag[];
  contentHash: string;
  aiUsed: boolean;
  aiModel?: string;
  toxicityScore?: number;
  reasoning?: string;
  cached: boolean;
}

interface ScanOptions {
  force?: boolean;
  skipAi?: boolean;
  deepScan?: boolean;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

function normalize(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function maxSev(flags: DomainModerationFlag[]): Severity {
  return flags.reduce<Severity>(
    (m, f) => (SEV[f.severity] > SEV[m] ? f.severity : m),
    "none",
  );
}

function toStatus(flags: DomainModerationFlag[]) {
  const s = maxSev(flags);
  if (s === "critical")
    return { status: "suspended" as const, modStatus: "suspended" as const };
  if (s === "high")
    return { status: "flagged" as const, modStatus: "flagged" as const };
  if (s === "medium")
    return {
      status: "needs_review" as const,
      modStatus: "pending_review" as const,
    };
  return { status: "clean" as const, modStatus: "clean" as const };
}

async function callOpenAI(
  text: string,
): Promise<{ scores: Record<string, number> } | { error: string }> {
  if (!OPENAI_API_KEY) return { error: "no_key" };
  if (!checkRateLimit()) {
    logger.warn("[Moderation] Rate limited, skipping OpenAI call");
    return { error: "rate_limited" };
  }

  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: text.slice(0, 32000),
    }),
  });

  if (!res.ok) {
    logger.error("[Moderation] OpenAI failed", { status: res.status });
    return { error: "api_failed" };
  }

  const data = await res.json();
  const scores = data.results?.[0]?.category_scores;
  if (!scores || typeof scores !== "object") return { error: "bad_response" };
  return { scores };
}

async function callGpt(
  text: string,
  ctx: string,
): Promise<
  | {
      classification: string;
      confidence: number;
      reasoning: string;
      categories: string[];
    }
  | { error: string }
> {
  if (!OPENAI_API_KEY) return { error: "no_key" };
  if (!checkRateLimit()) {
    logger.warn("[Moderation] Rate limited, skipping GPT call");
    return { error: "rate_limited" };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Classify this ${ctx}. CSAM=CRITICAL, illegal=HIGH, scams=MEDIUM. JSON: {"classification":"clean|suspicious|violation","confidence":0-1,"reasoning":"brief","categories":[]}\n\n${text.slice(0, 8000)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) return { error: "api_failed" };

  const content = (await res.json()).choices?.[0]?.message?.content;
  if (!content) return { error: "no_content" };

  try {
    const p = JSON.parse(content);
    if (!["clean", "suspicious", "violation"].includes(p.classification))
      return { error: "bad_classification" };
    return {
      classification: p.classification,
      confidence: p.confidence ?? 0.5,
      reasoning: p.reasoning ?? "",
      categories: p.categories ?? [],
    };
  } catch {
    return { error: "bad_json" };
  }
}

class DomainContentModerationService {
  shouldScan(
    domain: ManagedDomain,
    contentHash: string,
    opts: ScanOptions = {},
  ): boolean {
    if (opts.force || opts.deepScan || !domain.contentScanCache) return true;
    if (domain.contentHash !== contentHash) return true;
    if (domain.lastAiScanAt) {
      const stale = new Date();
      stale.setDate(stale.getDate() - 30);
      if (domain.lastAiScanAt < stale) return true;
    }
    return false;
  }

  async fetchDomainContent(
    domain: string,
  ): Promise<{ text: string; hash: string } | null> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(`https://${domain}`, {
        signal: ctrl.signal,
        headers: { "User-Agent": "ElizaCloud/1.0" },
      });
      clearTimeout(t);
      if (!res.ok) return null;
      const text = normalize(await res.text()).slice(0, 50000);
      return { text, hash: hash(text) };
    } catch (e) {
      clearTimeout(t);
      logger.debug("[Moderation] Fetch failed", {
        domain,
        error: extractErrorMessage(e),
      });
      return null;
    }
  }

  runHeuristics(text: string): {
    flags: DomainModerationFlag[];
    severity: Severity;
    needsAi: boolean;
  } {
    const now = new Date().toISOString();
    const flags: DomainModerationFlag[] = [];

    if (CSAM_PATTERNS.some((p) => p.test(text))) {
      flags.push({
        type: "csam",
        severity: "critical",
        reason: "CSAM pattern",
        detectedAt: now,
      });
      return { flags, severity: "critical", needsAi: false };
    }
    if (ILLEGAL_PATTERNS.some((p) => p.test(text))) {
      flags.push({
        type: "illegal",
        severity: "high",
        reason: "Illegal pattern",
        detectedAt: now,
      });
    }
    if (SCAM_PATTERNS.some((p) => p.test(text))) {
      flags.push({
        type: "content",
        severity: "medium",
        reason: "Scam pattern",
        detectedAt: now,
      });
    }

    const severity = maxSev(flags);
    return {
      flags,
      severity,
      needsAi: severity === "medium" || severity === "high",
    };
  }

  async runOpenAIModeration(text: string): Promise<{
    flags: DomainModerationFlag[];
    toxicityScore: number;
    aiUnavailable: boolean;
  }> {
    const r = await callOpenAI(text);
    if ("error" in r) {
      const now = new Date().toISOString();
      if (r.error === "no_key")
        return { flags: [], toxicityScore: 0, aiUnavailable: true };
      return {
        flags: [
          {
            type: "ai_flagged",
            severity: "medium",
            reason: `AI unavailable: ${r.error}`,
            detectedAt: now,
          },
        ],
        toxicityScore: -1,
        aiUnavailable: true,
      };
    }

    const now = new Date().toISOString();
    const flags: DomainModerationFlag[] = [];
    const s = r.scores;

    if (s["sexual/minors"] > 0.1)
      flags.push({
        type: "csam",
        severity: "critical",
        reason: "AI: CSAM",
        detectedAt: now,
        aiModel: "omni-moderation-latest",
        aiConfidence: s["sexual/minors"],
      });
    if (s["self-harm/instructions"] > 0.5)
      flags.push({
        type: "illegal",
        severity: "high",
        reason: "AI: self-harm",
        detectedAt: now,
        aiModel: "omni-moderation-latest",
        aiConfidence: s["self-harm/instructions"],
      });
    if (s["violence/graphic"] > 0.7)
      flags.push({
        type: "content",
        severity: "medium",
        reason: "AI: violence",
        detectedAt: now,
        aiModel: "omni-moderation-latest",
        aiConfidence: s["violence/graphic"],
      });

    return {
      flags,
      toxicityScore: Math.max(
        s["sexual/minors"] || 0,
        s["hate"] || 0,
        s["violence"] || 0,
        (s["self-harm"] || 0) * 0.8,
      ),
      aiUnavailable: false,
    };
  }

  async runDeepClassification(
    text: string,
    ctx: string,
  ): Promise<{
    flags: DomainModerationFlag[];
    confidence: number;
    reasoning: string;
    aiUnavailable: boolean;
  }> {
    const r = await callGpt(text, ctx);
    if ("error" in r) {
      const now = new Date().toISOString();
      if (r.error === "no_key")
        return {
          flags: [],
          confidence: 0,
          reasoning: "No API key",
          aiUnavailable: true,
        };
      return {
        flags: [
          {
            type: "ai_flagged",
            severity: "medium",
            reason: `GPT failed: ${r.error}`,
            detectedAt: now,
          },
        ],
        confidence: 0,
        reasoning: r.error,
        aiUnavailable: true,
      };
    }

    const now = new Date().toISOString();
    const flags: DomainModerationFlag[] = [];
    if (r.classification !== "clean") {
      for (const cat of r.categories) {
        const csam = /csam|child/i.test(cat);
        const sev: Severity =
          r.classification === "violation"
            ? csam
              ? "critical"
              : "high"
            : "medium";
        flags.push({
          type: csam ? "csam" : "ai_flagged",
          severity: sev,
          reason: `AI: ${cat}`,
          detectedAt: now,
          aiModel: "gpt-4o-mini",
          aiConfidence: r.confidence,
        });
      }
    }
    return {
      flags,
      confidence: r.confidence,
      reasoning: r.reasoning,
      aiUnavailable: false,
    };
  }

  private async scanContent(
    text: string,
    contentHash: string,
    opts: ScanOptions,
  ): Promise<Omit<DomainScanResult, "cached">> {
    const h = this.runHeuristics(text);
    let flags = [...h.flags];
    let aiModel: string | undefined;
    let toxicityScore: number | undefined;
    let confidence = 0.6;
    let reasoning: string | undefined;
    let aiUnavailable = false;

    if (maxSev(flags) === "critical") {
      return {
        status: "suspended",
        confidence: 0.95,
        flags,
        contentHash,
        aiUsed: false,
        reasoning: "Critical pattern",
      };
    }

    if (!opts.skipAi) {
      const ai = await this.runOpenAIModeration(text);
      flags = [...flags, ...ai.flags];
      toxicityScore = ai.toxicityScore >= 0 ? ai.toxicityScore : undefined;
      aiModel = ai.aiUnavailable ? undefined : "omni-moderation-latest";
      aiUnavailable = ai.aiUnavailable;

      if (
        !ai.aiUnavailable &&
        (h.needsAi || opts.deepScan) &&
        maxSev(flags) !== "critical"
      ) {
        const deep = await this.runDeepClassification(text, "content");
        flags = [...flags, ...deep.flags];
        confidence = Math.max(confidence, deep.confidence);
        reasoning = deep.reasoning;
        aiModel = deep.aiUnavailable ? aiModel : "gpt-4o-mini";
        aiUnavailable = aiUnavailable || deep.aiUnavailable;
      }
    }

    const { status } = toStatus(flags);
    if (aiUnavailable && status === "clean" && !opts.skipAi)
      reasoning = "AI unavailable";
    return {
      status,
      confidence,
      flags,
      contentHash,
      aiUsed: !opts.skipAi && !aiUnavailable,
      aiModel,
      toxicityScore,
      reasoning,
    };
  }

  async scanDomain(
    domainId: string,
    opts: ScanOptions = {},
  ): Promise<DomainScanResult> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain)
      return {
        status: "clean",
        confidence: 0,
        flags: [],
        contentHash: "",
        aiUsed: false,
        cached: false,
      };

    const content = await this.fetchDomainContent(domain.domain);
    if (!content)
      return {
        status: "clean",
        confidence: 0,
        flags: [],
        contentHash: "",
        aiUsed: false,
        cached: false,
        reasoning: "Fetch failed",
      };

    if (
      !this.shouldScan(domain, content.hash, opts) &&
      domain.contentScanCache
    ) {
      const c = domain.contentScanCache;
      return {
        status: c.result,
        confidence: c.confidence,
        flags: c.flags,
        contentHash: c.contentHash,
        aiUsed: !!c.model,
        aiModel: c.model,
        toxicityScore: c.toxicityScore,
        cached: true,
      };
    }

    const result = await this.scanContent(content.text, content.hash, opts);

    const cache: ContentScanCache = {
      contentHash: content.hash,
      scannedAt: new Date().toISOString(),
      result: result.status,
      confidence: result.confidence,
      model: result.aiModel,
      toxicityScore: result.toxicityScore,
      flags: result.flags,
    };
    await managedDomainsRepository.updateContentScan(
      domainId,
      content.hash,
      cache,
      result.aiUsed,
    );

    if (result.status !== "clean") {
      await managedDomainsRepository.updateModerationStatus(
        domainId,
        toStatus(result.flags).modStatus,
        result.flags,
      );
    }

    return { ...result, cached: false };
  }

  async suspendDomain(
    domainId: string,
    reason: string,
    flags: DomainModerationFlag[],
  ): Promise<boolean> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain) return false;

    await managedDomainsRepository.suspendDomain(domainId, reason, {
      notifiedAt: new Date().toISOString(),
      method: "both",
      reason,
      appealEmail: APPEAL_EMAIL,
    });

    await managedDomainsRepository.createEvent({
      domainId,
      eventType: "suspension",
      severity: "critical",
      description: reason,
      detectedBy: "automated_scan",
      actionTaken: "suspended",
      previousStatus: domain.status,
      newStatus: "suspended",
    });

    logger.warn("[Moderation] Suspended", { domain: domain.domain, reason });
    return true;
  }

  getDomainsNeedingScan = (hours = 24) =>
    managedDomainsRepository.listNeedingContentScan(hours);
  getDomainsNeedingAiScan = (days = 30) =>
    managedDomainsRepository.listNeedingAiScan(days);

  async sampleAgentResponses(agentId: string): Promise<DomainScanResult> {
    const agent = await db.query.userCharacters.findFirst({
      where: eq(userCharacters.id, agentId),
    });
    if (!agent)
      return {
        status: "clean",
        confidence: 0,
        flags: [],
        contentHash: "",
        aiUsed: false,
        cached: false,
        reasoning: "Agent not found",
      };

    const bio = Array.isArray(agent.bio) ? agent.bio.join("\n") : agent.bio;
    const parts = [
      `Agent: ${agent.name}`,
      agent.username && `Username: ${agent.username}`,
      `Bio: ${bio}`,
      agent.system && `System: ${agent.system}`,
      agent.post_examples?.length &&
        `Examples: ${agent.post_examples.join("\n")}`,
      agent.topics?.length && `Topics: ${agent.topics.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      ...(await this.scanContent(parts, hash(parts), {})),
      cached: false,
    };
  }

  async getPublicAgentsForModeration(limit = 100) {
    const agents = await db.query.userCharacters.findMany({
      where: eq(userCharacters.is_public, true),
      orderBy: [desc(userCharacters.interaction_count)],
      limit,
      columns: { id: true, name: true, organization_id: true, is_public: true },
    });
    return agents.map((a) => ({
      id: a.id,
      name: a.name,
      organizationId: a.organization_id,
      isPublic: a.is_public,
    }));
  }
}

export const domainContentModerationService =
  new DomainContentModerationService();
