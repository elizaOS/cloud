/**
 * Deployment Services
 * 
 * This directory contains services related to character deployments:
 * - Character → Container → Agent lifecycle
 * - Deployment discovery and status tracking
 * - Infrastructure management
 */

export * from "./discovery";
export {
  characterDeploymentDiscoveryService as deploymentDiscoveryService,
} from "./discovery";
