/**
 * Character Services
 * 
 * This directory contains all services related to character management:
 * - Core character CRUD operations
 * - Marketplace and discovery
 * - Character validation and transformation
 * 
 * Domain: Characters (user_characters table)
 */

export * from "./characters";
export * from "./marketplace";
export { charactersService } from "./characters";
export { characterMarketplaceService } from "./marketplace";

// Backward compatibility
export { characterMarketplaceService as marketplaceService } from "./marketplace";
export { characterMarketplaceService as myAgentsService } from "./marketplace";

