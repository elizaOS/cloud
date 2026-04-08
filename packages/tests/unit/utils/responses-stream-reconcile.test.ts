/**
 * Unit tests for `wrapWithUsageExtraction`.
 *
 * The wrapper must:
 *   - Forward all bytes to the client in the exact order and size the
 *     upstream produced them (no batching, rewriting, buffering)
 *   - Extract `response.usage` from the terminal `response.completed`
 *     SSE event when present
 *   - Guarantee exactly one terminal callback per stream lifecycle
 *     (end | cancel | error)
 *   - Swallow parse errors — malformed frames must never break the
 *     forward path
 *   - Handle SSE frames that span chunk boundaries
 */

import { describe, expect, mock, test } from "bun:test";
import {
  type ResponsesUsage,
  type StreamTerminationReason,
  wrapWithUsageExtraction,
} from "@/lib/utils/responses-stream-reconcile";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const encode = (s: string): Uint8Array => encoder.encode(s);

/**
 * Build a ReadableStream<Uint8Array> from a sequence of string chunks.
 * Each string becomes one enqueue call, so chunking is explicit and
 * deterministic.
 */
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encode(chunks[index++]));
    },
  });
}

/** Drain a readable stream into a single string. */
async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

/** The terminal OpenAI Responses SSE event, stringified as an SSE frame. */
const COMPLETED_FRAME = (usage: Record<string, unknown>): string =>
  `event: response.completed\ndata: ${JSON.stringify({
    type: "response.completed",
    response: {
      id: "resp_abc",
      status: "completed",
      usage,
    },
  })}\n\n`;

// ---------------------------------------------------------------------------
// Passthrough fidelity
// ---------------------------------------------------------------------------

