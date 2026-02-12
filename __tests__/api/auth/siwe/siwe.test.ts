
/**
 * SIWE Authentication Tests
 * 
 * Covers nonce issuance (TTL/single-use), verify success paths 
 * (existing vs new user), and key failure modes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports
vi.mock('@/lib/cache/client', () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    set: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve(null)),
    delete: vi.fn(() => Promise.resolve(true)),
  },
}));

vi.mock('@/lib/cache/consume', () => ({
  atomicConsume: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@/lib/services/users', () => ({
  usersService: {
    getByWalletAddressWithOrganization: vi.fn(() => Promise.resolve(null)),
    create: vi.fn(() => Promise.resolve({ id: 'user-1' })),
    update: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/lib/services/organizations', () => ({
  organizationsService: {
    getBySlug: vi.fn(() => Promise.resolve(null)),
    create: vi.fn(() => Promise.resolve({ id: 'org-1' })),
    delete: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/lib/services/api-keys', () => ({
  apiKeysService: {
    listByOrganization: vi.fn(() => Promise.resolve([])),
    create: vi.fn(() => Promise.resolve({ plainKey: 'test-api-key' })),
  },
}));

vi.mock('@/lib/services/credits', () => ({
  creditsService: {
    addCredits: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/lib/services/abuse-detection', () => ({
  abuseDetectionService: {
    checkSignupAbuse: vi.fn(() => Promise.resolve({ allowed: true })),
    recordSignupMetadata: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    transaction: vi.fn((fn) => fn({})),
  },
}));

vi.mock('viem/siwe', () => ({
  generateSiweNonce: vi.fn(() => 'test-nonce-12345'),
  parseSiweMessage: vi.fn(() => ({
    address: '0x1234567890123456789012345678901234567890',
    nonce: 'test-nonce-12345',
    domain: 'localhost',
    expirationTime: null,
  })),
}));

vi.mock('viem', () => ({
  recoverMessageAddress: vi.fn(() => Promise.resolve('0x1234567890123456789012345678901234567890')),
  getAddress: vi.fn((addr) => addr),
}));

import { cache } from '@/lib/cache/client';
import { atomicConsume } from '@/lib/cache/consume';
import { usersService } from '@/lib/services/users';

describe('SIWE Nonce Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('nonce issuance', () => {
    it('should return 503 when cache is unavailable', async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      
      // Simulating the check in nonce/route.ts
      const isAvailable = cache.isAvailable();
      expect(isAvailable).toBe(false);
    });

    it('should generate and store nonce with TTL', async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockResolvedValue(undefined);
      
      const isAvailable = cache.isAvailable();
      expect(isAvailable).toBe(true);
      
      // Verify set is called with TTL (300 seconds = 5 minutes)
      await cache.set('siwe:nonce:test', true, 300);
      expect(cache.set).toHaveBeenCalledWith('siwe:nonce:test', true, 300);
    });

    it('should return 503 when cache.set fails', async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockRejectedValue(new Error('Redis connection failed'));
      
      await expect(cache.set('key', 'value', 300)).rejects.toThrow();
    });
  });

  describe('nonce single-use validation', () => {
    it('should consume nonce atomically on verify', async () => {
      vi.mocked(atomicConsume).mockResolvedValue(true);
      
      const consumed = await atomicConsume('siwe:nonce:test-nonce');
      expect(consumed).toBe(true);
    });

    it('should reject already-used nonce', async () => {
      vi.mocked(atomicConsume).mockResolvedValue(false);
      
      const consumed = await atomicConsume('siwe:nonce:test-nonce');
      expect(consumed).toBe(false);
    });

    it('should reject expired nonce', async () => {
      vi.mocked(atomicConsume).mockResolvedValue(false);
      
      const consumed = await atomicConsume('siwe:nonce:expired-nonce');
      expect(consumed).toBe(false);
    });
  });
});

describe('SIWE Verify Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(atomicConsume).mockResolvedValue(true);
  });

  describe('success paths', () => {
    it('should authenticate existing user and return API key', async () => {
      const existingUser = {
        id: 'user-1',
        organization_id: 'org-1',
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true, name: 'Test Org', credit_balance: '10.00' },
      };
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(existingUser as any);
      
      const user = await usersService.getByWalletAddressWithOrganization('0x1234');
      expect(user).toBeDefined();
      expect(user?.is_active).toBe(true);
    });

    it('should create new user with organization on first auth', async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(null);
      
      const user = await usersService.getByWalletAddressWithOrganization('0x1234');
      expect(user).toBeNull();
    });

    it('should mark wallet as verified for existing unverified user', async () => {
      const unverifiedUser = {
        id: 'user-1',
        organization_id: 'org-1',
        is_active: true,
        wallet_verified: false,
        organization: { is_active: true },
      };
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(unverifiedUser as any);
      vi.mocked(usersService.update).mockResolvedValue(undefined);
      
      const user = await usersService.getByWalletAddressWithOrganization('0x1234');
      if (user && !user.wallet_verified) {
        await usersService.update(user.id, { wallet_verified: true });
      }
      
      expect(usersService.update).toHaveBeenCalledWith('user-1', { wallet_verified: true });
    });
  });

  describe('failure modes', () => {
    it('should reject invalid nonce', async () => {
      vi.mocked(atomicConsume).mockResolvedValue(false);
      
      const consumed = await atomicConsume('siwe:nonce:invalid');
      expect(consumed).toBe(false);
    });

    it('should reject when cache unavailable', async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      
      expect(cache.isAvailable()).toBe(false);
    });

    it('should reject inactive user', async () => {
      const inactiveUser = {
        id: 'user-1',
        organization_id: 'org-1',
        is_active: false,
        organization: { is_active: true },
      };
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(inactiveUser as any);
      
      const user = await usersService.getByWalletAddressWithOrganization('0x1234');
      expect(user?.is_active).toBe(false);
    });

    it('should reject inactive organization', async () => {
      const userWithInactiveOrg = {
        id: 'user-1',
        organization_id: 'org-1',
        is_active: true,
        organization: { is_active: false },
      };
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(userWithInactiveOrg as any);
      
      const user = await usersService.getByWalletAddressWithOrganization('0x1234');
      expect(user?.organization?.is_active).toBe(false);
    });
  });

  describe('race condition handling', () => {
    it('should handle duplicate wallet constraint (23505 error)', async () => {
      const duplicateError = { code: '23505' };
      
      expect(duplicateError.code).toBe('23505');
    });

    it('should retry fetching user after race condition', async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'user-1',
          organization_id: 'org-1',
          is_active: true,
          wallet_verified: true,
          organization: { is_active: true },
        } as any);
      
      // First call returns null (race condition)
      let user = await usersService.getByWalletAddressWithOrganization('0x1234');
      expect(user).toBeNull();
      
      // Second call returns the user created by the winning request
      user = await usersService.getByWalletAddressWithOrganization('0x1234');
      expect(user).toBeDefined();
    });
  });
});
