/**
 * Pricing constants for Milady Cloud hosted agents (Docker-based).
 *
 * These agents run on dedicated Hetzner servers, not AWS ECS.
 * Pricing is hourly-based, billed via a daily cron.
 *
 * Running agents:  $0.02/hour  (~$14.40/month)
 * Idle/stopped:    $0.0025/hour (~$1.80/month — snapshot storage)
 *
 * All amounts in USD.
 */

export const MILADY_PRICING = {
  // ── Hourly rates ──────────────────────────────────────────────────
  /** Cost per hour for a running agent. */
  RUNNING_HOURLY_RATE: 0.02,
  /** Cost per hour for an idle/stopped agent (snapshot storage). */
  IDLE_HOURLY_RATE: 0.0025,

  // ── Derived daily rates (for display / logging) ───────────────────
  /** Daily cost for a running agent ($0.48/day). */
  get DAILY_RUNNING_COST(): number {
    return Math.round(this.RUNNING_HOURLY_RATE * 24 * 100) / 100;
  },
  /** Daily cost for an idle agent ($0.06/day). */
  get DAILY_IDLE_COST(): number {
    return Math.round(this.IDLE_HOURLY_RATE * 24 * 100) / 100;
  },

  // ── Thresholds ────────────────────────────────────────────────────
  /** Minimum credit balance required before provisioning an agent. */
  MINIMUM_DEPOSIT: 5.0,
  /** Warn user when balance drops below this. */
  LOW_CREDIT_WARNING: 2.0,
  /** Suspend agents when balance drops below this. */
  SUSPEND_THRESHOLD: 0.5,
  /** Hours between warning and forced shutdown. */
  GRACE_PERIOD_HOURS: 48,
} as const;
