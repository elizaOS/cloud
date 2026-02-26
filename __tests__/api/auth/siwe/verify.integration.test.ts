import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import supertest from 'supertest';

// Mock dependencies
jest.mock('@/lib/cache/client', () => ({
  cache: {
    isAvailable: jest.fn().mockReturnValue(true),
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('@/lib/cache/consume', () => ({
  atomicConsume: jest.fn().mockResolvedValue(1),
}));

jest.mock('@/lib/services/users', () => ({
  usersService: {
    getByWalletAddressWithOrganization: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'user-1', organization_id: 'org-1' }),
    update: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/services/organizations', () => ({
  organizationsService: {
    getBySlug: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Test Org' }),
    getById: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Test Org', credit_balance: '10.00' }),
    delete: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/services/api-keys', () => ({
  apiKeysService: {
    listByOrganization: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ plainKey: 'test-api-key' }),
  },
}));

jest.mock('@/lib/services/credits', () => ({
  creditsService: {
    addCredits: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/services/abuse-detection', () => ({
  abuseDetectionService: {
    checkSignupAbuse: jest.fn().mockResolvedValue({ allowed: true }),
    recordSignupMetadata: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('SIWE Verify Endpoint Integration', () => {
  const app = supertest(process.env.APP_URL || 'http://localhost:3000');

  describe('Nonce validation', () => {
    it('should reject invalid nonce', async () => {
      const response = await app
        .post('/api/auth/siwe/verify')
        .send({
          message: `localhost wants you to sign in with your Ethereum account:\ninvalid-nonce`,
          signature: '0xvalid'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('INVALID_NONCE');
    });

    it('should handle existing user sign-in success', async () => {
      const nonceRes = await app.get('/api/auth/siwe/nonce');
      expect(nonceRes.status).toBe(200);
      const { nonce } = nonceRes.body;

      const verifyRes = await app
        .post('/api/auth/siwe/verify')
        .send({
          message: `localhost wants you to sign in with your Ethereum account:\n${nonce}`,
          signature: '0xvalid'
        });
      
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.apiKey).toBeDefined();
      expect(verifyRes.body.user).toBeDefined();
      expect(verifyRes.body.user.id).toBeDefined();
      expect(verifyRes.body.user.organization_id).toBeDefined();
    });

    it('should handle duplicate-signup race recovery', async () => {
      const nonceRes = await app.get('/api/auth/siwe/nonce');
      const { nonce } = nonceRes.body;

      const [res1, res2] = await Promise.all([
        app.post('/api/auth/siwe/verify').send({
          message: `localhost wants you to sign in with your Ethereum account:\n${nonce}`,
          signature: '0xvalid'
        }),
        app.post('/api/auth/siwe/verify').send({
          message: `localhost wants you to sign in with your Ethereum account:\n${nonce}`,
          signature: '0xvalid'
        })
      ]);

      expect([res1.status, res2.status]).toContain(200);
      expect(res1.body.user?.id || res2.body.user?.id).toBeDefined();
    });
  });
});
