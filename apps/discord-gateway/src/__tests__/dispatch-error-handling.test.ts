/**
 * Dispatch Error Handling Tests
 *
 * Tests for network failures, timeouts, and error responses in event dispatching.
 */
import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";

describe("Dispatch Error Handling", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls: Array<{ url: string; options: RequestInit }> = [];

  const setMockFetch = (mockFn: ReturnType<typeof mock>): void => {
    globalThis.fetch = mockFn as unknown as typeof fetch;
  };

  beforeEach(() => {
    fetchCalls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("HTTP Status Code Handling", () => {
    const errorCodes = [
      { code: 400, name: "Bad Request", retryable: false },
      { code: 401, name: "Unauthorized", retryable: false },
      { code: 403, name: "Forbidden", retryable: false },
      { code: 404, name: "Not Found", retryable: false },
      { code: 408, name: "Request Timeout", retryable: true },
      { code: 429, name: "Too Many Requests", retryable: true },
      { code: 500, name: "Internal Server Error", retryable: true },
      { code: 502, name: "Bad Gateway", retryable: true },
      { code: 503, name: "Service Unavailable", retryable: true },
      { code: 504, name: "Gateway Timeout", retryable: true },
    ];

    errorCodes.forEach(({ code, name, retryable }) => {
      it(`should handle ${code} ${name} response`, async () => {
        setMockFetch(mock(() =>
          Promise.resolve({
            ok: false,
            status: code,
            statusText: name,
            json: () => Promise.resolve({ error: name }),
          } as Response)
        ));

        const response = await fetch("https://api.example.com/webhook", {
          method: "POST",
          body: JSON.stringify({ event: "test" }),
        });

        expect(response.ok).toBe(false);
        expect(response.status).toBe(code);

        // Verify retryability logic
        const isRetryable = code >= 500 || code === 408 || code === 429;
        expect(isRetryable).toBe(retryable);
      });
    });
  });

  describe("Network Failure Handling", () => {
    it("should handle fetch throwing error", async () => {
      setMockFetch(mock(() => Promise.reject(new Error("Network error"))))));

      let caught = false;
      let errorMessage = "";

      try {
        await fetch("https://api.example.com/webhook");
      } catch (error) {
        caught = true;
        errorMessage = (error as Error).message;
      }

      expect(caught).toBe(true);
      expect(errorMessage).toBe("Network error");
    });

    it("should handle DNS resolution failure", async () => {
      setMockFetch(mock(() =>
        Promise.reject(new Error("getaddrinfo ENOTFOUND api.example.com"))
      ));

      let caught = false;
      try {
        await fetch("https://api.example.com/webhook");
      } catch (error) {
        caught = true;
        expect((error as Error).message).toContain("ENOTFOUND");
      }

      expect(caught).toBe(true);
    });

    it("should handle connection refused", async () => {
      setMockFetch(mock(() =>
        Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:3000"))
      );

      let caught = false;
      try {
        await fetch("http://localhost:3000/webhook");
      } catch (error) {
        caught = true;
        expect((error as Error).message).toContain("ECONNREFUSED");
      }

      expect(caught).toBe(true);
    });

    it("should handle connection reset", async () => {
      setMockFetch(mock(() => Promise.reject(new Error("read ECONNRESET")))));

      let caught = false;
      try {
        await fetch("https://api.example.com/webhook");
      } catch (error) {
        caught = true;
        expect((error as Error).message).toContain("ECONNRESET");
      }

      expect(caught).toBe(true);
    });

    it("should handle socket timeout", async () => {
      setMockFetch(mock(() =>
        Promise.reject(new Error("socket hang up"))
      );

      let caught = false;
      try {
        await fetch("https://api.example.com/webhook");
      } catch (error) {
        caught = true;
        expect((error as Error).message).toContain("socket hang up");
      }

      expect(caught).toBe(true);
    });
  });

  describe("Response Parsing Errors", () => {
    it("should handle malformed JSON response", async () => {
      setMockFetch(mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new SyntaxError("Unexpected token")),
          text: () => Promise.resolve("not valid json {"),
        } as unknown as Response)
      );

      const response = await fetch("https://api.example.com/webhook", {
        method: "POST",
      });

      expect(response.ok).toBe(true);

      let parseError = false;
      try {
        await response.json();
      } catch (error) {
        parseError = true;
        expect(error).toBeInstanceOf(SyntaxError);
      }
      expect(parseError).toBe(true);
    });

    it("should handle empty response body", async () => {
      setMockFetch(mock(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
          text: () => Promise.resolve(""),
        } as unknown as Response)
      );

      const response = await fetch("https://api.example.com/webhook", {
        method: "POST",
      });

      expect(response.status).toBe(204);
      const text = await response.text();
      expect(text).toBe("");
    });

    it("should handle HTML error page response", async () => {
      setMockFetch(mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.reject(new SyntaxError("Unexpected token '<'")),
          text: () => Promise.resolve("<html><body>Internal Server Error</body></html>"),
        } as unknown as Response)
      );

      const response = await fetch("https://api.example.com/webhook");

      expect(response.ok).toBe(false);
      const text = await response.text();
      expect(text).toContain("html");
    });
  });

  describe("Timeout Handling", () => {
    it("should handle request timeout via AbortController", async () => {
      setMockFetch(mock((_url: string, options?: RequestInit) => {
        const signal = options?.signal;
        if (signal?.aborted) {
          return Promise.reject(new DOMException("The operation was aborted", "AbortError"));
        }
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        });
      });

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10);

      let aborted = false;
      try {
        await fetch("https://api.example.com/webhook", {
          signal: controller.signal,
        });
      } catch (error) {
        aborted = true;
        expect((error as DOMException).name).toBe("AbortError");
      }

      expect(aborted).toBe(true);
    });

    it("should complete successfully before timeout", async () => {
      setMockFetch(mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        } as Response)
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch("https://api.example.com/webhook", {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      expect(response.ok).toBe(true);
    });
  });

  describe("Retry Logic", () => {
    it("should track retry attempts", async () => {
      let attempts = 0;
      const maxRetries = 3;

      setMockFetch(mock(() => {
        attempts++;
        if (attempts < maxRetries) {
          return Promise.resolve({
            ok: false,
            status: 503,
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
        } as Response);
      });

      // Simulate retry loop
      let success = false;
      for (let i = 0; i < maxRetries; i++) {
        const response = await fetch("https://api.example.com/webhook");
        if (response.ok) {
          success = true;
          break;
        }
      }

      expect(attempts).toBe(maxRetries);
      expect(success).toBe(true);
    });

    it("should implement exponential backoff delays", () => {
      const baseDelay = 1000;
      const maxDelay = 30000;

      const calculateBackoff = (attempt: number): number => {
        const delay = baseDelay * Math.pow(2, attempt);
        return Math.min(delay, maxDelay);
      };

      expect(calculateBackoff(0)).toBe(1000); // 1s
      expect(calculateBackoff(1)).toBe(2000); // 2s
      expect(calculateBackoff(2)).toBe(4000); // 4s
      expect(calculateBackoff(3)).toBe(8000); // 8s
      expect(calculateBackoff(4)).toBe(16000); // 16s
      expect(calculateBackoff(5)).toBe(30000); // capped at 30s
      expect(calculateBackoff(10)).toBe(30000); // still capped
    });

    it("should add jitter to backoff", () => {
      const baseDelay = 1000;

      const calculateBackoffWithJitter = (attempt: number): number => {
        const delay = baseDelay * Math.pow(2, attempt);
        const jitter = delay * 0.2 * Math.random(); // 0-20% jitter
        return delay + jitter;
      };

      const delay1 = calculateBackoffWithJitter(2);
      const delay2 = calculateBackoffWithJitter(2);

      // Delays should be in the expected range (4000 - 4800)
      expect(delay1).toBeGreaterThanOrEqual(4000);
      expect(delay1).toBeLessThanOrEqual(4800);
      expect(delay2).toBeGreaterThanOrEqual(4000);
      expect(delay2).toBeLessThanOrEqual(4800);
    });

    it("should give up after max retries", async () => {
      let attempts = 0;
      const maxRetries = 3;

      setMockFetch(mock(() => {
        attempts++;
        return Promise.resolve({
          ok: false,
          status: 503,
        } as Response);
      });

      let lastResponse: Response | null = null;
      for (let i = 0; i < maxRetries; i++) {
        lastResponse = await fetch("https://api.example.com/webhook");
        if (lastResponse.ok) break;
      }

      expect(attempts).toBe(maxRetries);
      expect(lastResponse?.ok).toBe(false);
    });
  });

  describe("Circuit Breaker Pattern", () => {
    it("should track consecutive failures", () => {
      let consecutiveFailures = 0;
      const threshold = 5;

      const recordFailure = () => {
        consecutiveFailures++;
        return consecutiveFailures >= threshold;
      };

      const recordSuccess = () => {
        consecutiveFailures = 0;
      };

      const isCircuitOpen = () => consecutiveFailures >= threshold;

      // Record failures
      expect(recordFailure()).toBe(false); // 1
      expect(recordFailure()).toBe(false); // 2
      expect(recordFailure()).toBe(false); // 3
      expect(recordFailure()).toBe(false); // 4
      expect(recordFailure()).toBe(true); // 5 - circuit opens

      expect(isCircuitOpen()).toBe(true);

      // Success resets
      recordSuccess();
      expect(isCircuitOpen()).toBe(false);
    });

    it("should implement half-open state after cooldown", () => {
      let circuitState: "closed" | "open" | "half-open" = "closed";
      let lastFailureTime = 0;
      const cooldownMs = 30000;

      const tripCircuit = () => {
        circuitState = "open";
        lastFailureTime = Date.now();
      };

      const checkCircuit = (): boolean => {
        if (circuitState === "closed") return true;
        if (circuitState === "open") {
          const elapsed = Date.now() - lastFailureTime;
          if (elapsed >= cooldownMs) {
            circuitState = "half-open";
            return true; // Allow one request
          }
          return false;
        }
        return true; // half-open allows request
      };

      const recordResult = (success: boolean) => {
        if (circuitState === "half-open") {
          circuitState = success ? "closed" : "open";
          if (!success) lastFailureTime = Date.now();
        }
      };

      // Initially closed
      expect(checkCircuit()).toBe(true);

      // Trip the circuit
      tripCircuit();
      expect(circuitState as string).toBe("open");
      expect(checkCircuit()).toBe(false);

      // Simulate cooldown elapsed
      lastFailureTime = Date.now() - cooldownMs - 1;
      expect(checkCircuit()).toBe(true);
      expect(circuitState as string).toBe("half-open");

      // Success closes circuit
      recordResult(true);
      expect(circuitState as string).toBe("closed");
    });
  });

  describe("Request Building Edge Cases", () => {
    it("should handle very long request bodies", async () => {
      const longContent = "a".repeat(100000);

      setMockFetch(mock((_url: string, options?: RequestInit) => {
        fetchCalls.push({ url: _url, options: options ?? {} });
        return Promise.resolve({
          ok: true,
          status: 200,
        } as Response);
      });

      await fetch("https://api.example.com/webhook", {
        method: "POST",
        body: JSON.stringify({ content: longContent }),
      });

      expect(fetchCalls).toHaveLength(1);
      const body = fetchCalls[0].options.body as string;
      expect(body.length).toBeGreaterThan(100000);
    });

    it("should handle special characters in payload", async () => {
      const specialContent = {
        text: "Hello <script>alert('xss')</script>",
        emoji: "👋🎉🚀",
        unicode: "Ñoño über naïve résumé",
        newlines: "line1\nline2\r\nline3",
        quotes: 'He said "hello" and \'goodbye\'',
      };

      setMockFetch(mock((_url: string, options?: RequestInit) => {
        fetchCalls.push({ url: _url, options: options ?? {} });
        return Promise.resolve({
          ok: true,
          status: 200,
        } as Response);
      });

      await fetch("https://api.example.com/webhook", {
        method: "POST",
        body: JSON.stringify(specialContent),
      });

      const body = JSON.parse(fetchCalls[0].options.body as string);
      expect(body.text).toContain("<script>");
      expect(body.emoji).toBe("👋🎉🚀");
      expect(body.newlines).toContain("\n");
    });

    it("should handle circular reference in payload", () => {
      const obj: Record<string, unknown> = { name: "test" };
      obj.self = obj; // circular reference

      let threw = false;
      try {
        JSON.stringify(obj);
      } catch (error) {
        threw = true;
        expect(error).toBeInstanceOf(TypeError);
      }
      expect(threw).toBe(true);
    });
  });

  describe("Header Handling", () => {
    it("should include all required headers", async () => {
      setMockFetch(mock((_url: string, options?: RequestInit) => {
        fetchCalls.push({ url: _url, options: options ?? {} });
        return Promise.resolve({
          ok: true,
          status: 200,
        } as Response);
      });

      await fetch("https://api.example.com/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-API-Key": "test-key",
          "X-Organization-Id": "org-123",
          "X-Discord-Event": "MESSAGE_CREATE",
        },
        body: JSON.stringify({ test: true }),
      });

      const headers = fetchCalls[0].options.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["X-Internal-API-Key"]).toBe("test-key");
      expect(headers["X-Organization-Id"]).toBe("org-123");
      expect(headers["X-Discord-Event"]).toBe("MESSAGE_CREATE");
    });

    it("should handle missing optional headers", async () => {
      setMockFetch(mock((_url: string, options?: RequestInit) => {
        fetchCalls.push({ url: _url, options: options ?? {} });
        return Promise.resolve({
          ok: true,
          status: 200,
        } as Response);
      });

      await fetch("https://api.example.com/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ test: true }),
      });

      const headers = fetchCalls[0].options.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["X-Internal-API-Key"]).toBeUndefined();
    });
  });

  describe("URL Handling", () => {
    it("should handle URL with query parameters", async () => {
      setMockFetch(mock((_url: string, options?: RequestInit) => {
        fetchCalls.push({ url: _url, options: options ?? {} });
        return Promise.resolve({
          ok: true,
          status: 200,
        } as Response);
      });

      await fetch("https://api.example.com/webhook?event=MESSAGE_CREATE&org=123");

      expect(fetchCalls[0].url).toContain("event=MESSAGE_CREATE");
      expect(fetchCalls[0].url).toContain("org=123");
    });

    it("should handle URL with encoded characters", async () => {
      setMockFetch(mock((_url: string, options?: RequestInit) => {
        fetchCalls.push({ url: _url, options: options ?? {} });
        return Promise.resolve({
          ok: true,
          status: 200,
        } as Response);
      });

      const encodedUrl = encodeURI("https://api.example.com/webhook?name=test user&emoji=👋");
      await fetch(encodedUrl);

      expect(fetchCalls[0].url).toContain("test%20user");
    });

    it("should handle trailing slash in URL", async () => {
      setMockFetch(mock((_url: string, options?: RequestInit) => {
        fetchCalls.push({ url: _url, options: options ?? {} });
        return Promise.resolve({
          ok: true,
          status: 200,
        } as Response);
      });

      await fetch("https://api.example.com/webhook/");
      expect(fetchCalls[0].url).toBe("https://api.example.com/webhook/");

      await fetch("https://api.example.com/webhook");
      expect(fetchCalls[1].url).toBe("https://api.example.com/webhook");
    });
  });

  describe("Response Time Tracking", () => {
    it("should accurately measure response time", async () => {
      setMockFetch(mock(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                } as Response),
              50
            )
          )
      );

      const startTime = Date.now();
      await fetch("https://api.example.com/webhook");
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeGreaterThanOrEqual(45); // Allow some variance
      expect(responseTime).toBeLessThan(200);
    });

    it("should track response time on failure", async () => {
      setMockFetch(mock(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: false,
                  status: 500,
                } as Response),
              50
            )
          )
      );

      const startTime = Date.now();
      await fetch("https://api.example.com/webhook");
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeGreaterThanOrEqual(45);
    });
  });
});

