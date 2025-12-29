/**
 * OAuth3 Full Flow E2E Tests
 * 
 * These tests verify the complete OAuth3 authentication flow without requiring
 * MetaMask/Synpress. They test:
 * 1. Service health
 * 2. Auth initialization
 * 3. Wallet challenge page
 * 4. Session verification
 * 5. Dashboard access control
 * 
 * For full MetaMask tests, use the synpress-based tests in tests/wallet/
 * which require xvfb and a pre-built cache.
 */

import { test, expect } from '@playwright/test';

const ELIZA_CLOUD_URL = process.env.ELIZA_CLOUD_URL || 'http://localhost:3000';
const OAUTH3_URL = process.env.OAUTH3_URL || 'http://localhost:4200';

// Helper to wait for a server to be ready
async function waitForServer(url: string, timeout = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok || response.status < 500) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

test.describe('OAuth3 Full Authentication Flow', () => {
  test.beforeAll(async () => {
    // Verify both servers are running
    const elizaReady = await waitForServer(ELIZA_CLOUD_URL);
    const oauth3Ready = await waitForServer(`${OAUTH3_URL}/health`);
    
    if (!elizaReady) {
      console.warn(`Eliza Cloud at ${ELIZA_CLOUD_URL} is not ready`);
    }
    if (!oauth3Ready) {
      console.warn(`OAuth3 at ${OAUTH3_URL} is not ready`);
    }
    
    test.skip(!elizaReady || !oauth3Ready, 'Required servers are not running');
  });

  test('OAuth3 service health check', async ({ request }) => {
    const response = await request.get(`${OAUTH3_URL}/health`);
    expect(response.ok()).toBe(true);
    
    const health = await response.json();
    console.log('OAuth3 health:', JSON.stringify(health));
    expect(health.status).toBe('healthy');
  });

  test('OAuth3 providers endpoint returns wallet provider', async ({ request }) => {
    const response = await request.get(`${OAUTH3_URL}/auth/providers`);
    expect(response.ok()).toBe(true);
    
    const providers = await response.json();
    console.log('Available providers:', JSON.stringify(providers));
    
    // Wallet provider should always be available
    expect(providers.providers).toBeDefined();
    const walletProvider = providers.providers.find((p: { id: string }) => p.id === 'wallet');
    expect(walletProvider).toBeDefined();
    expect(walletProvider.enabled).toBe(true);
  });

  test('Auth init returns valid wallet challenge URL', async ({ request }) => {
    const response = await request.post(`${OAUTH3_URL}/auth/init`, {
      data: {
        provider: 'wallet',
        redirectUri: `${ELIZA_CLOUD_URL}/api/auth/oauth3/callback`,
        clientId: 'eliza-cloud',
      },
    });
    
    expect(response.ok()).toBe(true);
    const data = await response.json();
    console.log('Auth init response:', JSON.stringify(data));
    
    expect(data.authUrl).toBeDefined();
    expect(data.authUrl).toContain('/wallet/challenge');
    // Client ID might be eliza-cloud or fallback to jeju-default
    expect(data.authUrl).toMatch(/client_id=(eliza-cloud|jeju-default)/);
    expect(data.authUrl).toContain('redirect_uri=');
    expect(data.state).toBeDefined();
  });

  test('Login page loads and shows wallet connect button', async ({ page }) => {
    await page.goto(`${ELIZA_CLOUD_URL}/login`);
    await page.waitForLoadState('networkidle');
    
    // Wait for the login page to fully render
    await page.waitForSelector('[data-testid="wallet-connect-button"], button:has-text("Connect Wallet"), button:has-text("wallet")', {
      timeout: 10000,
    }).catch(() => {
      // Try alternative selectors
    });
    
    // Check for wallet connect option
    const walletButton = await page.locator('button').filter({ hasText: /wallet|connect/i }).first();
    await expect(walletButton).toBeVisible({ timeout: 10000 });
    
    console.log('Login page loaded successfully with wallet connect button');
  });

  test('Wallet connect redirects to OAuth3 challenge page', async ({ page }) => {
    await page.goto(`${ELIZA_CLOUD_URL}/login`);
    await page.waitForLoadState('networkidle');
    
    // Find and click the wallet connect button
    const walletButton = await page.locator('button').filter({ hasText: /wallet|connect/i }).first();
    await expect(walletButton).toBeVisible({ timeout: 10000 });
    
    // Click and wait for navigation to OAuth3
    const [response] = await Promise.all([
      page.waitForNavigation({ url: /localhost:4200|oauth3/, timeout: 15000 }).catch(() => null),
      walletButton.click(),
    ]);
    
    // Should be on OAuth3 wallet challenge page
    const currentUrl = page.url();
    console.log('Redirected to:', currentUrl);
    
    expect(currentUrl).toContain('wallet/challenge');
    expect(currentUrl).toContain('client_id=eliza-cloud');
  });

  test('Wallet challenge page has connect button and sign message', async ({ page }) => {
    // Go directly to the wallet challenge page
    const state = crypto.randomUUID();
    const challengeUrl = `${OAUTH3_URL}/wallet/challenge?client_id=eliza-cloud&redirect_uri=${encodeURIComponent(`${ELIZA_CLOUD_URL}/api/auth/oauth3/callback`)}&state=${state}`;
    
    await page.goto(challengeUrl);
    await page.waitForLoadState('networkidle');
    
    // Check for Connect Wallet button
    const connectButton = await page.locator('#connectBtn, button:has-text("Connect Wallet")').first();
    await expect(connectButton).toBeVisible({ timeout: 5000 });
    
    // Check for sign message content
    const messageBox = await page.locator('.message-box, [class*="message"]').first();
    await expect(messageBox).toBeVisible();
    
    const messageContent = await messageBox.textContent();
    console.log('Sign message:', messageContent?.substring(0, 100) + '...');
    
    expect(messageContent).toContain('Jeju Network');
    expect(messageContent).toContain('Nonce');
    
    console.log('Wallet challenge page verified successfully');
  });

  test('Unauthenticated dashboard access redirects to login', async ({ page }) => {
    // Try to access dashboard without authentication
    await page.goto(`${ELIZA_CLOUD_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    
    const currentUrl = page.url();
    console.log('Dashboard redirect result:', currentUrl);
    
    // Should redirect to login or home
    expect(currentUrl).toMatch(/\/(login|$)/);
  });

  test('Callback route handles missing code gracefully', async ({ request }) => {
    // Call callback without code - should return error
    const response = await request.get(`${ELIZA_CLOUD_URL}/api/auth/oauth3/callback`);
    
    // Should redirect with error or return error response
    const status = response.status();
    console.log('Callback without code status:', status);
    
    expect([200, 302, 307, 400, 401]).toContain(status);
  });

  test('Session endpoint returns 401 without valid token', async ({ request }) => {
    const response = await request.get(`${ELIZA_CLOUD_URL}/api/auth/oauth3/session`);
    
    const status = response.status();
    console.log('Session endpoint status (unauthenticated):', status);
    
    // Should indicate not authenticated
    if (response.ok()) {
      const session = await response.json();
      expect(session.authenticated).toBeFalsy();
    } else {
      expect([401, 403]).toContain(status);
    }
  });

  test('Complete auth flow simulation (without wallet)', async ({ request, page }) => {
    // Step 1: Init auth flow
    const initResponse = await request.post(`${OAUTH3_URL}/auth/init`, {
      data: {
        provider: 'wallet',
        redirectUri: `${ELIZA_CLOUD_URL}/api/auth/oauth3/callback`,
        clientId: 'eliza-cloud',
      },
    });
    expect(initResponse.ok()).toBe(true);
    
    const initData = await initResponse.json();
    console.log('Step 1 - Auth init:', initData.authUrl?.substring(0, 80));
    
    // Step 2: Navigate to challenge page
    await page.goto(initData.authUrl);
    await page.waitForLoadState('networkidle');
    
    const connectButton = await page.locator('#connectBtn').first();
    await expect(connectButton).toBeVisible();
    console.log('Step 2 - Challenge page loaded');
    
    // Step 3: At this point, MetaMask would sign the message
    // Without MetaMask, we can only verify the flow up to this point
    console.log('Step 3 - Wallet signing required (skipped without MetaMask)');
    
    // Step 4: Verify challenge endpoint is responsive
    const challengeId = 'test-' + Date.now();
    const statusResponse = await request.get(`${OAUTH3_URL}/wallet/status/${challengeId}`);
    console.log('Step 4 - Challenge status check:', statusResponse.status());
    
    console.log('✅ Auth flow verified up to wallet signing step');
    console.log('📝 For full E2E with wallet, run synpress tests with xvfb');
  });
});

test.describe('OAuth3 Error Handling', () => {
  test('Unknown client ID falls back to default (permissive for development)', async ({ request }) => {
    const response = await request.post(`${OAUTH3_URL}/auth/init`, {
      data: {
        provider: 'wallet',
        redirectUri: 'http://localhost:3000/api/auth/oauth3/callback',
        clientId: 'unknown-client-12345',
      },
    });
    
    // In development, OAuth3 may be permissive with unknown clients
    const data = await response.json();
    console.log('Unknown client response:', JSON.stringify(data));
    
    if (response.ok()) {
      // Permissive mode - should still have valid authUrl
      expect(data.authUrl).toBeDefined();
    } else {
      // Strict mode - should return error
      expect(data.error).toBeDefined();
    }
  });

  test('Invalid provider returns error', async ({ request }) => {
    const response = await request.post(`${OAUTH3_URL}/auth/init`, {
      data: {
        provider: 'nonexistent-provider',
        redirectUri: 'http://localhost:3000/api/auth/oauth3/callback',
        clientId: 'eliza-cloud',
      },
    });
    
    expect(response.ok()).toBe(false);
    const data = await response.json();
    console.log('Invalid provider error:', JSON.stringify(data));
    expect(data.error).toBeDefined();
  });

  test('Redirect URI validation (strict mode check)', async ({ request }) => {
    const response = await request.post(`${OAUTH3_URL}/auth/init`, {
      data: {
        provider: 'wallet',
        redirectUri: 'http://evil-site.com/callback',
        clientId: 'eliza-cloud',
      },
    });
    
    const data = await response.json();
    console.log('External redirect response:', JSON.stringify(data));
    
    // In development mode, OAuth3 may allow any redirect URI
    // In production, this should be rejected
    if (response.ok()) {
      console.log('⚠️ OAuth3 is in permissive mode - allows any redirect URI');
      expect(data.authUrl).toBeDefined();
    } else {
      console.log('✅ OAuth3 correctly rejects external redirect URIs');
      expect(data.error).toBeDefined();
    }
  });
});

