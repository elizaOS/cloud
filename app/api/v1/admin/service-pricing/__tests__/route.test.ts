
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PUT } from '../route';
import { requireAdmin } from '@/lib/auth';
import { AuthenticationError, ForbiddenError } from '@/lib/api/errors';

vi.mock('@/lib/auth');
vi.mock('@/db/repositories/service-pricing');
vi.mock('@/lib/cache/client');

describe('Admin Service Pricing API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/admin/service-pricing', () => {
    it('returns 401 when authentication fails', async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new AuthenticationError('Not authenticated'));
      
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing?service_id=test');
      const response = await GET(request);
      
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Not authenticated' });
    });

    it('returns 403 when user is not admin', async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError('Admin required'));
      
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing?service_id=test');
      const response = await GET(request);
      
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Admin required' });
    });
  });

  describe('PUT /api/v1/admin/service-pricing', () => {
    it('returns 401 when authentication fails', async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new AuthenticationError('Not authenticated'));
      
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing', {
        method: 'PUT',
        body: JSON.stringify({
          service_id: 'test',
          method: 'test',
          cost: 1,
          reason: 'test'
        })
      });
      const response = await PUT(request);
      
      expect(response.status).toBe(401);
    });

    it('returns 403 when user is not admin', async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError('Admin required'));
      
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing', {
        method: 'PUT',
        body: JSON.stringify({
          service_id: 'test',
          method: 'test',
          cost: 1,
          reason: 'test'
        })
      });
      const response = await PUT(request);
      
      expect(response.status).toBe(403);
    });
  });
});
