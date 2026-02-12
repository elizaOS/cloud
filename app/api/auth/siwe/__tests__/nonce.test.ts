
/**
 * SIWE Nonce Endpoint Tests
 * 
 * Covers:
 * - Nonce generation and storage
 * - Cache availability handling
 * - TTL validation
 */

import { describe, it, expect, vi } from 'vitest';
import { GET as handleNonce } from '../nonce/route';
import { cache } from '@/lib/cache/client';

describe('SIWE Nonce Endpoint', () => {
  it('should generate valid nonce', async () => {
    const req = new Request('http://localhost:3000/api/auth/siwe/nonce');
    const response = await handleNonce(req as any);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data).toHaveProperty('nonce');
    expect(data).toHaveProperty('domain');
    expect(typeof data.nonce).toBe('string');
    expect(data.nonce.length).toBeGreaterThan(0);
  });

  it('should fail when cache unavailable', async () => {
    vi.spyOn(cache, 'isAvailable').mockReturnValue(false);
    
    const req = new Request('http://localhost:3000/api/auth/siwe/nonce');
    const response = await handleNonce(req as any);
    const data = await response.json();
    
    expect(response.status).toBe(503);
    expect(data.error).toBe('SERVICE_UNAVAILABLE');
  });

  it('should store nonce in cache with TTL', async () => {
    const setSpy = vi.spyOn(cache, 'set');
    
    const req = new Request('http://localhost:3000/api/auth/siwe/nonce');
    await handleNonce(req as any);
    
    expect(setSpy).toHaveBeenCalledWith(
      expect.any(String),
      '1',
      { ex: 600 }
    );
  });
});
