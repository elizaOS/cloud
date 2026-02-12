
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PUT } from './route';
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
        body: JSON.stringify({ pricePerToken: 0.002 }),
      });
      vi.mocked(requireAdmin).mockRejectedValue(new AdminRequiredError());

      const response = await PUT(request);
      expect(response.status).toBe(403);
      expect(requireAdmin).toHaveBeenCalledOnce();
    });

    it('should update service pricing', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing', {
        method: 'PUT',
        body: JSON.stringify({ pricePerToken: 0.002 }),
      });
      vi.mocked(requireAdmin).mockResolvedValue({
        address: 'admin-address',
        role: 'admin',
      });
      vi.mocked(prisma.servicePricing.upsert).mockResolvedValue({
        id: '1',
        pricePerToken: 0.002,
        updatedAt: new Date(),
      });

      const response = await PUT(request);
      expect(response.status).toBe(200);
    });
  });
});
