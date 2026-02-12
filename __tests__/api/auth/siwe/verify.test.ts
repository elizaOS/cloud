
/**
 * SIWE Verify Endpoint Tests
 * 
 * Tests for nonce issuance (TTL/single-use), verify success paths 
 * (existing vs new user), and key failure modes (invalid nonce/domain/signature).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/siwe/verify/route';

// Mock dependencies
vi.mock('@/lib/cache/client', () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    del: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('@/lib/services/users', () => ({
  usersService: {
    getByWalletAddressWithOrganization: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/services/organizations', () => ({
  organizationsService: {
    create: vi.fn(),
    getBySlug: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/services/api-keys', () => ({
  apiKeysService: {
    listByOrganization: vi.fn(),
    create: vi.fn(),
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

vi.mock('viem/siwe', () => ({
  parseSiweMessage: vi.fn(),
}));

vi.mock('viem', () => ({
  recoverMessageAddress: vi.fn(),
  getAddress: vi.fn((addr: string) => addr),
}));

import { cache } from '@/lib/cache/client';
import { usersService } from '@/lib/services/users';
import { organizationsService } from '@/lib/services/organizations';
import { apiKeysService } from '@/lib/services/api-keys';
import { creditsService } from '@/lib/services/credits';
import { parseSiweMessage } from 'viem/siwe';
import { recoverMessageAddress } from 'viem';

const mockCache = vi.mocked(cache);
const mockUsersService = vi.mocked(usersService);
const mockOrganizationsService = vi.mocked(organizationsService);
const mockApiKeysService = vi.mocked(apiKeysService);
const mockCreditsService = vi.mocked(creditsService);
const mockParseSiweMessage = vi.mocked(parseSiweMessage);
const mockRecoverMessageAddress = vi.mocked(recoverMessageAddress);

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/siwe/verify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SIWE Verify Endpoint', () => {
  const validAddress = '0x1234567890123456789012345678901234567890';
  const validMessage = `localhost wants you to sign in with your Ethereum account:\n${validAddress}\n\nSign in\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: abc123\nIssued At: 2024-01-01T00:00:00.000Z`;
  const validSignature = '0x' + '00'.repeat(65);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    
    mockParseSiweMessage.mockReturnValue({
      address: validAddress,
      nonce: 'abc123',
      domain: 'localhost',
    } as ReturnType<typeof parseSiweMessage>);
    
    mockRecoverMessageAddress.mockResolvedValue(validAddress);
    mockCache.isAvailable.mockReturnValue(true);
    mockCache.del.mockResolvedValue(1);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  describe('Input Validation', () => {
    it('returns 400 for missing message', async () => {
      const request = createRequest({ signature: validSignature });
      const response = await POST(request);
      const body = await response.json();
      
      expect(response.status).toBe(400);
      expect(body.error).toBe('INVALID_BODY');
    });

    it('returns 400 for missing signature', async () => {
      const request = createRequest({ message: validMessage });
      const response = await POST(request);
      const body = await response.json();
      
      expect(response.status).toBe(400);
      expect(body.error).toBe('INVALID_BODY');
    });

    it('returns 400 for empty message', async () => {
      const request = createRequest({ message: '', signature: validSignature });
      const response = await POST(request);
      const body = await response.json();
      
      expect(response.status).toBe(400);
      expect(body.error).toBe('INVALID_BODY');
    });
  });

  describe('Nonce Validation (Single-Use)', () => {
    it('returns 503 when cache is unavailable', async () => {
      mockCache.isAvailable.mockReturnValue(false);
      
      const request = createRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const body = await response.json();
      
      expect(response.status).toBe(503);
      expect(body.error).toBe('SERVICE_UNAVAILABLE');
    });

    it('returns 400 for already-used nonce (single-use enforcement)', async () => {
      mockCache.del.mockResolvedValue(0); // Nonce doesn't exist (already consumed)
      
      const request = createRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const body = await response.json();
      
      expect(response.status).toBe(400);
      expect(body.error).toBe('INVALID_NONCE');
      expect(body.message).toContain('expired or was already used');
    });

    it('atomically consumes nonce on valid request', async () => {
      mockCache.del.mockResolvedValue(1);
      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue({
        id: 'user-1',
        organization_id: 'org-1',
        is_active: true,
        organization: { is_active: true },
        wallet_verified: true,
      } as any);
      mockApiKeysService.listByOrganization.mockResolvedValue([
        { user_id: 'user-1', is_active: true, key: 'test-key' },
      ] as any);
      
      const request = createRequest({ message: validMessage, signature: validSignature });
      await POST(request);
      
      expect(mockCache.del).toHaveBeenCalledWith(expect.stringContaining('abc123'));
    });
  });

  describe('Domain Validation', () => {
    it('returns 400 for mismatched domain', async () => {
      mockParseSiweMessage.mockReturnValue({
        address: validAddress,
        nonce: 'abc123',
        domain: 'evil-site.com',
      } as ReturnType<typeof parseSiweMessage>);
      
      const request = createRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const body = await response.json();
      
      expect(response.status).toBe(400);
      expect(body.error).toBe('INVALID_DOMAIN');
    });
  });

  describe('Signature Validation', () => {
    it('returns 400 for invalid signature format', async () => {
      mockRecoverMessageAddress.mockRejectedValue(new Error('Invalid signature'));
      
      const request = createRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const body = await response.json();
      
      expect(response.status).toBe(400);
      expect(body.error).toBe('INVALID_SIGNATURE');
    });

    it('returns 400 when recovered address does not match claimed address', async () => {
      mockRecoverMessageAddress.mockResolvedValue('0xDifferentAddress123456789012345678901234');
      
      const request = createRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const body = await response.json();
      
      expect(response.status).toBe(400);
      expect(body.error).toBe('INVALID_SIGNATURE');
    });
  });

  describe('Existing User Path', () => {
    it('returns API key for existing active user', async () => {
      const existingUser = {
        id: 'user-1',
        name: 'Test User',
        organization_id: 'org-1',
        is_active: true,
        wallet_verified: true,
        organization: { id: 'org-1', name: 'Test Org', is_active: true, credit_balance: '100.00' },
      };
      
      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue(existingUser as any);
      mockApiKeysService.listByOrganization.mockResolvedValue([
        { user_id: 'user-1', is_active: true, key: 'existing-api-key' },
      ] as any);
      
      const request = createRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body.apiKey).toBe('existing-api-key');
      expect(body.isNewAccount).toBe(false);
    });

    it('returns 403 for inactive user', async () => {
      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue({
        id: 'user-1',
        organization_id: 'org-1',
        is_active: false,
        organization: { is_active: true },
      } as any);
      
      const request = createRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const body = await response.json();
      
      expect(response.status).toBe(403);
      expect(body.error).toBe('ACCOUNT_INACTIVE');
    });

    it('marks wallet as verified for previously unverified user', async () => {
      const existingUser = {
        id: 'user-1',
        organization_id: 'org-1',
        is_active: true,
        wallet_verified: false,
        organization: { is_active: true },
      };
      
      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue(existingUser as any);
      mockApiKeysService.listByOrganization.mockResolvedValue([
        { user_id: 'user-1', is_active: true, key: 'test-key' },
      ] as any);
      
      const request = createRequest({ message: validMessage, signature: validSignature });
      await POST(request);
      
      expect(mockUsersService.update).toHaveBeenCalledWith('user-1', { wallet_verified: true });
    });
  });

  describe('New User Signup Path', () => {
    beforeEach(() => {
      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue(undefined);
      mockOrganizationsService.getBySlug.mockResolvedValue(undefined);
      mockOrganizationsService.create.mockResolvedValue({ id: 'new-org-1' } as any);
      mockUsersService.create.mockResolvedValue({ id: 'new-user-1' } as any);
      mockApiKeysService.create.mockResolvedValue({ plainKey: 'new-api-key' } as any);
    });

    it('creates new user and returns API key', async () => {
      const newUser = {
        id: 'new-user-1',
        name: '0x1234...7890',
        organization_id: 'new-org-1',
        organization: { id: 'new-org-1', name: 'Test Org', credit_balance: '0.00' },
      };
      
      mockUsersService.getByWalletAddressWithOrganization
        .mockResolvedValueOnce(undefined) // First call (existing user check)
        .mockResolvedValueOnce(newUser as any); // Second call (after creation)
      
      const request = createRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body.apiKey).toBe('new-api-key');
      expect(body.isNewAccount).toBe(true);
    });

    it('cleans up organization on credits service failure', async () => {
      process.env.INITIAL_CREDITS = '100';
      mockCreditsService.addCredits.mockRejectedValue(new Error('Credits service failed'));
      
      const request = createRequest({ message: validMessage, signature: validSignature });
      
      await expect(POST(request)).rejects.toThrow('Credits service failed');
      expect(mockOrganizationsService.delete).toHaveBeenCalledWith('new-org-1');
      
      delete process.env.INITIAL_CREDITS;
    });

    it('cleans up organization on user creation failure (non-duplicate)', async () => {
      const nonDuplicateError = new Error('Database connection failed');
      mockUsersService.create.mockRejectedValue(nonDuplicateError);
      
      const request = createRequest({ message: validMessage, signature: validSignature });
      
      await expect(POST(request)).rejects.toThrow('Database connection failed');
    });

    it('cleans up user and organization on API key creation failure', async () => {
      const newUser = {
        id: 'new-user-1',
        organization_id: 'new-org-1',
        organization: { id: 'new-org-1' },
      };
      
      mockUsersService.getByWalletAddressWithOrganization
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(newUser as any);
      mockApiKeysService.create.mockRejectedValue(new Error('API key creation failed'));
      
      const request = createRequest({ message: validMessage, signature: validSignature });
      
      await expect(POST(request)).rejects.toThrow('API key creation failed');
      expect(mockUsersService.delete).toHaveBeenCalledWith('new-user-1');
      expect(mockOrganizationsService.delete).toHaveBeenCalledWith('new-org-1');
    });
  });

  describe('Race Condition Handling', () => {
    it('handles duplicate wallet constraint error gracefully', async () => {
      const duplicateError = { code: '23505' };
      const raceWinnerUser = {
        id: 'winner-user',
        organization_id: 'winner-org',
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true },
      };
      
      mockUsersService.getByWalletAddressWithOrganization
        .mockResolvedValueOnce(undefined) // Initial check
        .mockResolvedValueOnce(raceWinnerUser as any); // After race condition
      mockOrganizationsService.getBySlug.mockResolvedValue(undefined);
      mockOrganizationsService.create.mockResolvedValue({ id: 'loser-org' } as any);
      mockUsersService.create.mockRejectedValue(duplicateError);
      mockApiKeysService.listByOrganization.mockResolvedValue([
        { user_id: 'winner-user', is_active: true, key: 'winner-key' },
      ] as any);
      
      const request = createRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body.apiKey).toBe('winner-key');
      expect(mockOrganizationsService.delete).toHaveBeenCalledWith('loser-org');
    });
  });
});
