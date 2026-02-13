
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '../nonce/route';
import { cache } from '@/lib/cache/client';
import { CacheKeys } from '@/lib/cache/keys';

// Mock cache client
vi.mock('@/lib/cache/client', () => ({
  cache: {
    isAvailable: vi.fn(),
    set: vi.fn(),
  },
}));

// Mock rate limit middleware
vi.mock('@/lib/middleware/rate-limit', () => ({
  withRateLimit: (handler: any) => handler,
  RateLimitPresets: { STRICT: {} },
}));

describe('SIWE Nonce Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Nonce Issuance', () => {
    it('should return a valid nonce when cache is available', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.nonce).toBeDefined();
      expect(typeof data.nonce).toBe('string');
      expect(data.nonce.length).toBeGreaterThan(0);
      expect(data.domain).toBeDefined();
      expect(data.expiresIn).toBe(600); // 10 minutes
    });

    it('should store nonce in cache with correct TTL', async () => {
      const response = await GET();
      const data = await response.json();

      expect(cache.set).toHaveBeenCalledWith(
        CacheKeys.siwe.nonce(data.nonce),
        '1',
        600,
      );
    });

    it('should return 503 when cache is unavailable', async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('SERVICE_UNAVAILABLE');
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('should generate unique nonces on consecutive calls', async () => {
      const response1 = await GET();
      const data1 = await response1.json();

      const response2 = await GET();
      const data2 = await response2.json();

      expect(data1.nonce).not.toBe(data2.nonce);
    });

    it('should enforce 10-minute TTL (600 seconds)', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.expiresIn).toBe(600);
      expect(cache.set).toHaveBeenCalledWith(
        expect.any(String),
        '1',
        600,
      );
    });
  });

  describe('Domain Validation', () => {
    it('should return the correct domain for message construction', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.domain).toBeDefined();
      // Domain should be a valid hostname without protocol
      expect(data.domain).not.toMatch(/^https?:\/\//);
    });
  });

  describe('Error Handling', () => {
    it('should handle cache.set failures gracefully', async () => {
      vi.mocked(cache.set).mockRejectedValue(new Error('Cache write failed'));

      const response = await GET();

      // Should still return 200 since cache failure is logged but not fatal
      expect(response.status).toBe(200);
    });
  });
});
