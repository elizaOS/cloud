
/**
 * SIWE Verify Endpoint Tests
 * 
 * Covers:
 * - Nonce TTL and single-use validation
 * - Verify success paths (existing vs new user)
 * - Key failure modes (invalid nonce/domain/signature)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST as handleVerify } from '../verify/route';
import { cache } from '@/lib/cache/client';
import { CacheKeys } from '@/lib/cache/keys';
import { generateSiweNonce } from 'siwe';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';

describe('SIWE Verify Endpoint', () => {
  describe('Nonce TTL and Single-Use', () => {
    it('should reject expired nonce', async () => {
      const nonce = generateSiweNonce();
      const account = privateKeyToAccount(generatePrivateKey());
      
      const message = createSiweMessage({
        address: account.address,
        chainId: 1,
        domain: 'localhost',
        nonce,
        uri: 'http://localhost:3000',
        version: '1',
      });
      
      const signature = await account.signMessage({ message });
      
      const req = new Request('http://localhost:3000/api/auth/siwe/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      
      const response = await handleVerify(req as any);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('INVALID_NONCE');
    });

    it('should reject reused nonce', async () => {
      const nonce = generateSiweNonce();
      await cache.set(CacheKeys.siwe.nonce(nonce), '1', { ex: 600 });
      
      const account = privateKeyToAccount(generatePrivateKey());
      const message = createSiweMessage({
        address: account.address,
        chainId: 1,
        domain: 'localhost',
        nonce,
        uri: 'http://localhost:3000',
        version: '1',
      });
      
      const signature = await account.signMessage({ message });
      
      const req1 = new Request('http://localhost:3000/api/auth/siwe/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      
      await handleVerify(req1 as any);
      
      const req2 = new Request('http://localhost:3000/api/auth/siwe/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      
      const response = await handleVerify(req2 as any);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('INVALID_NONCE');
    });
  });

  describe('Verify Success Paths', () => {
    it('should authenticate existing user', async () => {
      const nonce = generateSiweNonce();
      await cache.set(CacheKeys.siwe.nonce(nonce), '1', { ex: 600 });
      
      const account = privateKeyToAccount(generatePrivateKey());
      const message = createSiweMessage({
        address: account.address,
        chainId: 1,
        domain: 'localhost',
        nonce,
        uri: 'http://localhost:3000',
        version: '1',
      });
      
      const signature = await account.signMessage({ message });
      
      const req = new Request('http://localhost:3000/api/auth/siwe/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      
      const response = await handleVerify(req as any);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('apiKey');
      expect(data).toHaveProperty('address');
      expect(data).toHaveProperty('isNewAccount');
    });

    it('should create new user account', async () => {
      const nonce = generateSiweNonce();
      await cache.set(CacheKeys.siwe.nonce(nonce), '1', { ex: 600 });
      
      const account = privateKeyToAccount(generatePrivateKey());
      const message = createSiweMessage({
        address: account.address,
        chainId: 1,
        domain: 'localhost',
        nonce,
        uri: 'http://localhost:3000',
        version: '1',
      });
      
      const signature = await account.signMessage({ message });
      
      const req = new Request('http://localhost:3000/api/auth/siwe/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      
      const response = await handleVerify(req as any);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(true);
      expect(data).toHaveProperty('apiKey');
      expect(data.organization).toHaveProperty('creditBalance');
    });
  });

  describe('Failure Modes', () => {
    it('should reject invalid signature', async () => {
      const nonce = generateSiweNonce();
      await cache.set(CacheKeys.siwe.nonce(nonce), '1', { ex: 600 });
      
      const account = privateKeyToAccount(generatePrivateKey());
      const message = createSiweMessage({
        address: account.address,
        chainId: 1,
        domain: 'localhost',
        nonce,
        uri: 'http://localhost:3000',
        version: '1',
      });
      
      const req = new Request('http://localhost:3000/api/auth/siwe/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature: '0xinvalid' }),
      });
      
      const response = await handleVerify(req as any);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('INVALID_SIGNATURE');
    });

    it('should reject wrong domain', async () => {
      const nonce = generateSiweNonce();
      await cache.set(CacheKeys.siwe.nonce(nonce), '1', { ex: 600 });
      
      const account = privateKeyToAccount(generatePrivateKey());
      const message = createSiweMessage({
        address: account.address,
        chainId: 1,
        domain: 'evil.com',
        nonce,
        uri: 'http://evil.com',
        version: '1',
      });
      
      const signature = await account.signMessage({ message });
      
      const req = new Request('http://localhost:3000/api/auth/siwe/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      
      const response = await handleVerify(req as any);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('INVALID_DOMAIN');
    });

    it('should fail when cache unavailable', async () => {
      vi.spyOn(cache, 'isAvailable').mockReturnValue(false);
      
      const account = privateKeyToAccount(generatePrivateKey());
      const message = createSiweMessage({
        address: account.address,
        chainId: 1,
        domain: 'localhost',
        nonce: generateSiweNonce(),
        uri: 'http://localhost:3000',
        version: '1',
      });
      
      const signature = await account.signMessage({ message });
      
      const req = new Request('http://localhost:3000/api/auth/siwe/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      
      const response = await handleVerify(req as any);
      const data = await response.json();
      
      expect(response.status).toBe(503);
      expect(data.error).toBe('SERVICE_UNAVAILABLE');
    });
  });
});
