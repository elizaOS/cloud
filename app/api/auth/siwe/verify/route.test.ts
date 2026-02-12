
/**
 * Tests for SIWE Verify Endpoint
 * 
 * Coverage for:
 * - Nonce issuance (TTL/single-use validation)
 * - Verify success paths (existing vs new user)
 * - Key failure modes (invalid nonce/domain/signature)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before importing the route
vi.mock('@/lib/cache/client', () => ({
  cache: {
    isAvailable: vi.fn(() => true),
  },
}));

vi.mock('@/lib/cache/consume', () => ({
  atomicConsume: vi.fn(),
}));

vi.mock('@/lib/services/users', () => ({
  usersService: {
    getByWalletAddressWithOrganization: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/services/api-keys', () => ({
  apiKeysService: {
    listByOrganization: vi.fn(() => []),
    create: vi.fn(() => ({ plainKey: 'test-api-key' })),
  },
}));

vi.mock('@/lib/services/organizations', () => ({
  organizationsService: {
    getBySlug: vi.fn(() => null),
    create: vi.fn(() => ({ id: 'org-123', name: 'Test Org' })),
  },
}));

vi.mock('@/lib/services/credits', () => ({
  creditsService: {
    addCredits: vi.fn(),
  },
}));

vi.mock('@/lib/services/abuse-detection', () => ({
  abuseDetectionService: {
    checkSignupAbuse: vi.fn(() => ({ allowed: true })),
    recordSignupMetadata: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    transaction: vi.fn((fn) => fn({})),
  },
}));

vi.mock('@/lib/middleware/rate-limit', () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

vi.mock('viem/siwe', () => ({
  parseSiweMessage: vi.fn(),
}));

vi.mock('viem', () => ({
  recoverMessageAddress: vi.fn(),
  getAddress: vi.fn((addr: string) => addr),
}));

import { POST } from './route';
import { cache } from '@/lib/cache/client';
import { atomicConsume } from '@/lib/cache/consume';
import { usersService } from '@/lib/services/users';
import { parseSiweMessage } from 'viem/siwe';
import { recoverMessageAddress } from 'viem';

describe('SIWE Verify Endpoint', () => {
  const validMessage = 'example.com wants you to sign in...';
  const validSignature = '0xabc123';
  const testAddress = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  function createRequest(body: object): NextRequest {
    return new NextRequest('http://localhost/api/auth/siwe/verify', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  describe('Request Validation', () => {
    it('returns 400 for missing message', async () => {
      const req = createRequest({ signature: validSignature });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_BODY');
    });

    it('returns 400 for missing signature', async () => {
      const req = createRequest({ message: validMessage });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_BODY');
    });

    it('returns 400 for empty message', async () => {
      const req = createRequest({ message: '   ', signature: validSignature });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe('Cache Availability', () => {
    it('returns 503 when cache is unavailable', async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: testAddress,
        nonce: 'test-nonce',
        domain: 'example.com',
      });

      const req = createRequest({ message: validMessage, signature: validSignature });
      const res = await POST(req);
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('Nonce Validation (Single-Use)', () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: testAddress,
        nonce: 'test-nonce',
        domain: 'example.com',
      });
    });

    it('returns 400 for expired or already-used nonce', async () => {
      vi.mocked(atomicConsume).mockResolvedValue(false);

      const req = createRequest({ message: validMessage, signature: validSignature });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_NONCE');
    });

    it('consumes nonce atomically to prevent replay', async () => {
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(recoverMessageAddress).mockResolvedValue(testAddress);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: 'user-123',
        organization_id: 'org-123',
        is_active: true,
        organization: { is_active: true },
      } as any);

      const req = createRequest({ message: validMessage, signature: validSignature });
      await POST(req);

      expect(atomicConsume).toHaveBeenCalledTimes(1);
    });
  });

  describe('Domain Validation', () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
    });

    it('returns 400 for mismatched domain', async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: testAddress,
        nonce: 'test-nonce',
        domain: 'malicious-site.com',
      });

      const req = createRequest({ message: validMessage, signature: validSignature });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_DOMAIN');
    });
  });

  describe('Signature Validation', () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: testAddress,
        nonce: 'test-nonce',
        domain: 'example.com',
      });
    });

    it('returns 400 for invalid signature', async () => {
      vi.mocked(recoverMessageAddress).mockRejectedValue(new Error('Invalid signature'));

      const req = createRequest({ message: validMessage, signature: validSignature });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_SIGNATURE');
    });

    it('returns 400 when recovered address does not match claimed address', async () => {
      vi.mocked(recoverMessageAddress).mockResolvedValue('0xDifferentAddress');

      const req = createRequest({ message: validMessage, signature: validSignature });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_SIGNATURE');
    });
  });

  describe('Existing User Flow', () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: testAddress,
        nonce: 'test-nonce',
        domain: 'example.com',
      });
      vi.mocked(recoverMessageAddress).mockResolvedValue(testAddress);
    });

    it('returns existing user with API key', async () => {
      const existingUser = {
        id: 'user-123',
        name: 'Test User',
        organization_id: 'org-123',
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true, name: 'Test Org', credit_balance: '10.00' },
      };
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(existingUser as any);

      const req = createRequest({ message: validMessage, signature: validSignature });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.isNewAccount).toBe(false);
      expect(data.apiKey).toBeDefined();
    });

    it('returns 403 for inactive account', async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: 'user-123',
        organization_id: 'org-123',
        is_active: false,
        organization: { is_active: true },
      } as any);

      const req = createRequest({ message: validMessage, signature: validSignature });
      const res = await POST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('ACCOUNT_INACTIVE');
    });
  });

  describe('New User Flow', () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: testAddress,
        nonce: 'test-nonce',
        domain: 'example.com',
      });
      vi.mocked(recoverMessageAddress).mockResolvedValue(testAddress);
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined) // First call: no existing user
        .mockResolvedValue({ // After creation
          id: 'new-user-123',
          name: '0x1234...7890',
          organization_id: 'org-123',
          is_active: true,
          wallet_verified: true,
          organization: { is_active: true, name: "0x1234...7890's Organization", credit_balance: '5.00' },
        } as any);
    });

    it('creates new user and returns isNewAccount=true', async () => {
      const req = createRequest({ message: validMessage, signature: validSignature });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.isNewAccount).toBe(true);
      expect(data.apiKey).toBeDefined();
    });
  });
});
