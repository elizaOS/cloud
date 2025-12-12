/**
 * Browser-specific entry point for @elizaos/core
 *
 * This file exports only browser-compatible modules and provides
 * stubs or alternatives for Node.js-specific functionality.
 */
export * from './types';
export * from './utils';
export * from './schemas/character';
export * from './utils/environment';
export * from './utils/buffer';
export * from './actions';
export * from './database';
export * from './entities';
export * from './logger';
export * from './memory';
export * from './prompts';
export * from './roles';
export * from './runtime';
export * from './settings';
export * from './services';
export * from './services/message-service';
export * from './services/default-message-service';
export * from './search';
export * from './elizaos';
export declare const isBrowser = true;
export declare const isNode = false;
/**
 * Browser stub for server health checks
 * In browser environment, this is a no-op
 */
export declare const serverHealth: {
    check: () => Promise<{
        status: string;
        environment: string;
    }>;
    isHealthy: () => boolean;
};
//# sourceMappingURL=index.browser.d.ts.map