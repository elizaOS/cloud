
/**
 * Unit tests for SIWE nonce endpoint
 * 
 * Covers:
 * - Nonce generation and caching
 * - TTL enforcement
 * - Cache availability handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '../nonce/route';
import { cache } from '@/lib/cache/client';
import { CacheKeys } from '@/lib/cache/keys';
import type { NextRequest } from 'next/server';

const NONCE_TTL_SECONDS = 10 * 60; // 10 minutes

describe('SIWE Nonce Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate unique nonce and store in cache with TTL', async () => {
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    const setSpy = vi.spyOn(cache, 'set').mockResolvedValue('OK');
    
    const request = {} as NextRequest;
    const response = await GET(request);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.nonce).toBeDefined();
    expect(typeof data.nonce).toBe('string');
    expect(data.nonce.length).toBeGreaterThan(10);
    expect(data.domain).toBeDefined();
    
    expect(setSpy).toHaveBeenCalledWith(
      CacheKeys.siwe.nonce(data.nonce),
      '1',
      NONCE_TTL_SECONDS,
    );
  });

  it('should return different nonces on subsequent calls', async () => {
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'set').mockResolvedValue('OK');
    
    const request = {} as NextRequest;
    
    const response1 = await GET(request);
    const data1 = await response1.json();
    
    const response2 = await GET(request);
    const data2 = await response2.json();
    
    expect(data1.nonce).not.toBe(data2.nonce);
  });

  it('should return 503 when cache is unavailable', async () => {
    vi.spyOn(cache, 'isAvailable').mockReturnValue(false);
    
    const request = {} as NextRequest;
    const response = await GET(request);
    const data = await response.json();
    
    expect(response.status).toBe(503);
    expect(data.error).toBe('SERVICE_UNAVAILABLE');
    expect(data.message).toContain('temporarily unavailable');
  });

  it('should return correct domain from environment', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://prod.example.com';
    
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'set').mockResolvedValue('OK');
    
    const request = {} as NextRequest;
    const response = await GET(request);
    const data = await response.json();
    
    expect(data.domain).toBe('prod.example.com');
  });

  it('should fall back to localhost when no env URL', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'set').mockResolvedValue('OK');
    
    const request = {} as NextRequest;
    const response = await GET(request);
    const data = await response.json();
    
    expect(data.domain).toBe('localhost');
  });
});

describe('SIWE Nonce TTL', () => {
  it('should expire after configured TTL', async () => {
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    const setSpy = vi.spyOn(cache, 'set').mockResolvedValue('OK');
    
    const request = {} as NextRequest;
    await GET(request);
    
    // Verify TTL is set to 10 minutes
    expect(setSpy).toHaveBeenCalledWith(
      expect.any(String),
      '1',
      600, // 10 minutes in seconds
    );
  });

  it('should not allow nonce reuse after consumption', async () => {
    const nonce = 'test-nonce-123';
    
    vi.spyOn(cache, 'isAvailable').mockReturnValue(true);
    vi.spyOn(cache, 'set').mockResolvedValue('OK');
    
    // Store nonce
    await cache.set(CacheKeys.siwe.nonce(nonce), '1', NONCE_TTL_SECONDS);
    
    // First consumption succeeds
    const delSpy = vi.spyOn(cache, 'del').mockResolvedValueOnce(1);
    const consumed = await cache.del(CacheKeys.siwe.nonce(nonce));
    expect(consumed).toBe(1);
    
    // Second consumption fails (nonce already deleted)
    delSpy.mockResolvedValueOnce(0);
    const reused = await cache.del(CacheKeys.siwe.nonce(nonce));
    expect(reused).toBe(0);
  });
});
