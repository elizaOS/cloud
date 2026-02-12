
/**
 * SIWE Verify Endpoint Tests
 * 
 * Covers nonce issuance (TTL/single-use), verify success paths 
 * (existing vs new user), and key failure modes (invalid nonce/domain/signature).
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
    update: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@/lib/services/api-keys', () => ({
  apiKeysService: {
    listByOrganization: vi.fn(() => []),
    create: vi.fn(() => ({ plainKey: 'test-api-key-123' })),
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
  withRateLimit: vi.fn((handler) => handler),
  RateLimitPresets: { STRICT: {} },
}));

vi.mock('viem/siwe', () => ({
  parseSiweMessage: vi.fn(),
}));

vi.mock('viem', () => ({
  recoverMessageAddress: vi.fn(),
  getAddress: vi.fn((addr: string) => addr),
}));

import { cache } from '@/lib/cache/client';
import { atomicConsume } from '@/lib/cache/consume';
import { usersService } from '@/lib/services/users';
import { parseSiweMessage } from 'viem/siwe';
import { recoverMessageAddress } from 'viem';

describe('SIWE Verify Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  function createRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/auth/siwe/verify', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  describe('Request validation', () => {
    it('returns INVALID_BODY when message is missing', async () => {
      const { POST } = await import('./route');
      const req = createRequest({ signature: '0xabc' });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('INVALID_BODY');
    });

    it('returns INVALID_BODY when signature is missing', async () => {
      const { POST } = await import('./route');
      const req = createRequest({ message: 'test message' });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('INVALID_BODY');
    });

    it('returns INVALID_BODY when message is empty string', async () => {
      const { POST } = await import('./route');
      const req = createRequest({ message: '   ', signature: '0xabc' });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('INVALID_BODY');
    });
  });

  describe('Cache availability', () => {
    it('returns SERVICE_UNAVAILABLE when Redis is down', async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: '0x1234567890123456789012345678901234567890',
        nonce: 'test-nonce',
        domain: 'example.com',
      });

      const { POST } = await import('./route');
      const req = createRequest({
        message: 'valid message',
        signature: '0xvalidsig',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.error).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('Nonce validation (TTL/single-use)', () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: '0x1234567890123456789012345678901234567890',
        nonce: 'test-nonce',
        domain: 'example.com',
      });
    });

    it('returns INVALID_NONCE when nonce has expired or was used', async () => {
      vi.mocked(atomicConsume).mockResolvedValue(false);

      const { POST } = await import('./route');
      const req = createRequest({
        message: 'valid message',
        signature: '0xvalidsig',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('INVALID_NONCE');
      expect(data.message).toContain('expired or was already used');
    });

    it('consumes nonce atomically to prevent replay attacks', async () => {
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(recoverMessageAddress).mockResolvedValue('0x1234567890123456789012345678901234567890');
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: 'user-1',
        organization_id: 'org-1',
        is_active: true,
        organization: { is_active: true },
      } as any);

      const { POST } = await import('./route');
      const req = createRequest({
        message: 'valid message',
        signature: '0xvalidsig',
      });
      await POST(req);

      expect(atomicConsume).toHaveBeenCalledWith(expect.stringContaining('test-nonce'));
    });
  });

  describe('Domain validation', () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
    });

    it('returns INVALID_DOMAIN when domain does not match', async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: '0x1234567890123456789012345678901234567890',
        nonce: 'test-nonce',
        domain: 'evil.com',
      });

      const { POST } = await import('./route');
      const req = createRequest({
        message: 'valid message',
        signature: '0xvalidsig',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('INVALID_DOMAIN');
    });
  });

  describe('Signature validation', () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: '0x1234567890123456789012345678901234567890',
        nonce: 'test-nonce',
        domain: 'example.com',
      });
    });

    it('returns INVALID_SIGNATURE when signature recovery fails', async () => {
      vi.mocked(recoverMessageAddress).mockRejectedValue(new Error('Invalid signature'));

      const { POST } = await import('./route');
      const req = createRequest({
        message: 'valid message',
        signature: '0xbadsig',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('INVALID_SIGNATURE');
    });

    it('returns INVALID_SIGNATURE when recovered address does not match', async () => {
      vi.mocked(recoverMessageAddress).mockResolvedValue('0xDIFFERENT_ADDRESS');

      const { POST } = await import('./route');
      const req = createRequest({
        message: 'valid message',
        signature: '0xvalidsig',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('INVALID_SIGNATURE');
    });
  });

  describe('Existing user path', () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: '0x1234567890123456789012345678901234567890',
        nonce: 'test-nonce',
        domain: 'example.com',
      });
      vi.mocked(recoverMessageAddress).mockResolvedValue('0x1234567890123456789012345678901234567890');
    });

    it('returns existing user with isNewAccount=false', async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        organization_id: 'org-1',
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true, name: 'Test Org', credit_balance: '100.00' },
      } as any);

      const { POST } = await import('./route');
      const req = createRequest({
        message: 'valid message',
        signature: '0xvalidsig',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.isNewAccount).toBe(false);
      expect(data.user.id).toBe('user-1');
    });

    it('returns ACCOUNT_INACTIVE for deactivated users', async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: 'user-1',
        organization_id: 'org-1',
        is_active: false,
        organization: { is_active: true },
      } as any);

      const { POST } = await import('./route');
      const req = createRequest({
        message: 'valid message',
        signature: '0xvalidsig',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toBe('ACCOUNT_INACTIVE');
    });
  });

  describe('New user signup path', () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: '0x1234567890123456789012345678901234567890',
        nonce: 'test-nonce',
        domain: 'example.com',
      });
      vi.mocked(recoverMessageAddress).mockResolvedValue('0x1234567890123456789012345678901234567890');
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue({
          id: 'new-user-1',
          name: '0x1234...7890',
          organization_id: 'org-123',
          is_active: true,
          wallet_verified: true,
          organization: { id: 'org-123', is_active: true, name: 'Test Org' },
        } as any);
    });

    it('creates new user with isNewAccount=true', async () => {
      const { POST } = await import('./route');
      const req = createRequest({
        message: 'valid message',
        signature: '0xvalidsig',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.isNewAccount).toBe(true);
      expect(data.apiKey).toBeDefined();
    });
  });
});
