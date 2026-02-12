
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PUT } from './route';
import { requireAdmin } from '@/lib/auth';
import { WalletRequiredError, AdminRequiredError } from '@/lib/auth-errors';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/auth');
vi.mock('@/lib/prisma', () => ({
  prisma: {
    servicePricing: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe('Service Pricing Admin Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/admin/service-pricing', () => {
    it('should return 401 when wallet is not connected', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing');
      vi.mocked(requireAdmin).mockRejectedValue(new WalletRequiredError());

      const response = await GET(request);
      expect(response.status).toBe(401);
      expect(requireAdmin).toHaveBeenCalledOnce();
    });

    it('should return service pricing data', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/admin/service-pricing');
      vi.mocked(requireAdmin).mockResolvedValue({
        address: 'admin-address',
        role: 'admin',
      });
      vi.mocked(prisma.servicePricing.findFirst).mockResolvedValue({
        id: '1',
        pricePerToken: 0.001,
        updatedAt: new Date(),
      });

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
