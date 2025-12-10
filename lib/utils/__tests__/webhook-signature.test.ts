/**
 * Tests for Webhook Signature Utilities
 */

import { describe, it, expect } from "vitest";
import {
  verifyWebhookSignature,
  generateWebhookSignature,
  generateWebhookSecret,
  createSignatureHeaders,
} from "../webhook-signature";

describe("webhook-signature", () => {
  const testPayload = JSON.stringify({ event: "test", data: { foo: "bar" } });
  const testSecret = generateWebhookSecret();

  describe("generateWebhookSecret", () => {
    it("should generate a 64-character hex string", () => {
      const secret = generateWebhookSecret();
      expect(secret).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should generate unique secrets", () => {
      const secrets = new Set(Array.from({ length: 100 }, () => generateWebhookSecret()));
      expect(secrets.size).toBe(100);
    });
  });

  describe("generateWebhookSignature", () => {
    it("should generate a signature in the correct format", () => {
      const signature = generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
      });
      
      expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    });

    it("should use provided timestamp", () => {
      const timestamp = 1700000000;
      const signature = generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
        timestamp,
      });
      
      expect(signature).toContain(`t=${timestamp}`);
    });

    it("should produce different signatures for different payloads", () => {
      const sig1 = generateWebhookSignature({ payload: "payload1", secret: testSecret });
      const sig2 = generateWebhookSignature({ payload: "payload2", secret: testSecret });
      
      expect(sig1).not.toBe(sig2);
    });

    it("should produce different signatures for different secrets", () => {
      const sig1 = generateWebhookSignature({ payload: testPayload, secret: "secret1" });
      const sig2 = generateWebhookSignature({ payload: testPayload, secret: "secret2" });
      
      expect(sig1).not.toBe(sig2);
    });
  });

  describe("verifyWebhookSignature", () => {
    it("should verify a valid signature", () => {
      const signature = generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
      });

      const result = verifyWebhookSignature({
        payload: testPayload,
        signature,
        secret: testSecret,
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject an invalid signature", () => {
      const signature = generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
      });

      const result = verifyWebhookSignature({
        payload: testPayload,
        signature,
        secret: "wrong-secret",
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid signature");
    });

    it("should reject a tampered payload", () => {
      const signature = generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
      });

      const result = verifyWebhookSignature({
        payload: testPayload + "tampered",
        signature,
        secret: testSecret,
      });

      expect(result.valid).toBe(false);
    });

    it("should reject an expired signature", () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const signature = generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
        timestamp: oldTimestamp,
      });

      const result = verifyWebhookSignature({
        payload: testPayload,
        signature,
        secret: testSecret,
        config: { timestampTolerance: 300 }, // 5 minutes
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("expired");
    });

    it("should accept a signature within tolerance", () => {
      const recentTimestamp = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
      const signature = generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
        timestamp: recentTimestamp,
      });

      const result = verifyWebhookSignature({
        payload: testPayload,
        signature,
        secret: testSecret,
        config: { timestampTolerance: 300 }, // 5 minutes
      });

      expect(result.valid).toBe(true);
    });

    it("should return error for missing signature", () => {
      const result = verifyWebhookSignature({
        payload: testPayload,
        signature: "",
        secret: testSecret,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing signature");
    });

    it("should return error for malformed signature", () => {
      const result = verifyWebhookSignature({
        payload: testPayload,
        signature: "invalid-signature",
        secret: testSecret,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing timestamp in signature");
    });
  });

  describe("createSignatureHeaders", () => {
    it("should create headers with signature", () => {
      const headers = createSignatureHeaders(testPayload, testSecret);
      
      expect(headers).toHaveProperty("x-webhook-signature");
      expect(headers).toHaveProperty("Content-Type", "application/json");
      expect(headers["x-webhook-signature"]).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    });

    it("should use custom header name", () => {
      const headers = createSignatureHeaders(testPayload, testSecret, {
        signatureHeader: "x-custom-signature",
      });
      
      expect(headers).toHaveProperty("x-custom-signature");
      expect(headers).not.toHaveProperty("x-webhook-signature");
    });
  });
});

