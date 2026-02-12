
/**
 * Integration tests for SIWE verify endpoint
 * 
 * Covers:
 * - Nonce issuance and consumption (TTL, single-use)
 * - Verify success paths (existing user, new user signup)
 * - Failure modes (invalid nonce, domain mismatch, signature verification)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../verify/route';
import { cache } from '@/lib/cache/client';
import { CacheKeys } from '@/lib/cache/keys';
import { usersService } from '@/lib/services/users';
import { organizationsService } from '@/lib/services/organizations';
import { apiKeysService } from '@/lib/services/api-keys';
import { abuseDetectionService } from '@/lib/services/abuse-detection';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import type { NextRequest } from 'next/server';

// Test wallet for consistent signatures
const TEST_PRIVATE_KEY = generatePrivateKey();
const TEST_ACCOUNT = privateKeyToAccount(TEST_PRIVATE_KEY);
const TEST_ADDRESS = TEST_ACCOUNT.address;

// Mock environment
const ORIGINAL_ENV = process.env;
beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    NEXT_PUBLIC_APP_URL: 'https://test.example.com',
  };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.clearAllMocks();
});

function createMockRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: new Headers({
      'x-real-ip': '192.168.1.1',
      'user-agent': 'test-agent',
    }),
  } as NextRequest;
}

async function createValidSiweMessage(nonce: string) {
  const message = createSiweMessage({
    address: TEST_ADDRESS,
    chainId: 1,
    domain: 'test.example.com',
    nonce,
    uri: 'https://test.example.com',
    version: '1',
  });
  
  const signature = await TEST_ACCOUNT.signMessage({ message });
  return { message, signature };
}

describe('SIWE Verify - Nonce Management', () => {
  it('should reject requests when cache is unavailable', async () => {
    vi.spyOn(cache, 'isAvailable').mockReturnValue(false);
    
    const { message, signature } = await createValidSiweMessage('test-nonce');
    const request = createMockRequest({ message, signature });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(503);
    expect(data.error).toBe('SERVICE_UNAVAILABLE');
  });

  it('should reject expired/missing nonces (single-use enforcement)', async () => {
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'del').mockResolvedValue(0); // Nonce not found
    
    const { message, signature } = await createValidSiweMessage('expired-nonce');
    const request = createMockRequest({ message, signature });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_NONCE');
    expect(data.message).toContain('expired or was already used');
  });

  it('should consume nonce atomically on valid request', async () => {
    const nonce = 'valid-nonce-123';
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    const delSpy = vi.spyOn(cache, 'del').mockResolvedValue(1);
    
    vi.spyOn(usersService, 'getByWalletAddressWithOrganization').mockResolvedValue({
      id: 'user-1',
      wallet_address: TEST_ADDRESS.toLowerCase(),
      wallet_verified: true,
      organization_id: 'org-1',
      is_active: true,
      organization: { id: 'org-1', is_active: true, credit_balance: '10.00' },
    } as any);
    
    vi.spyOn(apiKeysService, 'listByOrganization').mockResolvedValue([
      { id: 'key-1', user_id: 'user-1', is_active: true, key: 'test-key' },
    ] as any);
    
    const { message, signature } = await createValidSiweMessage(nonce);
    const request = createMockRequest({ message, signature });
    
    await POST(request);
    
    expect(delSpy).toHaveBeenCalledWith(CacheKeys.siwe.nonce(nonce));
    expect(delSpy).toHaveBeenCalledTimes(1);
  });
});

describe('SIWE Verify - Domain Validation', () => {
  it('should reject messages with wrong domain', async () => {
    const nonce = 'nonce-wrong-domain';
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'del').mockResolvedValue(1);
    
    // Create message with different domain
    const wrongDomainMessage = createSiweMessage({
      address: TEST_ADDRESS,
      chainId: 1,
      domain: 'evil.com', // Wrong domain
      nonce,
      uri: 'https://evil.com',
      version: '1',
    });
    
    const signature = await TEST_ACCOUNT.signMessage({ message: wrongDomainMessage });
    const request = createMockRequest({ message: wrongDomainMessage, signature });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_DOMAIN');
  });

  it('should accept messages with correct domain', async () => {
    const nonce = 'nonce-correct-domain';
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'del').mockResolvedValue(1);
    
    vi.spyOn(usersService, 'getByWalletAddressWithOrganization').mockResolvedValue({
      id: 'user-1',
      wallet_address: TEST_ADDRESS.toLowerCase(),
      organization_id: 'org-1',
      is_active: true,
      organization: { id: 'org-1', is_active: true },
    } as any);
    
    vi.spyOn(apiKeysService, 'listByOrganization').mockResolvedValue([
      { id: 'key-1', user_id: 'user-1', is_active: true, key: 'test-key' },
    ] as any);
    
    const { message, signature } = await createValidSiweMessage(nonce);
    const request = createMockRequest({ message, signature });
    
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});

describe('SIWE Verify - Signature Verification', () => {
  it('should reject invalid signatures', async () => {
    const nonce = 'nonce-bad-sig';
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'del').mockResolvedValue(1);
    
    const { message } = await createValidSiweMessage(nonce);
    const fakeSignature = '0xdeadbeef' + '0'.repeat(122); // Invalid signature
    
    const request = createMockRequest({ message, signature: fakeSignature });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_SIGNATURE');
  });

  it('should reject signatures from different wallet', async () => {
    const nonce = 'nonce-wrong-signer';
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'del').mockResolvedValue(1);
    
    // Create message claiming one address
    const fakeClaim = createSiweMessage({
      address: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      domain: 'test.example.com',
      nonce,
      uri: 'https://test.example.com',
      version: '1',
    });
    
    // But sign with TEST_ACCOUNT (different address)
    const signature = await TEST_ACCOUNT.signMessage({ message: fakeClaim });
    const request = createMockRequest({ message: fakeClaim, signature });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_SIGNATURE');
  });
});

describe('SIWE Verify - Existing User Path', () => {
  it('should return existing user and API key', async () => {
    const nonce = 'nonce-existing';
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'del').mockResolvedValue(1);
    
    const existingUser = {
      id: 'user-existing',
      wallet_address: TEST_ADDRESS.toLowerCase(),
      wallet_verified: true,
      organization_id: 'org-existing',
      is_active: true,
      name: 'Existing User',
      organization: {
        id: 'org-existing',
        name: 'Existing Org',
        is_active: true,
        credit_balance: '50.00',
      },
    };
    
    vi.spyOn(usersService, 'getByWalletAddressWithOrganization').mockResolvedValue(existingUser as any);
    vi.spyOn(apiKeysService, 'listByOrganization').mockResolvedValue([
      { id: 'key-1', user_id: 'user-existing', is_active: true, key: 'existing-api-key' },
    ] as any);
    
    const { message, signature } = await createValidSiweMessage(nonce);
    const request = createMockRequest({ message, signature });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.isNewAccount).toBe(false);
    expect(data.apiKey).toBe('existing-api-key');
    expect(data.user.id).toBe('user-existing');
    expect(data.organization.creditBalance).toBe('50.00');
  });

  it('should mark wallet as verified for unverified users', async () => {
    const nonce = 'nonce-unverified';
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'del').mockResolvedValue(1);
    
    const unverifiedUser = {
      id: 'user-unverified',
      wallet_address: TEST_ADDRESS.toLowerCase(),
      wallet_verified: false, // Not yet verified
      organization_id: 'org-1',
      is_active: true,
      organization: { id: 'org-1', is_active: true },
    };
    
    vi.spyOn(usersService, 'getByWalletAddressWithOrganization').mockResolvedValue(unverifiedUser as any);
    const updateSpy = vi.spyOn(usersService, 'update').mockResolvedValue(undefined);
    vi.spyOn(apiKeysService, 'listByOrganization').mockResolvedValue([
      { id: 'key-1', user_id: 'user-unverified', is_active: true, key: 'test-key' },
    ] as any);
    
    const { message, signature } = await createValidSiweMessage(nonce);
    const request = createMockRequest({ message, signature });
    
    await POST(request);
    
    expect(updateSpy).toHaveBeenCalledWith('user-unverified', { wallet_verified: true });
  });

  it('should reject inactive users', async () => {
    const nonce = 'nonce-inactive';
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'del').mockResolvedValue(1);
    
    vi.spyOn(usersService, 'getByWalletAddressWithOrganization').mockResolvedValue({
      id: 'user-inactive',
      is_active: false,
      organization_id: 'org-1',
      organization: { is_active: true },
    } as any);
    
    const { message, signature } = await createValidSiweMessage(nonce);
    const request = createMockRequest({ message, signature });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(403);
    expect(data.error).toBe('ACCOUNT_INACTIVE');
  });
});

describe('SIWE Verify - New User Signup', () => {
  it('should create new user with organization and credits', async () => {
    const nonce = 'nonce-signup';
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'del').mockResolvedValue(1);
    
    // First call: no existing user (signup path)
    // Second call: fetch newly created user
    vi.spyOn(usersService, 'getByWalletAddressWithOrganization')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        id: 'user-new',
        wallet_address: TEST_ADDRESS.toLowerCase(),
        wallet_verified: true,
        organization_id: 'org-new',
        is_active: true,
        name: TEST_ADDRESS.slice(0, 6) + '...' + TEST_ADDRESS.slice(-4),
        organization: {
          id: 'org-new',
          name: `${TEST_ADDRESS.slice(0, 6)}...'s Organization`,
          is_active: true,
          credit_balance: '10.00',
        },
      } as any);
    
    vi.spyOn(abuseDetectionService, 'checkSignupAbuse').mockResolvedValue({ allowed: true });
    vi.spyOn(organizationsService, 'getBySlug').mockResolvedValue(null);
    
    // Mock transaction execution
    const createOrgSpy = vi.spyOn(organizationsService, 'create').mockResolvedValue({
      id: 'org-new',
      slug: 'test-slug',
      credit_balance: '10.00',
    } as any);
    
    const createUserSpy = vi.spyOn(usersService, 'create').mockResolvedValue({
      id: 'user-new',
      wallet_address: TEST_ADDRESS.toLowerCase(),
    } as any);
    
    vi.spyOn(apiKeysService, 'create').mockResolvedValue({
      id: 'key-new',
      plainKey: 'new-api-key-12345',
    } as any);
    
    const { message, signature } = await createValidSiweMessage(nonce);
    const request = createMockRequest({ message, signature });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.isNewAccount).toBe(true);
    expect(data.apiKey).toBe('new-api-key-12345');
    expect(data.user.id).toBe('user-new');
    expect(createOrgSpy).toHaveBeenCalled();
    expect(createUserSpy).toHaveBeenCalled();
  });

  it('should block signup when abuse detection triggers', async () => {
    const nonce = 'nonce-abuse';
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'del').mockResolvedValue(1);
    
    vi.spyOn(usersService, 'getByWalletAddressWithOrganization').mockResolvedValue(undefined);
    vi.spyOn(abuseDetectionService, 'checkSignupAbuse').mockResolvedValue({
      allowed: false,
      reason: 'Too many signups from this IP',
    });
    
    const { message, signature } = await createValidSiweMessage(nonce);
    const request = createMockRequest({ message, signature });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(403);
    expect(data.error).toBe('SIGNUP_BLOCKED');
    expect(data.message).toContain('Too many signups');
  });

  it('should handle race condition when wallet already exists', async () => {
    const nonce = 'nonce-race';
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'del').mockResolvedValue(1);
    
    // Simulate race: first check returns no user, but insert fails with duplicate
    vi.spyOn(usersService, 'getByWalletAddressWithOrganization')
      .mockResolvedValueOnce(undefined) // Initial check
      .mockResolvedValueOnce({
        // Race winner's user
        id: 'user-race-winner',
        wallet_address: TEST_ADDRESS.toLowerCase(),
        organization_id: 'org-race-winner',
        is_active: true,
        organization: { id: 'org-race-winner', is_active: true },
      } as any);
    
    vi.spyOn(abuseDetectionService, 'checkSignupAbuse').mockResolvedValue({ allowed: true });
    vi.spyOn(organizationsService, 'getBySlug').mockResolvedValue(null);
    vi.spyOn(organizationsService, 'create').mockResolvedValue({ id: 'org-temp' } as any);
    
    // Simulate duplicate key error (23505)
    const duplicateError = new Error('duplicate key value');
    (duplicateError as any).code = '23505';
    vi.spyOn(usersService, 'create').mockRejectedValue(duplicateError);
    
    const deleteSpy = vi.spyOn(organizationsService, 'delete').mockResolvedValue(undefined);
    vi.spyOn(apiKeysService, 'listByOrganization').mockResolvedValue([
      { id: 'key-1', user_id: 'user-race-winner', is_active: true, key: 'race-key' },
    ] as any);
    
    const { message, signature } = await createValidSiweMessage(nonce);
    const request = createMockRequest({ message, signature });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.isNewAccount).toBe(false); // Returns existing user
    expect(data.apiKey).toBe('race-key');
    expect(deleteSpy).toHaveBeenCalledWith('org-temp'); // Cleanup orphaned org
  });
});

describe('SIWE Verify - Request Validation', () => {
  it('should reject malformed JSON', async () => {
    const request = {
      json: async () => { throw new Error('Invalid JSON'); },
      headers: new Headers(),
    } as NextRequest;
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_BODY');
  });

  it('should reject missing message field', async () => {
    const request = createMockRequest({ signature: '0x123' });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_BODY');
  });

  it('should reject missing signature field', async () => {
    const request = createMockRequest({ message: 'test message' });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_BODY');
  });

  it('should handle signatures without 0x prefix', async () => {
    const nonce = 'nonce-no-prefix';
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'del').mockResolvedValue(1);
    
    vi.spyOn(usersService, 'getByWalletAddressWithOrganization').mockResolvedValue({
      id: 'user-1',
      wallet_address: TEST_ADDRESS.toLowerCase(),
      organization_id: 'org-1',
      is_active: true,
      organization: { id: 'org-1', is_active: true },
    } as any);
    
    vi.spyOn(apiKeysService, 'listByOrganization').mockResolvedValue([
      { id: 'key-1', user_id: 'user-1', is_active: true, key: 'test-key' },
    ] as any);
    
    const { message, signature } = await createValidSiweMessage(nonce);
    const signatureWithoutPrefix = signature.slice(2); // Remove 0x
    
    const request = createMockRequest({ message, signature: signatureWithoutPrefix });
    
    const response = await POST(request);
    expect(response.status).toBe(200); // Should still work
  });
});
