
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../verify/route';
import { NextRequest } from 'next/server';
import { cache } from '@/lib/cache/client';
import { usersService } from '@/lib/services/users';
import { organizationsService } from '@/lib/services/organizations';
import { apiKeysService } from '@/lib/services/api-keys';
import { creditsService } from '@/lib/services/credits';
import { abuseDetectionService } from '@/lib/services/abuse-detection';
import { generateSiweMessage, signMessage } from '@/lib/test-utils/siwe-helpers';

// Mock all dependencies
vi.mock('@/lib/cache/client');
vi.mock('@/lib/services/users');
vi.mock('@/lib/services/organizations');
vi.mock('@/lib/services/api-keys');
vi.mock('@/lib/services/credits');
vi.mock('@/lib/services/abuse-detection');
vi.mock('@/lib/middleware/rate-limit', () => ({
  withRateLimit: (handler: any) => handler,
  RateLimitPresets: { STRICT: {} },
}));

describe('SIWE Verify Endpoint', () => {
  const validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
  const validNonce = 'test-nonce-123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(abuseDetectionService.checkSignupAbuse).mockResolvedValue({
      allowed: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Existing User Login', () => {
    it('should authenticate existing user and return API key', async () => {
      const mockUser = {
        id: 'user-123',
        wallet_address: validAddress.toLowerCase(),
        wallet_verified: true,
        is_active: true,
        organization_id: 'org-123',
        organization: {
          id: 'org-123',
          name: 'Test Org',
          credit_balance: '100.00',
          is_active: true,
        },
      };

      const mockApiKey = 'test-api-key';

      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(mockUser as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { id: 'key-1', user_id: 'user-123', is_active: true, key: mockApiKey },
      ] as any);

      // Mock nonce consumption
      vi.mocked(cache.get).mockResolvedValue('1');
      vi.mocked(cache.del).mockResolvedValue(1);

      const { message, signature } = await generateValidSiweRequest(validAddress, validNonce);

      const request = new NextRequest('http://localhost/api/auth/siwe/verify', {
        method: 'POST',
        body: JSON.stringify({ message, signature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.apiKey).toBe(mockApiKey);
      expect(data.isNewAccount).toBe(false);
      expect(data.user.id).toBe('user-123');
    });

    it('should mark wallet as verified for Privy users', async () => {
      const mockUser = {
        id: 'user-123',
        wallet_address: validAddress.toLowerCase(),
        wallet_verified: false,
        privy_user_id: 'privy-123',
        is_active: true,
        organization_id: 'org-123',
        organization: { id: 'org-123', is_active: true },
      };

      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(mockUser as any);
      vi.mocked(usersService.update).mockResolvedValue(undefined);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { id: 'key-1', user_id: 'user-123', is_active: true, key: 'api-key' },
      ] as any);

      const { message, signature } = await generateValidSiweRequest(validAddress, validNonce);
      const request = new NextRequest('http://localhost/api/auth/siwe/verify', {
        method: 'POST',
        body: JSON.stringify({ message, signature }),
      });

      await POST(request);

      expect(usersService.update).toHaveBeenCalledWith('user-123', {
        wallet_verified: true,
      });
    });
  });

  describe('New User Signup', () => {
    it('should create new user with organization and API key', async () => {
      const mockOrg = { id: 'org-123', name: 'Test Org', slug: 'test-org' };
      const mockUser = {
        id: 'user-123',
        wallet_address: validAddress.toLowerCase(),
        organization_id: 'org-123',
      };
      const mockApiKey = 'new-api-key';

      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(undefined);
      vi.mocked(organizationsService.getBySlug).mockResolvedValue(null);
      vi.mocked(organizationsService.create).mockResolvedValue(mockOrg as any);
      vi.mocked(usersService.create).mockResolvedValue(mockUser as any);
      vi.mocked(apiKeysService.create).mockResolvedValue({
        key: 'hashed-key',
        plainKey: mockApiKey,
      } as any);

      const { message, signature } = await generateValidSiweRequest(validAddress, validNonce);
      const request = new NextRequest('http://localhost/api/auth/siwe/verify', {
        method: 'POST',
        body: JSON.stringify({ message, signature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(true);
      expect(data.apiKey).toBe(mockApiKey);
    });

    it('should grant initial credits to new users', async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(undefined);
      vi.mocked(organizationsService.getBySlug).mockResolvedValue(null);
      vi.mocked(organizationsService.create).mockResolvedValue({ id: 'org-123' } as any);
      vi.mocked(creditsService.addCredits).mockResolvedValue(undefined);
      vi.mocked(usersService.create).mockResolvedValue({ id: 'user-123' } as any);
      vi.mocked(apiKeysService.create).mockResolvedValue({ plainKey: 'key' } as any);

      const { message, signature } = await generateValidSiweRequest(validAddress, validNonce);
      const request = new NextRequest('http://localhost/api/auth/siwe/verify', {
        method: 'POST',
        body: JSON.stringify({ message, signature }),
      });

      await POST(request);

      expect(creditsService.addCredits).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
          metadata: expect.objectContaining({
            type: 'initial_free_credits',
            source: 'siwe_signup',
          }),
        }),
        expect.anything(),
      );
    });
  });

  describe('Nonce Validation', () => {
    it('should reject request when nonce does not exist', async () => {
      vi.mocked(cache.get).mockResolvedValue(null);

      const { message, signature } = await generateValidSiweRequest(validAddress, validNonce);
      const request = new NextRequest('http://localhost/api/auth/siwe/verify', {
        method: 'POST',
        body: JSON.stringify({ message, signature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('INVALID_NONCE');
    });

    it('should reject request when nonce already consumed', async () => {
      vi.mocked(cache.get).mockResolvedValue(null);
      vi.mocked(cache.del).mockResolvedValue(0);

      const { message, signature } = await generateValidSiweRequest(validAddress, validNonce);
      const request = new NextRequest('http://localhost/api/auth/siwe/verify', {
        method: 'POST',
        body: JSON.stringify({ message, signature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('INVALID_NONCE');
    });

    it('should return 503 when cache is unavailable', async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);

      const { message, signature } = await generateValidSiweRequest(validAddress, validNonce);
      const request = new NextRequest('http://localhost/api/auth/siwe/verify', {
        method: 'POST',
        body: JSON.stringify({ message, signature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('Signature Validation', () => {
    it('should reject invalid signature', async () => {
      vi.mocked(cache.get).mockResolvedValue('1');
      vi.mocked(cache.del).mockResolvedValue(1);

      const message = generateSiweMessage(validAddress, validNonce);
      const invalidSignature = '0xinvalidsignature';

      const request = new NextRequest('http://localhost/api/auth/siwe/verify', {
        method: 'POST',
        body: JSON.stringify({ message, signature: invalidSignature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('INVALID_SIGNATURE');
    });

    it('should reject signature from different address', async () => {
      vi.mocked(cache.get).mockResolvedValue('1');
      vi.mocked(cache.del).mockResolvedValue(1);

      const differentAddress = '0x1111111111111111111111111111111111111111';
      const { message, signature } = await generateValidSiweRequest(differentAddress, validNonce);

      const request = new NextRequest('http://localhost/api/auth/siwe/verify', {
        method: 'POST',
        body: JSON.stringify({ message, signature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('INVALID_SIGNATURE');
    });
  });

  describe('Domain Validation', () => {
    it('should reject message with wrong domain', async () => {
      vi.mocked(cache.get).mockResolvedValue('1');
      vi.mocked(cache.del).mockResolvedValue(1);

      const message = generateSiweMessage(validAddress, validNonce, 'evil.com');
      const signature = await signMessage(message, validAddress);

      const request = new NextRequest('http://localhost/api/auth/siwe/verify', {
        method: 'POST',
        body: JSON.stringify({ message, signature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('INVALID_DOMAIN');
    });
  });

  describe('Race Condition Handling', () => {
    it('should handle concurrent signup attempts for same wallet', async () => {
      const mockUser = {
        id: 'user-123',
        wallet_address: validAddress.toLowerCase(),
        organization_id: 'org-123',
      };

      // First call returns undefined (new user), second call returns existing user
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockUser as any);

      // Simulate duplicate key error
      vi.mocked(organizationsService.create).mockRejectedValue({
        code: '23505',
        message: 'duplicate key',
      });

      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { id: 'key-1', user_id: 'user-123', is_active: true, key: 'api-key' },
      ] as any);

      const { message, signature } = await generateValidSiweRequest(validAddress, validNonce);
      const request = new NextRequest('http://localhost/api/auth/siwe/verify', {
        method: 'POST',
        body: JSON.stringify({ message, signature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(false);
    });
  });

  describe('Abuse Detection', () => {
    it('should block signup when abuse detected', async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(undefined);
      vi.mocked(abuseDetectionService.checkSignupAbuse).mockResolvedValue({
        allowed: false,
        reason: 'Too many signups from this IP',
      });

      const { message, signature } = await generateValidSiweRequest(validAddress, validNonce);
      const request = new NextRequest('http://localhost/api/auth/siwe/verify', {
        method: 'POST',
        body: JSON.stringify({ message, signature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('SIGNUP_BLOCKED');
    });
  });
});

// Test helpers
async function generateValidSiweRequest(address: string, nonce: string) {
  const message = generateSiweMessage(address, nonce);
  const signature = await signMessage(message, address);
  return { message, signature };
}
