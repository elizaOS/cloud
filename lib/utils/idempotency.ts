/**
 * Idempotency Utility for Webhook Handlers
 *
 * Provides in-memory deduplication to prevent replay attacks
 * within the signature validity window (5 minutes).
 */

const processedMessages = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a message has already been processed within the TTL window.
 * @param key - Unique identifier for the message (e.g., "blooio:message_id")
 * @returns true if the message was already processed, false otherwise
 */
export function isAlreadyProcessed(key: string): boolean {
  const timestamp = processedMessages.get(key);
  if (!timestamp) return false;

  // Check if the entry has expired
  if (Date.now() - timestamp > IDEMPOTENCY_TTL_MS) {
    processedMessages.delete(key);
    return false;
  }

  return true;
}

/**
 * Mark a message as processed and clean up old entries if needed.
 * @param key - Unique identifier for the message
 */
export function markAsProcessed(key: string): void {
  processedMessages.set(key, Date.now());

  // Cleanup old entries periodically to prevent memory leaks
  if (processedMessages.size > 10000) {
    const now = Date.now();
    for (const [k, v] of processedMessages) {
      if (now - v > IDEMPOTENCY_TTL_MS) {
        processedMessages.delete(k);
      }
    }
  }
}

/**
 * Get the current size of the processed messages cache.
 * Useful for monitoring and debugging.
 */
export function getProcessedMessagesCount(): number {
  return processedMessages.size;
}

/**
 * Clear all processed messages (mainly for testing purposes).
 */
export function clearProcessedMessages(): void {
  processedMessages.clear();
}
