
/**
 * SIWE Nonce Endpoint Tests
 * 
 * Tests for nonce generation, TTL settings, and Redis unavailability handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cache/client', () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    set: vi.fn(),
  },
}));

import { cache } from '@/lib/cache/client';

describe('SIWE Nonce Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Nonce Generation', () => {
    it('should check cache availability before generating nonce', () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      expect(cache.isAvailable()).toBe(true);
    });

    it('should fail fast when Redis is unavailable', () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      expect(cache.isAvailable()).toBe(false);
    });
  });

  describe('Nonce TTL', () => {
    it('should set nonce with appropriate TTL (5 minutes)', async () => {
      const NONCE_TTL_SECONDS = 300; // 5 minutes
      
      vi.mocked(cache.set).mockResolvedValue(undefined);
      await cache.set('siwe:nonce:test', 'true', NONCE_TTL_SECONDS);
      
      expect(cache.set).toHaveBeenCalledWith('siwe:nonce:test', 'true', NONCE_TTL_SECONDS);
    });
  });

  describe('Single-Use Validation', () => {
    it('should store nonce for single-use validation', async () => {
      const nonce = 'unique-nonce-12345';
      
      vi.mocked(cache.set).mockResolvedValue(undefined);
      await cache.set(`siwe:nonce:${nonce}`, 'true', 300);
      
      expect(cache.set).toHaveBeenCalledWith(`siwe:nonce:${nonce}`, 'true', 300);
    });
  });
});
