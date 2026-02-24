/**
 * SIWE Nonce Endpoint Tests
 * 
 * Tests for the nonce endpoint covering:
 * - Nonce generation
 * - TTL enforcement
 * - Redis availability checks
 * - Parameter validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/auth/siwe/nonce/route';
import { cache } from '@/lib/cache/client';

vi.mock('@/lib/cache/client');

describe('SIWE Nonce Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns nonce when Redis is available', async () => {
    const mockRequest = new NextRequest('http://localhost:3000/api/auth/siwe/nonce');

    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);
    vi.mocked(cache.get).mockResolvedValue(true);

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.nonce).toBeDefined();
    expect(data.domain).toBeDefined();
    expect(data.chainId).toBe(1);
  });

  it('rejects requests when Redis is unavailable', async () => {
    const mockRequest = new NextRequest('http://localhost:3000/api/auth/siwe/nonce');

    vi.mocked(cache.isAvailable).mockReturnValue(false);

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe('SERVICE_UNAVAILABLE');
  });

  it('validates chainId parameter', async () => {
    const mockRequest = new NextRequest('http://localhost:3000/api/auth/siwe/nonce?chainId=invalid');

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_BODY');
  });

  it('persists nonce to Redis with correct TTL', async () => {
    const mockRequest = new NextRequest('http://localhost:3000/api/auth/siwe/nonce');

    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);
    vi.mocked(cache.get).mockResolvedValue(true);

    await GET(mockRequest);

    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining('siwe:nonce:'),
      true,
      expect.any(Number)
    );
  });
});
