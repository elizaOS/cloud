/**
 * Basic MetaMask Wallet Setup for Eliza Cloud E2E Tests
 * 
 * This is a standalone setup that doesn't import any monorepo packages.
 */

import { defineWalletSetup } from '@synthetixio/synpress';
import { MetaMask } from '@synthetixio/synpress/playwright';

// Anvil's default test seed phrase
const SEED_PHRASE = 'test test test test test test test test test test test junk';

// MetaMask password
const PASSWORD = 'Tester@1234';

export default defineWalletSetup(PASSWORD, async (context, walletPage) => {
  const metamask = new MetaMask(context, walletPage, PASSWORD);

  console.log('[Setup] Importing wallet...');
  await metamask.importWallet(SEED_PHRASE);

  console.log('[Setup] Adding Jeju Localnet...');
  await metamask.addNetwork({
    name: 'Jeju Localnet',
    rpcUrl: 'http://127.0.0.1:6546',
    chainId: 31337,
    symbol: 'ETH',
  });

  console.log('[Setup] Switching to Jeju Localnet...');
  await metamask.switchNetwork('Jeju Localnet');

  console.log('[Setup] Wallet setup complete!');
});
