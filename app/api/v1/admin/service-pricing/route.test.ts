
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET, PUT } from './route';
import { requireAdminWithResponse } from '@/lib/api/admin-auth';
import { servicePricingRepository } from '@/db/repositories';
import { invalidateServicePricingCache } from '@/lib/services/proxy/pricing';

vi.mock('@/lib/api/admin-auth');
vi.mock('@/db/repositories');
vi.mock('@/lib/services/proxy/pricing');

describe('Service Pricing Admin Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/admin/service-pricing', () => {
    it('should return 401 when wallet is not connected', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing?service_id=solana-rpc');
      vi.mocked(requireAdminWithResponse).mockResolvedValue(
        NextResponse.json({ error: 'Wallet connection required' }, { status: 401 }),
      );

      const response = await GET(request);
      expect(response.status).toBe(401);
      expect(requireAdminWithResponse).toHaveBeenCalledOnce();
    });

    it('should return 403 when user is not admin', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing?service_id=solana-rpc');
      vi.mocked(requireAdminWithResponse).mockResolvedValue(
        NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
      );

      const response = await GET(request);
      expect(response.status).toBe(403);
      expect(requireAdminWithResponse).toHaveBeenCalledOnce();
    });

    it('should return service pricing data', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing?service_id=solana-rpc');
      vi.mocked(requireAdminWithResponse).mockResolvedValue({
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
          is_active: true,
          updated_at: new Date(),
        } as any,
      ]);

      const response = await GET(request);
      expect(response.status).toBe(200);
    });
  });

  describe('PUT /api/v1/admin/service-pricing', () => {
    it('should return 403 when user is not an admin', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing', {
        method: 'PUT',
        body: JSON.stringify({
          service_id: 'solana-rpc',
          method: 'getBalance',
          cost: 0.002,
          reason: 'Updated pricing',
        }),
      });
      vi.mocked(requireAdminWithResponse).mockResolvedValue(
        NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
      );

      const response = await PUT(request);
      expect(response.status).toBe(403);
      expect(requireAdminWithResponse).toHaveBeenCalledOnce();
    });

    it('should update service pricing', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing', {
        method: 'PUT',
        body: JSON.stringify({
          service_id: 'solana-rpc',
          method: 'getBalance',
          cost: 0.002,
          reason: 'Updated pricing',
        }),
      });
      vi.mocked(requireAdminWithResponse).mockResolvedValue({
        user: { id: 'user-1', wallet_address: 'wallet-1', organization_id: 'org-1' } as any,
        role: 'admin',
      });
      vi.mocked(servicePricingRepository.upsert).mockResolvedValue({
        id: '1',
        service_id: 'solana-rpc',
        method: 'getBalance',
        cost: '0.002',
        description: null,
        is_active: true,
        metadata: {},
        updated_by: 'user-1',
        created_at: new Date(),
        updated_at: new Date(),
      });
      vi.mocked(invalidateServicePricingCache).mockResolvedValue();

      const response = await PUT(request);
      expect(response.status).toBe(200);
      expect(invalidateServicePricingCache).toHaveBeenCalledWith('solana-rpc');
      expect(invalidateServicePricingCache).toHaveBeenCalledTimes(2);
    });
  });
});
