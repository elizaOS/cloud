/**
 * Usage extraction for the OpenAI Responses API SSE stream.
 *
 * The `/v1/responses` native passthrough reserves credits up front at
 * `estimateRequestCost` and previously settled the reservation to the
 * reserved amount — regardless of what the model actually used. That
 * meant every request was charged at the (buffered) estimate, even when
 * the agent emitted far fewer output tokens than the cap.
 *
 * This module wraps the upstream ReadableStream with a pass-through
 * reader that also scans for the terminal `response.completed` SSE
 * event. When found, it extracts `response.usage.input_tokens` and
 * `response.usage.output_tokens` so the caller can reconcile the
 * reservation against the real cost.
 *
 * Design constraints:
 *
 * - Zero behavioral impact on the client: bytes are forwarded in the
 *   exact order and size the upstream produced them. We do not batch,
 *   buffer, or rewrite.
 * - SSE events are parsed out-of-band on the side. Parse errors are
 *   swallowed — a malformed event must never break the forward path.
 * - Exactly one terminal callback is guaranteed, regardless of whether
 *   the stream ended normally, errored, or was cancelled by the client
 *   (Codex CLI Ctrl-C, browser tab close, etc.). The callback receives
 *   the extracted usage if seen, or `null` if the stream ended before
 *   the `response.completed` event appeared.
 * - Streaming backpressure: we use the pull-based ReadableStream
 *   pattern so the upstream is only drained when the client reads,
 *   matching the semantics of a direct proxy.
 */

export interface ResponsesUsage {
  inputTokens: number;
  outputTokens: number;
  /** Cached tokens billed at a different rate, if the provider reports it. */
  cachedInputTokens?: number;
  /** Reasoning tokens (gpt-5.x reasoning models), if reported. */
  reasoningTokens?: number;
}

export type StreamTerminationReason = "end" | "cancel" | "error";

/**
 * Wrap an SSE ReadableStream so that we extract `response.completed`
 * usage into `onComplete` without affecting what the client reads.
 *
 * The returned stream is the one to hand to `new Response(body, ...)`.
 * The original upstream reader is owned by this wrapper; callers must
 * NOT read from `upstream` after passing it in.
 */
export function wrapWithUsageExtraction(
  upstream: ReadableStream<Uint8Array>,
  onComplete: (usage: ResponsesUsage | null, reason: StreamTerminationReason) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let buffer = "";
  let usage: ResponsesUsage | null = null;
  let completedSeen = false;
  let settled = false;
  const reader = upstream.getReader();

  const settle = (reason: StreamTerminationReason) => {
    if (settled) return;
    settled = true;
    try {
      onComplete(usage, reason);
    } catch {
      // A buggy reconciliation callback must not break the stream.
    }
  };

  const processBuffer = (): void => {
    if (completedSeen) return;
    // SSE frames are separated by a blank line (\n\n). The last chunk
    // of `buffer` may be an incomplete frame, so save it for the next
    // iteration.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const parsed = parseSseFrame(frame);
      if (!parsed) continue;
      if (
        parsed.type === "response.completed" &&
        parsed.response &&
        typeof parsed.response === "object"
      ) {
        const responseObj = parsed.response as Record<string, unknown>;
        const usageObj = responseObj.usage;
        if (usageObj && typeof usageObj === "object") {
          usage = extractUsage(usageObj as Record<string, unknown>);
          completedSeen = true;
          return;
        }
      }
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          // Flush any remaining bytes through the decoder in case the
          // terminal event landed in the final chunk without a trailing
          // blank line.
          if (!completedSeen && buffer.length > 0) {
            buffer += "\n\n"; // force the trailing frame to be processed
            processBuffer();
          }
          controller.close();
          settle("end");
          return;
        }
        controller.enqueue(value);
        if (!completedSeen) {
          buffer += decoder.decode(value, { stream: true });
          processBuffer();
        }
      } catch (err) {
        try {
          controller.error(err);
        } catch {
          // Controller may already be closed if pull races with cancel.
        }
        settle("error");
      }
    },
    async cancel(reason) {
      settle("cancel");
      try {
        await reader.cancel(reason);
      } catch {
        // Upstream cancel errors are non-actionable here.
      }
    },
  });
}

/**
 * Parse a single SSE frame (the block between two `\n\n` separators).
 *
 * An SSE frame can contain multiple fields (data:, event:, id:, retry:),
 * each on its own line. We only care about `data:` lines, which we
 * concatenate with newlines before JSON-parsing. `data: [DONE]` is an
 * OpenAI stream sentinel and is ignored.
 */
function parseSseFrame(frame: string): Record<string, unknown> | null {
  if (!frame.trim()) return null;
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) {
      // Strip one space after the colon if present, but keep the rest
      // of the line as-is — whitespace inside data matters for JSON.
      dataLines.push(line.slice(line.startsWith("data: ") ? 6 : 5));
    }
  }
  if (dataLines.length === 0) return null;
  const payload = dataLines.join("\n").trim();
  if (payload.length === 0 || payload === "[DONE]") return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Pull token counts out of a `response.usage` object. The shape we care
 * about is the one OpenAI's Responses API documents:
 *
 *   {
 *     "input_tokens": 42,
 *     "input_tokens_details": { "cached_tokens": 0 },
 *     "output_tokens": 128,
 *     "output_tokens_details": { "reasoning_tokens": 64 },
 *     "total_tokens": 170
 *   }
 *
 * We default missing fields to 0 rather than refusing to reconcile, so
 * a provider that omits nested details still gets its headline counts
 * billed correctly.
 */
function extractUsage(usageObj: Record<string, unknown>): ResponsesUsage {
  const inputTokens = numberOr(usageObj.input_tokens, 0);
  const outputTokens = numberOr(usageObj.output_tokens, 0);
  const inputDetails = usageObj.input_tokens_details as Record<string, unknown> | undefined;
  const outputDetails = usageObj.output_tokens_details as Record<string, unknown> | undefined;
  const cachedInputTokens =
    inputDetails && typeof inputDetails === "object" ? numberOr(inputDetails.cached_tokens, 0) : 0;
  const reasoningTokens =
    outputDetails && typeof outputDetails === "object"
      ? numberOr(outputDetails.reasoning_tokens, 0)
      : 0;

  const result: ResponsesUsage = { inputTokens, outputTokens };
  if (cachedInputTokens > 0) result.cachedInputTokens = cachedInputTokens;
  if (reasoningTokens > 0) result.reasoningTokens = reasoningTokens;
  return result;
}

function numberOr(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}
