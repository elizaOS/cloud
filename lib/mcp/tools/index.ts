/**
 * MCP Tools Module
 * 
 * This module provides a modular structure for MCP tools.
 * Tools are organized by category for maintainability.
 * 
 * Categories:
 * - credits: Credit balance, transactions, billing
 * - ai-generation: Text, image, video, embeddings, TTS
 * - agents: Agent management, chat, events
 * - memory: Save, retrieve, analyze memories
 * - conversations: Create, search, export conversations
 * - containers: Container lifecycle management
 * - storage: File storage and IPFS
 * - n8n: Workflow automation
 * - fragments: Fragment projects
 * - discovery: Service discovery
 * - social-media: Cross-platform social media posting and analytics
 * 
 * Usage:
 * ```ts
 * import { registerAllTools } from "@/lib/mcp/tools";
 * 
 * const mcpHandler = createMcpHandler((server) => {
 *   registerAllTools(server, getAuthContext);
 * });
 * ```
 */

export * from "./types";
export { registerCreditTools } from "./credits";
export { socialMediaTools } from "./social-media";

// Re-export types
export type { AuthResultWithOrg, ToolResponse, ToolContent } from "./types";
