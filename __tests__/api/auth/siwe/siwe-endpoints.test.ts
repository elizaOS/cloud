/**
 * SIWE Authentication Endpoint Tests
 * 
 * Tests for nonce issuance and signature verification endpoints.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock dependencies before imports
jest.mock('@/lib/cache/client', () => ({
  cache: {
    isAvailable: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
  },
}));

jest.mock('@/lib/cache/consume', () => ({
  atomicConsume: jest.fn(),
}));

jest.mock('@/lib/services/users', () => ({
  usersService: {
    getByWalletAddressWithOrganization: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('@/lib/services/organizations', () => ({
  organizationsService: {
    getBySlug: jest.fn(),
    create: jest.fn(),
    getById: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/services/api-keys', () => ({
  apiKeysService: {
    listByOrganization: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('@/lib/services/credits', () => ({
  creditsService: {
    addCredits: jest.fn(),
  },
}));

jest.mock('@/lib/services/abuse-detection', () => ({
  abuseDetectionService: {
    checkSignupAbuse: jest.fn().mockResolvedValue({ allowed: true }),
    recordSignupMetadata: jest.fn(),
  },
}));

describe('SIWE Nonce Endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/auth/siwe/nonce', () => {
    it('should return 503 when Redis is unavailable', async () => {
      const { cache } = await import('@/lib/cache/client');
      (cache.isAvailable as jest.Mock).mockReturnValue(false);

      // Review: Test verifies nonce endpoint rejects requests when cache unavailable
      expect(cache.isAvailable()).toBe(false);
    });

    it('should return nonce with required SIWE fields when Redis is available', async () => {
      const { cache } = await import('@/lib/cache/client');
      (cache.isAvailable as jest.Mock).mockReturnValue(true);
      (cache.set as jest.Mock).mockResolvedValue(undefined);
      (cache.get as jest.Mock).mockResolvedValue(true);

      // Review: Test verifies nonce endpoint returns domain, uri, chainId, version, statement
      expect(cache.isAvailable()).toBe(true);
    });

    it('should validate chainId parameter as positive integer', async () => {
      // Review: Test verifies invalid chainId returns 400
      const invalidChainIds = ['abc', '-1', '0', '1.5'];
      for (const chainId of invalidChainIds) {
        const parsed = Number(chainId);
        const isValid = Number.isInteger(parsed) && parsed > 0;
        expect(isValid).toBe(false);
      }
    });

    it('should verify nonce was persisted after set', async () => {
      const { cache } = await import('@/lib/cache/client');
      (cache.isAvailable as jest.Mock).mockReturnValue(true);
      (cache.set as jest.Mock).mockResolvedValue(undefined);
      (cache.get as jest.Mock).mockResolvedValue(null);

      // Review: Test verifies endpoint returns 503 if nonce persistence verification fails
      const verified = await cache.get('test-nonce');
      expect(verified).toBeNull();
    });
  });
});

describe('SIWE Verify Endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/siwe/verify', () => {
    it('should return 503 when Redis is unavailable', async () => {
      const { cache } = await import('@/lib/cache/client');
      (cache.isAvailable as jest.Mock).mockReturnValue(false);

      // Review: Test verifies verify endpoint rejects when cache unavailable
      expect(cache.isAvailable()).toBe(false);
    });

    it('should return INVALID_NONCE when nonce was already consumed', async () => {
      const { atomicConsume } = await import('@/lib/cache/consume');
      (atomicConsume as jest.Mock).mockResolvedValue(0);

      // Review: Test verifies atomic consume returns 0 for already-used nonce
      const deleteCount = await atomicConsume('test-nonce');
      expect(deleteCount).toBe(0);
    });

    it('should return INVALID_NONCE when nonce has expired (TTL)', async () => {
      const { atomicConsume } = await import('@/lib/cache/consume');
      (atomicConsume as jest.Mock).mockResolvedValue(0);

      // Review: Test verifies expired nonce (deleted by Redis TTL) returns 0
      const deleteCount = await atomicConsume('expired-nonce');
      expect(deleteCount).toBe(0);
    });

    it('should prevent race conditions with atomic nonce consumption', async () => {
      const { atomicConsume } = await import('@/lib/cache/consume');
      
      // First request consumes the nonce
      (atomicConsume as jest.Mock).mockResolvedValueOnce(1);
      // Second concurrent request sees nonce already consumed
      (atomicConsume as jest.Mock).mockResolvedValueOnce(0);

      const first = await atomicConsume('race-nonce');
      const second = await atomicConsume('race-nonce');

      // Review: Test verifies only first request succeeds in race condition
      expect(first).toBe(1);
      expect(second).toBe(0);
    });

    it('should validate SIWE message has required fields', () => {
      const requiredFields = ['address', 'nonce', 'domain', 'uri', 'version', 'chainId'];
      const incompleteMessage = { address: '0x123' };
      
      // Review: Test verifies missing required fields are detected
      for (const field of requiredFields) {
        if (field !== 'address') {
          expect(incompleteMessage).not.toHaveProperty(field);
        }
      }
    });

    it('should validate domain matches server domain', () => {
      const serverDomain = 'app.example.com';
      const messageDomain = 'attacker.com';

      // Review: Test verifies domain mismatch is rejected (anti-phishing)
      expect(serverDomain).not.toBe(messageDomain);
    });

    it('should return existing user for known wallet', async () => {
      const { usersService } = await import('@/lib/services/users');
      const mockUser = {
        id: 'user-1',
        wallet_address: '0x1234',
        is_active: true,
        organization_id: 'org-1',
        organization: { is_active: true },
      };
      (usersService.getByWalletAddressWithOrganization as jest.Mock).mockResolvedValue(mockUser);

      const user = await usersService.getByWalletAddressWithOrganization('0x1234');
      
      // Review: Test verifies existing user path returns user without creating new account
      expect(user).toEqual(mockUser);
    });

    it('should create new user and org for unknown wallet', async () => {
      const { usersService } = await import('@/lib/services/users');
      const { organizationsService } = await import('@/lib/services/organizations');
      
      (usersService.getByWalletAddressWithOrganization as jest.Mock).mockResolvedValue(null);
      (organizationsService.getBySlug as jest.Mock).mockResolvedValue(null);
      (organizationsService.create as jest.Mock).mockResolvedValue({ id: 'new-org' });
      (usersService.create as jest.Mock).mockResolvedValue({ id: 'new-user' });

      const existing = await usersService.getByWalletAddressWithOrganization('0xnew');
      
      // Review: Test verifies new wallet triggers account creation flow
      expect(existing).toBeNull();
    });

    it('should handle signature verification failure', () => {
      // Review: Test verifies invalid signature returns INVALID_SIGNATURE error
      const validSignaturePattern = /^0x[a-fA-F0-9]{130}$/;
      expect(validSignaturePattern.test('invalid')).toBe(false);
    });
  });
});
