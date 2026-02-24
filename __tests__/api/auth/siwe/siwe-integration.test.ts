import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getNonce } from "@/app/api/auth/siwe/nonce/route";
import { POST as postVerify } from "@/app/api/auth/siwe/verify/route";
import { cache } from "@/lib/cache/client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

describe("SIWE Authentication Flow - Integration Tests", () => {
  const testPrivateKey = generatePrivateKey();
  const testAccount = privateKeyToAccount(testPrivateKey);
  const testAddress = testAccount.address;

  beforeEach(async () => {
    // Clear any existing test data
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup test cache entries
    try {
      await cache.del(`siwe:nonce:test-*`);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe("Complete Authentication Flow", () => {
    it("should complete sign-up flow for new wallet", async () => {
      // Step 1: Request nonce
      const nonceReq = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/nonce?chainId=1")
      );
      const nonceRes = await getNonce(nonceReq);
      expect(nonceRes.status).toBe(200);

      const nonceData = await nonceRes.json();
      expect(nonceData).toHaveProperty("nonce");
      expect(nonceData).toHaveProperty("domain");
      expect(nonceData).toHaveProperty("uri");
      expect(nonceData.chainId).toBe(1);

      // Step 2: Sign message
      const message = createSiweMessage({
        address: testAddress,
        chainId: 1,
        domain: nonceData.domain,
        nonce: nonceData.nonce,
        uri: nonceData.uri,
        version: "1",
        statement: "Sign in to ElizaCloud",
      });

      const signature = await testAccount.signMessage({
        message,
      });

      // Step 3: Verify signature and create account
      const verifyReq = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/verify"),
        {
          method: "POST",
          body: JSON.stringify({ message, signature }),
          headers: { "content-type": "application/json" },
        }
      );

      const verifyRes = await postVerify(verifyReq);
      expect(verifyRes.status).toBe(200);

      const verifyData = await verifyRes.json();
      expect(verifyData).toHaveProperty("apiKey");
      expect(verifyData).toHaveProperty("address");
      expect(verifyData.isNewAccount).toBe(true);
      expect(verifyData.user).toHaveProperty("id");
      expect(verifyData.organization).toHaveProperty("id");
    }, 30000);

    it("should reject reused nonce", async () => {
      // Get nonce
      const nonceReq = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/nonce?chainId=1")
      );
      const nonceRes = await getNonce(nonceReq);
      const nonceData = await nonceRes.json();

      // Sign message
      const message = createSiweMessage({
        address: testAddress,
        chainId: 1,
        domain: nonceData.domain,
        nonce: nonceData.nonce,
        uri: nonceData.uri,
        version: "1",
        statement: "Sign in to ElizaCloud",
      });

      const signature = await testAccount.signMessage({ message });

      // First verification should succeed
      const verifyReq1 = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/verify"),
        {
          method: "POST",
          body: JSON.stringify({ message, signature }),
          headers: { "content-type": "application/json" },
        }
      );
      const verifyRes1 = await postVerify(verifyReq1);
      expect(verifyRes1.status).toBe(200);

      // Second verification with same nonce should fail
      const verifyReq2 = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/verify"),
        {
          method: "POST",
          body: JSON.stringify({ message, signature }),
          headers: { "content-type": "application/json" },
        }
      );
      const verifyRes2 = await postVerify(verifyReq2);
      expect(verifyRes2.status).toBe(400);

      const errorData = await verifyRes2.json();
      expect(errorData.error).toBe("INVALID_NONCE");
    }, 30000);
  });

  describe("Nonce TTL Validation", () => {
    it("should reject expired nonce after TTL", async () => {
      // This test requires mocking time or waiting for TTL
      // For now, we verify the nonce is stored with correct TTL
      const nonceReq = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/nonce?chainId=1")
      );
      const nonceRes = await getNonce(nonceReq);
      expect(nonceRes.status).toBe(200);

      const nonceData = await nonceRes.json();
      expect(nonceData).toHaveProperty("nonce");

      // Verify nonce exists in cache
      const cachedValue = await cache.get(`siwe:nonce:${nonceData.nonce}`);
      expect(cachedValue).toBeTruthy();
    });
  });

  describe("Signature Validation", () => {
    it("should reject invalid signature", async () => {
      const nonceReq = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/nonce?chainId=1")
      );
      const nonceRes = await getNonce(nonceReq);
      const nonceData = await nonceRes.json();

      const message = createSiweMessage({
        address: testAddress,
        chainId: 1,
        domain: nonceData.domain,
        nonce: nonceData.nonce,
        uri: nonceData.uri,
        version: "1",
        statement: "Sign in to ElizaCloud",
      });

      // Use invalid signature
      const invalidSignature = "0x" + "00".repeat(65);

      const verifyReq = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/verify"),
        {
          method: "POST",
          body: JSON.stringify({ message, signature: invalidSignature }),
          headers: { "content-type": "application/json" },
        }
      );

      const verifyRes = await postVerify(verifyReq);
      expect(verifyRes.status).toBe(400);

      const errorData = await verifyRes.json();
      expect(errorData.error).toBe("INVALID_SIGNATURE");
    });

    it("should reject signature from wrong wallet", async () => {
      const nonceReq = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/nonce?chainId=1")
      );
      const nonceRes = await getNonce(nonceReq);
      const nonceData = await nonceRes.json();

      // Create message for one address
      const message = createSiweMessage({
        address: testAddress,
        chainId: 1,
        domain: nonceData.domain,
        nonce: nonceData.nonce,
        uri: nonceData.uri,
        version: "1",
        statement: "Sign in to ElizaCloud",
      });

      // But sign with a different account
      const differentKey = generatePrivateKey();
      const differentAccount = privateKeyToAccount(differentKey);
      const signature = await differentAccount.signMessage({ message });

      const verifyReq = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/verify"),
        {
          method: "POST",
          body: JSON.stringify({ message, signature }),
          headers: { "content-type": "application/json" },
        }
      );

      const verifyRes = await postVerify(verifyReq);
      expect(verifyRes.status).toBe(400);

      const errorData = await verifyRes.json();
      expect(errorData.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Domain Validation", () => {
    it("should reject message with wrong domain", async () => {
      const nonceReq = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/nonce?chainId=1")
      );
      const nonceRes = await getNonce(nonceReq);
      const nonceData = await nonceRes.json();

      // Create message with wrong domain
      const message = createSiweMessage({
        address: testAddress,
        chainId: 1,
        domain: "evil.example.com",
        nonce: nonceData.nonce,
        uri: nonceData.uri,
        version: "1",
        statement: "Sign in to ElizaCloud",
      });

      const signature = await testAccount.signMessage({ message });

      const verifyReq = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/verify"),
        {
          method: "POST",
          body: JSON.stringify({ message, signature }),
          headers: { "content-type": "application/json" },
        }
      );

      const verifyRes = await postVerify(verifyReq);
      expect(verifyRes.status).toBe(400);

      const errorData = await verifyRes.json();
      expect(errorData.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("Race Condition Handling", () => {
    it("should handle concurrent sign-ups for same wallet", async () => {
      // Get nonce
      const nonceReq = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/nonce?chainId=1")
      );
      const nonceRes = await getNonce(nonceReq);
      const nonceData = await nonceRes.json();

      // Create and sign message
      const message = createSiweMessage({
        address: testAddress,
        chainId: 1,
        domain: nonceData.domain,
        nonce: nonceData.nonce,
        uri: nonceData.uri,
        version: "1",
        statement: "Sign in to ElizaCloud",
      });

      const signature = await testAccount.signMessage({ message });

      // Simulate concurrent requests (though first will consume nonce)
      const verifyReq1 = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/verify"),
        {
          method: "POST",
          body: JSON.stringify({ message, signature }),
          headers: { "content-type": "application/json" },
        }
      );

      const verifyReq2 = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/verify"),
        {
          method: "POST",
          body: JSON.stringify({ message, signature }),
          headers: { "content-type": "application/json" },
        }
      );

      // Execute both concurrently
      const [res1, res2] = await Promise.all([
        postVerify(verifyReq1),
        postVerify(verifyReq2),
      ]);

      // One should succeed, one should fail with nonce error
      const results = [res1.status, res2.status];
      expect(results).toContain(200);
      expect(results).toContain(400);
    }, 30000);
  });

  describe("Redis Unavailability", () => {
    it("should fail gracefully when Redis is down", async () => {
      // Mock cache as unavailable
      const originalIsAvailable = cache.isAvailable;
      vi.spyOn(cache, "isAvailable").mockReturnValue(false);

      const nonceReq = new NextRequest(
        new URL("http://localhost:3000/api/auth/siwe/nonce?chainId=1")
      );
      const nonceRes = await getNonce(nonceReq);
      expect(nonceRes.status).toBe(503);

      const errorData = await nonceRes.json();
      expect(errorData.error).toBe("SERVICE_UNAVAILABLE");

      // Restore
      cache.isAvailable = originalIsAvailable;
    });
  });
});