describe("wrapWithUsageExtraction — passthrough fidelity", () => {
  test("forwards bytes unchanged across multiple chunks", async () => {
    const chunks = [
      'data: {"type":"response.output_text.delta","delta":"Hello "}\n\n',
      'data: {"type":"response.output_text.delta","delta":"world"}\n\n',
      COMPLETED_FRAME({ input_tokens: 10, output_tokens: 20 }),
    ];
    const onComplete = mock();
    const wrapped = wrapWithUsageExtraction(streamFromChunks(chunks), onComplete);

    const output = await drain(wrapped);

    expect(output).toBe(chunks.join(""));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("handles SSE frames that span chunk boundaries", async () => {
    // The `response.completed` frame is split mid-JSON so the parser
    // has to accumulate across two reads.
    const fullFrame = COMPLETED_FRAME({ input_tokens: 7, output_tokens: 42 });
    const mid = Math.floor(fullFrame.length / 2);
    const chunks = [fullFrame.slice(0, mid), fullFrame.slice(mid)];

    const onComplete = mock();
    const wrapped = wrapWithUsageExtraction(streamFromChunks(chunks), onComplete);
    const output = await drain(wrapped);

    expect(output).toBe(chunks.join(""));
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [usage, reason] = onComplete.mock.calls[0];
    expect(reason).toBe("end");
    expect(usage).toEqual({ inputTokens: 7, outputTokens: 42 });
  });

  test("handles the [DONE] sentinel without crashing", async () => {
    const chunks = [COMPLETED_FRAME({ input_tokens: 3, output_tokens: 5 }), "data: [DONE]\n\n"];
    const onComplete = mock();
    const wrapped = wrapWithUsageExtraction(streamFromChunks(chunks), onComplete);
    const output = await drain(wrapped);

    expect(output).toBe(chunks.join(""));
    const [usage] = onComplete.mock.calls[0];
    expect(usage).toEqual({ inputTokens: 3, outputTokens: 5 });
  });

  test("malformed JSON in a data: line does not break the forward path", async () => {
    const chunks = [
      "data: not-json-at-all\n\n",
      "data: {broken\n\n",
      COMPLETED_FRAME({ input_tokens: 1, output_tokens: 2 }),
    ];
    const onComplete = mock();
    const wrapped = wrapWithUsageExtraction(streamFromChunks(chunks), onComplete);
    const output = await drain(wrapped);

    expect(output).toBe(chunks.join(""));
    const [usage] = onComplete.mock.calls[0];
    expect(usage).toEqual({ inputTokens: 1, outputTokens: 2 });
  });
});

// ---------------------------------------------------------------------------
// Usage extraction
// ---------------------------------------------------------------------------

describe("wrapWithUsageExtraction — usage extraction", () => {
  test("extracts input_tokens / output_tokens from response.completed", async () => {
    const chunks = [COMPLETED_FRAME({ input_tokens: 128, output_tokens: 512 })];
    const onComplete = mock<(u: ResponsesUsage | null, r: StreamTerminationReason) => void>();
    const wrapped = wrapWithUsageExtraction(streamFromChunks(chunks), onComplete);
    await drain(wrapped);

    expect(onComplete).toHaveBeenCalledTimes(1);
    const [usage, reason] = onComplete.mock.calls[0];
    expect(usage).toEqual({ inputTokens: 128, outputTokens: 512 });
    expect(reason).toBe("end");
  });

  test("extracts cached_tokens and reasoning_tokens when present", async () => {
    const chunks = [
      COMPLETED_FRAME({
        input_tokens: 1000,
        input_tokens_details: { cached_tokens: 400 },
        output_tokens: 600,
        output_tokens_details: { reasoning_tokens: 200 },
      }),
    ];
    const onComplete = mock();
    const wrapped = wrapWithUsageExtraction(streamFromChunks(chunks), onComplete);
    await drain(wrapped);

    const [usage] = onComplete.mock.calls[0];
    expect(usage).toEqual({
      inputTokens: 1000,
      outputTokens: 600,
      cachedInputTokens: 400,
      reasoningTokens: 200,
    });
  });

  test("omits cached/reasoning fields when zero or missing", async () => {
    const chunks = [
      COMPLETED_FRAME({
        input_tokens: 10,
        output_tokens: 20,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      }),
    ];
    const onComplete = mock();
    const wrapped = wrapWithUsageExtraction(streamFromChunks(chunks), onComplete);
    await drain(wrapped);

    const [usage] = onComplete.mock.calls[0];
    expect(usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(usage).not.toHaveProperty("cachedInputTokens");
    expect(usage).not.toHaveProperty("reasoningTokens");
  });

  test("returns null when no response.completed event arrives", async () => {
    const chunks = ['data: {"type":"response.output_text.delta","delta":"partial"}\n\n'];
    const onComplete = mock();
    const wrapped = wrapWithUsageExtraction(streamFromChunks(chunks), onComplete);
    await drain(wrapped);

    const [usage, reason] = onComplete.mock.calls[0];
    expect(usage).toBeNull();
    expect(reason).toBe("end");
  });

  test("defaults missing input_tokens / output_tokens to 0 rather than rejecting", async () => {
    // A provider that reports response.completed but omits numeric
    // fields should still produce a usage object — a billing event
    // with zeros is better than a lost reconciliation.
    const chunks = [COMPLETED_FRAME({})];
    const onComplete = mock();
    const wrapped = wrapWithUsageExtraction(streamFromChunks(chunks), onComplete);
    await drain(wrapped);

    const [usage] = onComplete.mock.calls[0];
    expect(usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

// ---------------------------------------------------------------------------
// Termination paths
// ---------------------------------------------------------------------------

describe("wrapWithUsageExtraction — termination", () => {
  test("fires onComplete exactly once on normal close", async () => {
    const chunks = [COMPLETED_FRAME({ input_tokens: 1, output_tokens: 1 })];
    const onComplete = mock();
    const wrapped = wrapWithUsageExtraction(streamFromChunks(chunks), onComplete);
    await drain(wrapped);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("fires onComplete with 'cancel' when the reader is cancelled mid-stream", async () => {
    // Build a stream that never ends — we'll cancel it after reading
    // one chunk so the wrapper observes the cancel path.
    const chunks = [
      'data: {"type":"response.output_text.delta","delta":"hi"}\n\n',
      'data: {"type":"response.output_text.delta","delta":"more"}\n\n',
    ];
    let pullCount = 0;
    const upstream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pullCount < chunks.length) {
          controller.enqueue(encode(chunks[pullCount++]));
        }
        // Never close — simulate a long-running stream.
      },
    });

    const onComplete = mock();
    const wrapped = wrapWithUsageExtraction(upstream, onComplete);
    const reader = wrapped.getReader();
    await reader.read(); // consume first chunk
    await reader.cancel("user abort");

    expect(onComplete).toHaveBeenCalledTimes(1);
    const [usage, reason] = onComplete.mock.calls[0];
    expect(reason).toBe("cancel");
    expect(usage).toBeNull(); // no response.completed seen before cancel
  });

  test("still extracts usage when cancel fires AFTER response.completed", async () => {
    // Edge case: the terminal frame arrived, we parsed usage, then the
    // client cancelled (e.g. because the model finished and the client
    // tore down the stream at the same moment). We should still report
    // the usage we have, so the reservation reconciles correctly.
    const chunks = [COMPLETED_FRAME({ input_tokens: 9, output_tokens: 11 })];
    let pullCount = 0;
    const upstream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pullCount < chunks.length) {
          controller.enqueue(encode(chunks[pullCount++]));
          return;
        }
        // Stall — force the client to cancel.
      },
    });

    const onComplete = mock();
    const wrapped = wrapWithUsageExtraction(upstream, onComplete);
    const reader = wrapped.getReader();
    await reader.read(); // parses the completed frame
    await reader.cancel();

    expect(onComplete).toHaveBeenCalledTimes(1);
    const [usage, reason] = onComplete.mock.calls[0];
    expect(reason).toBe("cancel");
    expect(usage).toEqual({ inputTokens: 9, outputTokens: 11 });
  });

  test("fires onComplete with 'error' when the upstream throws", async () => {
    const upstream = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("upstream boom");
      },
    });

    const onComplete = mock();
    const wrapped = wrapWithUsageExtraction(upstream, onComplete);
    const reader = wrapped.getReader();
    await expect(reader.read()).rejects.toBeTruthy();

    expect(onComplete).toHaveBeenCalledTimes(1);
    const [usage, reason] = onComplete.mock.calls[0];
    expect(reason).toBe("error");
    expect(usage).toBeNull();
  });

  test("a throwing onComplete callback does not break the stream", async () => {
    const chunks = [COMPLETED_FRAME({ input_tokens: 1, output_tokens: 1 })];
    const onComplete = mock(() => {
      throw new Error("buggy reconciliation");
    });
    const wrapped = wrapWithUsageExtraction(streamFromChunks(chunks), onComplete);

    // Should still drain cleanly — callback errors are swallowed.
    const output = await drain(wrapped);
    expect(output).toBe(chunks.join(""));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
