
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PUT } from '../route';
import { requireAdmin } from '@/lib/auth';
import { AuthenticationError, ForbiddenError } from '@/lib/api/errors';
import { servicePricingRepository } from '@/db/repositories/service-pricing';
import { invalidateServicePricingCache } from '@/lib/services/proxy/pricing';

vi.mock('@/lib/auth');
vi.mock('@/db/repositories/service-pricing');
vi.mock('@/lib/services/proxy/pricing');

describe('Service Pricing Admin Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/admin/service-pricing', () => {
    it('should return 401 when wallet is not connected', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing?service_id=solana-rpc');
      vi.mocked(requireAdmin).mockRejectedValue(new AuthenticationError('Wallet connection required'));

      const response = await GET(request);
      expect(response.status).toBe(401);
      expect(requireAdmin).toHaveBeenCalledOnce();
    });

    it('should return 403 when user is not admin', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing?service_id=solana-rpc');
      vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError('Admin access required'));

      const response = await GET(request);
      expect(response.status).toBe(403);
      expect(requireAdmin).toHaveBeenCalledOnce();
    });

    it('should return service pricing data', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing?service_id=solana-rpc');
      vi.mocked(requireAdmin).mockResolvedValue({
        user: { id: 'user-1', wallet_address: 'wallet-1', organization_id: 'org-1' } as any,
        role: 'super_admin',
      });
      vi.mocked(servicePricingRepository.listByService).mockResolvedValue([
        {
          id: '1',
          service_id: 'solana-rpc',
          method: '_default',
          cost: '0.000006',
          description: 'Standard Solana RPC call',
          metadata: {},
          is_active: true,
          updated_by: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const response = await GET(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveLength(1);
      expect(data[0].service_id).toBe('solana-rpc');
    });
  });

  describe('PUT /api/v1/admin/service-pricing', () => {
    it('should return 401 when wallet is not connected', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing', {
        method: 'PUT',
        body: JSON.stringify({
          service_id: 'solana-rpc',
          method: 'getBalance',
          cost: 0.002,
          reason: 'Updated pricing',
        }),
      });
      vi.mocked(requireAdmin).mockRejectedValue(new AuthenticationError('Wallet connection required'));

      const response = await PUT(request);
      expect(response.status).toBe(401);
    });

    it('should return 403 when user is not admin', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing', {
        method: 'PUT',
        body: JSON.stringify({
          service_id: 'solana-rpc',
          method: 'getBalance',
          cost: 0.002,
          reason: 'Updated pricing',
        }),
      });
      vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError('Admin access required'));

      const response = await PUT(request);
      expect(response.status).toBe(403);
    });

    it('should upsert pricing and invalidate cache', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing', {
        method: 'PUT',
        body: JSON.stringify({
          service_id: 'solana-rpc',
          method: 'getBalance',
          cost: 0.002,
          reason: 'Updated pricing',
        }),
      });
      vi.mocked(requireAdmin).mockResolvedValue({
        user: { id: 'user-1', wallet_address: 'wallet-1', organization_id: 'org-1' } as any,
        role: 'super_admin',
      });
      vi.mocked(servicePricingRepository.upsertPricing).mockResolvedValue({
        id: '1',
        service_id: 'solana-rpc',
        method: 'getBalance',
        cost: '0.002',
        description: null,
        metadata: {},
        is_active: true,
        updated_by: 'user-1',
        created_at: new Date(),
        updated_at: new Date(),
      });
      vi.mocked(invalidateServicePricingCache).mockResolvedValue();

      const response = await PUT(request);
      expect(response.status).toBe(200);
      expect(invalidateServicePricingCache).toHaveBeenCalledWith('solana-rpc');
    });
  });
});
