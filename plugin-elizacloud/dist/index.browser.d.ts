/**
 * Browser entry point for @elizaos/plugin-elizacloud
 *
 * This entry point excludes database-related exports that require Node.js.
 * For database/schema access, use the /node entry point instead.
 */
import type { Plugin } from "@elizaos/core";
export type { OpenAITranscriptionParams, OpenAITextToSpeechParams, } from "./types";
export type { CloudDatabaseConfig, CloudDatabaseStatus } from "./database/types";
/**
 * ElizaOS Cloud Plugin - Browser version
 *
 * This version excludes database functionality which requires Node.js.
 */
export declare const elizaOSCloudPlugin: Plugin;
export default elizaOSCloudPlugin;
