
/**
 * Integration tests for service pricing admin API
 * 
 * Tests cover:
 * - Authentication (admin vs non-admin)
 * - PUT upsert behavior
 * - Cache invalidation effects
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET, PUT } from '../route';

// Mock dependencies
jest.mock('@/lib/auth', () => ({
  requireAdmin: jest.fn(),
}));

jest.mock('@/db/repositories', () => ({
  servicePricingRepository: {
    list: jest.fn(),
    upsert: jest.fn(),
  },
}));

jest.mock('@/lib/cache/client', () => ({
  cache: {
    delete: jest.fn(),
  },
}));

import { requireAdmin } from '@/lib/auth';
import { servicePricingRepository } from '@/db/repositories';
import { cache } from '@/lib/cache/client';

describe('Service Pricing Admin API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/admin/service-pricing', () => {
    it('should require admin authentication', async () => {
      (requireAdmin as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

      const request = new NextRequest('http://localhost/api/v1/admin/service-pricing');
      const response = await GET(request);

      expect(response.status).toBe(500);
    });

    it('should return list of service pricing', async () => {
      const mockUser = { id: 'user1', organization_id: 'org1', role: 'admin' };
      const mockPricing = [
        { service_id: 'svc1', cost: '0.01', method: 'test' },
      ];

      (requireAdmin as jest.Mock).mockResolvedValue(mockUser);
      (servicePricingRepository.list as jest.Mock).mockResolvedValue(mockPricing);

      const request = new NextRequest('http://localhost/api/v1/admin/service-pricing');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.pricing).toEqual(mockPricing);
    });
  });

  describe('PUT /api/v1/admin/service-pricing', () => {
    it('should require admin authentication', async () => {
      (requireAdmin as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

      const request = new NextRequest('http://localhost/api/v1/admin/service-pricing', {
        method: 'PUT',
        body: JSON.stringify({ service_id: 'svc1', cost: 0.01, method: 'test' }),
      });
      const response = await PUT(request);

      expect(response.status).toBe(500);
    });

    it('should upsert service pricing', async () => {
      const mockUser = { id: 'user1', organization_id: 'org1', role: 'admin' };
      const mockPricing = { service_id: 'svc1', cost: '0.01', method: 'test' };

      (requireAdmin as jest.Mock).mockResolvedValue(mockUser);
      (servicePricingRepository.upsert as jest.Mock).mockResolvedValue(mockPricing);
      (cache.delete as jest.Mock).mockResolvedValue(true);

      const request = new NextRequest('http://localhost/api/v1/admin/service-pricing', {
        method: 'PUT',
        body: JSON.stringify({ service_id: 'svc1', cost: 0.01, method: 'test', reason: 'Update' }),
      });
      const response = await PUT(request);

      expect(response.status).toBe(200);
      expect(servicePricingRepository.upsert).toHaveBeenCalled();
    });

    it('should invalidate cache after upsert', async () => {
      const mockUser = { id: 'user1', organization_id: 'org1', role: 'admin' };
      const mockPricing = { service_id: 'svc1', cost: '0.01', method: 'test' };

      (requireAdmin as jest.Mock).mockResolvedValue(mockUser);
      (servicePricingRepository.upsert as jest.Mock).mockResolvedValue(mockPricing);
      (cache.delete as jest.Mock).mockResolvedValue(true);

      const request = new NextRequest('http://localhost/api/v1/admin/service-pricing', {
        method: 'PUT',
        body: JSON.stringify({ service_id: 'svc1', cost: 0.01, method: 'test' }),
      });
      await PUT(request);

      expect(cache.delete).toHaveBeenCalledWith('pricing:svc1:test');
    });
  });
});
