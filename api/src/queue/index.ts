/**
 * Queue dispatcher — Worker `queue()` entry point.
 *
 * Dispatches each message in the batch by its `kind` discriminator. The
 * Worker's main entry (src/index.ts) re-exports `handleQueue` as the
 * `queue` field of the default export so Cloudflare invokes it for every
 * batch delivered from any consumer-bound queue.
 *
 * Currently only `stripe.event` messages are produced (by /api/stripe/
 * webhook). Adding a new producer means: add a variant to QueueMessage
 * in ./types, add a case here, and implement the handler beside
 * stripe-event.ts.
 */

import { processStripeEvent } from "./stripe-event";
import type { QueueMessage, StripeEventMessage } from "./types";

export async function handleQueue(batch: MessageBatch<QueueMessage>): Promise<void> {
  for (const message of batch.messages) {
    const kind = message.body.kind;
    switch (kind) {
      case "stripe.event":
        // Narrow the message body via the discriminated union; cast the
        // Message<> wrapper because TS does not narrow generic args.
        await processStripeEvent(message as Message<StripeEventMessage>);
        break;
      default: {
        // Unknown kind — retry so an in-flight rolling deploy delivering
        // a new variant isn't dropped; lands in DLQ after max_retries.
        const unknownKind: string = (message.body as { kind?: string }).kind ?? "<missing>";
        console.warn(`[queue] unknown message kind "${unknownKind}" — retrying`);
        message.retry({ delaySeconds: 30 });
      }
    }
  }
}
