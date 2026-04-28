/**
 * Queue message schemas for the Worker's queue() consumer.
 *
 * Currently the only producer is /api/stripe/webhook, which verifies the
 * signature, dedupes by Stripe event ID, then enqueues a `stripe.event`
 * message. The queue() consumer (src/queue/index.ts) dispatches by `kind`
 * so additional producers can be added later without changing the entry.
 */

import type Stripe from "stripe";

/**
 * Verified Stripe event handed off from the webhook route to the consumer.
 *
 * `eventId` is the Stripe `evt_*` ID (used by the webhook for primary
 * dedup via webhook_events). `paymentIntentId` is included when present
 * so per-row idempotency checks in the consumer can short-circuit on
 * retries without re-querying Stripe.
 */
export type StripeEventMessage = {
  kind: "stripe.event";
  eventId: string;
  eventType: string;
  /** The full verified Stripe.Event payload — same shape Stripe sends. */
  event: Stripe.Event;
  /** Best-effort extracted from the event for dedup; may be absent. */
  paymentIntentId?: string;
  /** Worker receive timestamp (ms epoch). For latency observability. */
  receivedAt: number;
};

/**
 * Discriminated union of all message bodies consumed by queue().
 * Add new variants here when wiring new producers.
 */
export type QueueMessage = StripeEventMessage;
