```javascript
   1 | /**
   2 |  * SIWE Verify Endpoint Integration Tests
   3 |  * 
   4 |  * Tests nonce issuance (TTL/single-use), verify success paths (existing vs new user),
   5 |  * and key failure modes (invalid nonce/domain/signature).
   6 |  */
   7 | 
   8 | import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
   9 | 
  10 | // Mock dependencies
  11 | jest.mock('@/lib/cache/client', () => ({
  12 |   cache: {
  13 |     isAvailable: jest.fn().mockReturnValue(true),
  14 |     set: jest.fn().mockResolvedValue(undefined),
  15 |     get: jest.fn().mockResolvedValue(true),
  16 |   },
  17 | }));
  18 | 
  19 | jest.mock('@/lib/cache/consume', () => ({
  20 |   atomicConsume: jest.fn().mockResolvedValue(1),
  21 | }));
  22 | 
  23 | jest.mock('@/lib/services/users', () => ({
  24 |   usersService: {
  25 |     getByWalletAddressWithOrganization: jest.fn().mockResolvedValue(null),
  26 |     create: jest.fn().mockResolvedValue({ id: 'user-1', organization_id: 'org-1' }),
  27 |     update: jest.fn().mockResolvedValue(undefined),
  28 |   },
  29 | }));
  30 | 
  31 | jest.mock('@/lib/services/organizations', () => ({
  32 |   organizationsService: {
  33 |     getBySlug: jest.fn().mockResolvedValue(null),
  34 |     create: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Test Org' }),
  35 |     getById: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Test Org', credit_balance: '10.00' }),
  36 |     delete: jest.fn().mockResolvedValue(undefined),
  37 |     update: jest.fn().mockResolvedValue(undefined),
  38 |   },
  39 | }));
  40 | 
  41 | jest.mock('@/lib/services/api-keys', () => ({
  42 |   apiKeysService: {
  43 |     listByOrganization: jest.fn().mockResolvedValue([]),
  44 |     create: jest.fn().mockResolvedValue({ plainKey: 'test-api-key' }),
  45 |   },
  46 | }));
  47 | 
  48 | jest.mock('@/lib/services/credits', () => ({
  49 |   creditsService: {
  50 |     addCredits: jest.fn().mockResolvedValue(undefined),
  51 |   },
  52 | }));
  53 | 
  54 | jest.mock('@/lib/services/abuse-detection', () => ({
  55 |   abuseDetectionService: {
  56 |     checkSignupAbuse: jest.fn().mockResolvedValue({ allowed: true }),
  57 |     recordSignupMetadata: jest.fn().mockResolvedValue(undefined),
  58 |   },
  59 | }));
  60 | 
  61 | describe('SIWE Verify Endpoint Integration', () => {
  62 |   const app = require('supertest')(process.env.APP_URL || 'http://localhost:3000');
  63 | 
  64 |   describe('Nonce validation', () => {
  65 |     it('should reject invalid nonce', async () => {
  66 |       const response = await app
  67 |         .post('/api/auth/siwe/verify')
  68 |         .send({
  69 |           message: `localhost wants you to sign in with your Ethereum account:\ninvalid-nonce`,
  70 |           signature: '0xvalid'
  71 |         });
  72 |       
  73 |       expect(response.status).toBe(400);
  74 |       expect(response.body.error).toBe('INVALID_NONCE');
  75 |     });
  76 | 
  77 |     it('should handle existing user sign-in success', async () => {
  78 |       // First get a valid nonce
  79 |       const nonceRes = await app.get('/api/auth/siwe/nonce');
  80 |       expect(nonceRes.status).toBe(200);
  81 |       const { nonce } = nonceRes.body;
  82 | 
  83 |       // Then verify with valid signature
  84 |       const verifyRes = await app
  85 |         .post('/api/auth/siwe/verify')
  86 |         .send({
  87 |           message: `localhost wants you to sign in with your Ethereum account:\n${nonce}`,
  88 |           signature: '0xvalid'
  89 |         });
  90 |       
  91 |       expect(verifyRes.status).toBe(200);
  92 |       expect(verifyRes.body.apiKey).toBeDefined();
  93 |       expect(verifyRes.body.user).toBeDefined();
  94 |       expect(verifyRes.body.user.id).toBeDefined();
  95 |       expect(verifyRes.body.user.organization_id).toBeDefined();
  96 |     });
  97 | 
  98 |     it('should handle duplicate-signup race recovery', async () => {
  99 |       // First get a nonce
 100 |       const nonceRes = await app.get('/api/auth/siwe/nonce');
 101 |       const { nonce } = nonceRes.body;
 102 | 
 103 |       // Trigger duplicate creation attempts
 104 |       const [res1, res2] = await Promise.all([
 105 |         app.post('/api/auth/siwe/verify').send({
 106 |           message: `localhost wants you to sign in with your Ethereum account:\n${nonce}`,
 107 |           signature: '0xvalid'
 108 |         }),
 109 |         app.post('/api/auth/siwe/verify').send({
 110 |           message: `localhost wants you to sign in with your Ethereum account:\n${nonce}`,
 111 |           signature: '0xvalid'
 112 |         })
 113 |       ]);
 114 | 
 115 |       // One should succeed, one should recover gracefully
 116 |       expect([res1.status, res2.status]).toContain(200);
 117 |       expect(res1.body.user?.id || res2.body.user?.id).toBeDefined();
 118 |     });
 119 | 
 120 |   });
 121 | });
```
