
/**
 * Integration tests for service pricing admin API
 * Tests auth, upsert behavior, and cache invalidation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET, PUT } from './route';
import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { WalletRequiredError, AdminRequiredError } from '@/lib/auth-errors';
import { servicePricingRepository } from '@/db/repositories';
import { cache } from '@/lib/cache/client';

vi.mock('@/lib/auth');
vi.mock('@/db/repositories');
vi.mock('@/lib/cache/client');

describe('Service Pricing Admin API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/admin/service-pricing', () => {
    it('should require admin authentication', async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new WalletRequiredError());
      
      const request = new NextRequest('http://localhost/api/v1/admin/service-pricing');
      
      const response = await GET(request);
      expect(response.status).toBe(401);
      expect(requireAdmin).toHaveBeenCalledTimes(1);
    });

    it('should return pricing list for admin user', async () => {
      const mockUser = { id: 'admin-1', organization_id: 'org-1', role: 'admin' };
      vi.mocked(requireAdmin).mockResolvedValue(mockUser);
      vi.mocked(servicePricingRepository.list).mockResolvedValue([
        { service_id: 'svc-1', cost: '0.01', method: 'default', updated_at: new Date() }
      ]);

      const request = new NextRequest('http://localhost/api/v1/admin/service-pricing');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.pricing).toHaveLength(1);
    });
  });

  describe('PUT /api/v1/admin/service-pricing', () => {
    it('should require admin authentication', async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new Error('Unauthorized'));
      
      const request = new NextRequest('http://localhost/api/v1/admin/service-pricing', {
        method: 'PUT',
        body: JSON.stringify({ service_id: 'svc-1', method: 'default', cost: 0.01 })
      });
      
      await expect(PUT(request)).rejects.toThrow('Unauthorized');
    });

    it('should upsert pricing and invalidate cache', async () => {
      const mockUser = { id: 'admin-1', organization_id: 'org-1', role: 'admin' };
      vi.mocked(requireAdmin).mockResolvedValue(mockUser);
      vi.mocked(servicePricingRepository.upsert).mockResolvedValue({
        service_id: 'svc-1',
        cost: '0.01',
        method: 'default',
        updated_at: new Date()
      });
      vi.mocked(cache.del).mockResolvedValue(true);

      const request = new NextRequest('http://localhost/api/v1/admin/service-pricing', {
        method: 'PUT',
        body: JSON.stringify({ service_id: 'svc-1', method: 'default', cost: 0.01, reason: 'test' })
      });
      
      const response = await PUT(request);
      
      expect(response.status).toBe(200);
      expect(cache.del).toHaveBeenCalledWith('pricing:svc-1:default');
      const data = await response.json();
      expect(data.pricing.service_id).toBe('svc-1');
    });

    it('should handle cache invalidation failures gracefully', async () => {
      const mockUser = { id: 'admin-1', organization_id: 'org-1', role: 'admin' };
      vi.mocked(requireAdmin).mockResolvedValue(mockUser);
      vi.mocked(servicePricingRepository.upsert).mockResolvedValue({
        service_id: 'svc-1',
        cost: '0.01',
        method: 'default',
        updated_at: new Date()
      });
      vi.mocked(cache.del).mockRejectedValue(new Error('Cache error'));

      const request = new NextRequest('http://localhost/api/v1/admin/service-pricing', {
        method: 'PUT',
        body: JSON.stringify({ service_id: 'svc-1', method: 'default', cost: 0.01 })
      });
      
      const response = await PUT(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cache_invalidated).toBe(false);
    });
  });
});
