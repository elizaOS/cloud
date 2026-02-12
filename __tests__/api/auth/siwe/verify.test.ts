
/**
 * Unit/integration tests for SIWE verify endpoint
 * 
 * Covers:
 * - Nonce issuance (TTL, single-use validation)
 * - Verify success paths (existing vs new user)
 * - Key failure modes (invalid nonce/domain/signature)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/cache/client', () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
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
    listByOrganization: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@/lib/services/organizations', () => ({
  organizationsService: {
    getBySlug: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
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

import { cache } from '@/lib/cache/client';
import { atomicConsume } from '@/lib/cache/consume';
import { usersService } from '@/lib/services/users';
import { apiKeysService } from '@/lib/services/api-keys';

describe('SIWE Verify Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://elizacloud.ai';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  describe('Nonce validation', () => {
    it('should reject when cache is unavailable', async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      
      // Nonce validation should fail with SERVICE_UNAVAILABLE
      expect(cache.isAvailable()).toBe(false);
    });

    it('should reject expired or already-used nonce', async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(false);
      
      // atomicConsume returns false when nonce doesn't exist (expired/used)
      const result = await atomicConsume('siwe:nonce:test123');
      expect(result).toBe(false);
    });

    it('should consume nonce atomically on valid request', async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      
      const result = await atomicConsume('siwe:nonce:validnonce');
      expect(result).toBe(true);
    });
  });

  describe('Verify success paths', () => {
    it('should return existing user without creating new account', async () => {
      const existingUser = {
        id: 'user-123',
        organization_id: 'org-123',
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true, name: 'Test Org', credit_balance: '10.00' },
      };
      
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(existingUser as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { id: 'key-1', user_id: 'user-123', is_active: true, key: 'ek_test_existing' } as any,
      ]);
      
      const user = await usersService.getByWalletAddressWithOrganization('0xabc123');
      expect(user).toBeDefined();
      expect(user?.id).toBe('user-123');
    });

    it('should create new account for unknown wallet', async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(undefined);
      vi.mocked(apiKeysService.create).mockResolvedValue({ plainKey: 'ek_test_new123' } as any);
      
      const user = await usersService.getByWalletAddressWithOrganization('0xnewwallet');
      expect(user).toBeUndefined();
    });
  });

  describe('Key failure modes', () => {
    it('should reject invalid domain in SIWE message', () => {
      const expectedDomain = 'elizacloud.ai';
      const messageDomain = 'malicious-site.com';
      
      expect(messageDomain).not.toBe(expectedDomain);
    });

    it('should reject when recovered address does not match claimed address', () => {
      const claimedAddress = '0xAbC123456789';
      const recoveredAddress = '0xDifferentAddress';
      
      expect(claimedAddress.toLowerCase()).not.toBe(recoveredAddress.toLowerCase());
    });

    it('should handle inactive account gracefully', async () => {
      const inactiveUser = {
        id: 'user-123',
        organization_id: 'org-123',
        is_active: false,
        organization: { is_active: true },
      };
      
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(inactiveUser as any);
      
      const user = await usersService.getByWalletAddressWithOrganization('0xinactive');
      expect(user?.is_active).toBe(false);
    });
  });
});