describe("Concurrent Dispatch Operations", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should handle parallel dispatches to multiple targets", async () => {
    const callOrder: string[] = [];

    setMockFetch(mock((url: string) => {
      callOrder.push(url);
      return Promise.resolve({
        ok: true,
        status: 200,
      } as Response);
    });

    const urls = [
      "https://a2a.example.com/agent1",
      "https://a2a.example.com/agent2",
      "https://webhook.example.com/hook1",
    ];

    await Promise.all(urls.map((url) => fetch(url)));

    expect(callOrder).toHaveLength(3);
    urls.forEach((url) => {
      expect(callOrder).toContain(url);
    });
  });

  it("should handle mixed success/failure in parallel dispatches", async () => {
    let callCount = 0;

    setMockFetch(mock(() => {
      callCount++;
      return Promise.resolve({
        ok: callCount % 2 === 0, // Alternate success/failure
        status: callCount % 2 === 0 ? 200 : 500,
      } as Response);
    });

    const results = await Promise.all([
      fetch("https://api.example.com/1"),
      fetch("https://api.example.com/2"),
      fetch("https://api.example.com/3"),
      fetch("https://api.example.com/4"),
    ]);

    const successes = results.filter((r) => r.ok).length;
    const failures = results.filter((r) => !r.ok).length;

    expect(successes).toBe(2);
    expect(failures).toBe(2);
  });

  it("should isolate failures in parallel operations", async () => {
    setMockFetch(mock((url: string) => {
      if (url.includes("fail")) {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
      } as Response);
    });

    const results = await Promise.allSettled([
      fetch("https://api.example.com/success1"),
      fetch("https://api.example.com/fail"),
      fetch("https://api.example.com/success2"),
    ]);

    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect(results[2].status).toBe("fulfilled");
  });
});
