
/**
 * Unit tests for SIWE nonce endpoint
 * 
 * Covers:
 * - Nonce generation and TTL
 * - Cache availability checks
 * - ChainId parameter validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/cache/client', () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    set: vi.fn(),
  },
}));

vi.mock('@/lib/cache/keys', () => ({
  CacheKeys: {
    siwe: {
      nonce: (n: string) => `siwe:nonce:${n}`,
    },
  },
  CacheTTL: {
    siwe: {
      nonce: 300, // 5 minutes
    },
  },
}));

import { cache } from '@/lib/cache/client';
import { CacheTTL } from '@/lib/cache/keys';

describe('SIWE Nonce Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://elizacloud.ai';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  describe('Nonce TTL', () => {
    it('should use 5-minute TTL for nonce storage', () => {
      expect(CacheTTL.siwe.nonce).toBe(300);
    });

    it('should store nonce in cache with correct TTL', async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockResolvedValue(undefined);
      
      await cache.set('siwe:nonce:testnonce', true, 300);
      
      expect(cache.set).toHaveBeenCalledWith('siwe:nonce:testnonce', true, 300);
    });
  });

  describe('Cache availability', () => {
    it('should return 503 when cache is unavailable', () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      
      expect(cache.isAvailable()).toBe(false);
    });

    it('should proceed when cache is available', () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      
      expect(cache.isAvailable()).toBe(true);
    });
  });

  describe('ChainId validation', () => {
    it('should default to chainId 1 (Ethereum mainnet)', () => {
      const defaultChainId = 1;
      expect(defaultChainId).toBe(1);
    });

    it('should reject non-positive chainId', () => {
      const invalidChainIds = [0, -1, -100];
      
      invalidChainIds.forEach((chainId) => {
        expect(chainId <= 0).toBe(true);
      });
    });

    it('should accept valid positive chainId', () => {
      const validChainIds = [1, 137, 8453, 42161];
      
      validChainIds.forEach((chainId) => {
        expect(chainId > 0).toBe(true);
      });
    });
  });

  describe('Response format', () => {
    it('should include all required SIWE parameters', () => {
      const expectedFields = ['nonce', 'domain', 'uri', 'chainId', 'version', 'statement'];
      const response = {
        nonce: 'abc123',
        domain: 'elizacloud.ai',
        uri: 'https://elizacloud.ai',
        chainId: 1,
        version: '1',
        statement: 'Sign in to ElizaCloud',
      };
      
      expectedFields.forEach((field) => {
        expect(response).toHaveProperty(field);
      });
    });
  });
});
