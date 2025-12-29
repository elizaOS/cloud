/**
 * DWS Container Registry Integration
 *
 * Replaces AWS ECR with DWS-native container registry.
 * Provides backwards-compatible API for existing code.
 */

import { logger } from "@/lib/utils/logger";
import { getDWSConfig } from "@/lib/services/dws/config";

/**
 * Configuration for container registry client
 */
export interface ECRConfig {
  region?: string;
  // DWS doesn't need AWS credentials
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * Result of pushing an image to the registry
 */
export interface ImagePushResult {
  repositoryUri: string;
  imageUri: string;
  imageDigest?: string;
  imageTag: string;
}

/**
 * Result of creating a repository
 */
export interface RepositoryResult {
  repositoryUri: string;
  repositoryArn: string;
  registryId: string;
}

/**
 * Docker auth credentials
 */
export interface AuthorizationData {
  authorizationToken?: string;
  expiresAt?: Date;
  proxyEndpoint?: string;
}

/**
 * Image identifier
 */
export interface ImageIdentifier {
  imageDigest?: string;
  imageTag?: string;
}

/**
 * DWS Container Registry Manager
 * 
 * Provides a drop-in replacement for AWS ECR that uses DWS container registry.
 */
export class ECRManager {
  private config = getDWSConfig();
  private baseUrl: string;
  private registryUrl: string;

  constructor(_config?: ECRConfig) {
    // Config parameter kept for API compatibility
    this.baseUrl = this.config.apiUrl;
    this.registryUrl = this.config.containerRegistry ?? `${this.baseUrl}/registry`;
  }

  /**
   * Create a container repository
   */
  async createRepository(
    repositoryName: string,
    options?: {
      imageTagMutability?: "MUTABLE" | "IMMUTABLE";
      imageScanOnPush?: boolean;
    }
  ): Promise<RepositoryResult> {
    logger.info("[DWS Registry] Creating repository", { repositoryName });

    const response = await fetch(`${this.registryUrl}/repositories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: repositoryName,
        tagMutability: options?.imageTagMutability ?? "MUTABLE",
        scanOnPush: options?.imageScanOnPush ?? true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create repository: ${errorText}`);
    }

    const data = await response.json();

    return {
      repositoryUri: data.uri,
      repositoryArn: `dws:registry:${this.config.network}:repository/${repositoryName}`,
      registryId: this.config.nodeId,
    };
  }

  /**
   * Get authentication token for Docker
   */
  async getAuthorizationToken(): Promise<AuthorizationData> {
    logger.info("[DWS Registry] Getting auth token");

    const response = await fetch(`${this.registryUrl}/auth/token`, {
      method: "POST",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get auth token: ${errorText}`);
    }

    const data = await response.json();

    return {
      authorizationToken: data.token,
      expiresAt: new Date(data.expiresAt),
      proxyEndpoint: this.registryUrl,
    };
  }

  /**
   * Check if a repository exists
   */
  async repositoryExists(repositoryName: string): Promise<boolean> {
    const response = await fetch(
      `${this.registryUrl}/repositories/${repositoryName}`,
      { method: "HEAD" }
    );
    return response.ok;
  }

  /**
   * Describe repository
   */
  async describeRepository(repositoryName: string): Promise<{
    repositoryName: string;
    repositoryUri: string;
    repositoryArn: string;
    createdAt: Date;
    imageCount: number;
  } | null> {
    const response = await fetch(
      `${this.registryUrl}/repositories/${repositoryName}`
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to describe repository: ${errorText}`);
    }

    const data = await response.json();

    return {
      repositoryName: data.name,
      repositoryUri: data.uri,
      repositoryArn: `dws:registry:${this.config.network}:repository/${data.name}`,
      createdAt: new Date(data.createdAt),
      imageCount: data.imageCount,
    };
  }

  /**
   * Describe images in a repository
   */
  async describeImages(
    repositoryName: string,
    imageIds?: ImageIdentifier[]
  ): Promise<Array<{
    imageTags?: string[];
    imageDigest: string;
    imagePushedAt: Date;
    imageSizeInBytes: number;
  }>> {
    const params = new URLSearchParams();
    if (imageIds) {
      params.set("imageIds", JSON.stringify(imageIds));
    }

    const response = await fetch(
      `${this.registryUrl}/repositories/${repositoryName}/images?${params}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to describe images: ${errorText}`);
    }

    const data = await response.json();

    return (data.images || []).map((img: {
      tags?: string[];
      digest: string;
      pushedAt: string;
      sizeBytes: number;
    }) => ({
      imageTags: img.tags,
      imageDigest: img.digest,
      imagePushedAt: new Date(img.pushedAt),
      imageSizeInBytes: img.sizeBytes,
    }));
  }

  /**
   * Delete images from a repository
   */
  async deleteImages(
    repositoryName: string,
    imageIds: ImageIdentifier[]
  ): Promise<{
    imageIds: ImageIdentifier[];
    failures: Array<{ imageId: ImageIdentifier; failureCode: string; failureReason: string }>;
  }> {
    logger.info("[DWS Registry] Deleting images", {
      repositoryName,
      count: imageIds.length,
    });

    const response = await fetch(
      `${this.registryUrl}/repositories/${repositoryName}/images`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete images: ${errorText}`);
    }

    const data = await response.json();

    return {
      imageIds: data.deleted || [],
      failures: data.failures || [],
    };
  }

  /**
   * Set lifecycle policy for a repository
   */
  async setLifecyclePolicy(
    repositoryName: string,
    policy: {
      rules: Array<{
        rulePriority: number;
        description?: string;
        selection: {
          tagStatus: "tagged" | "untagged" | "any";
          countType: "imageCountMoreThan" | "sinceImagePushed";
          countNumber: number;
          countUnit?: "days";
        };
        action: {
          type: "expire";
        };
      }>;
    }
  ): Promise<void> {
    logger.info("[DWS Registry] Setting lifecycle policy", { repositoryName });

    const response = await fetch(
      `${this.registryUrl}/repositories/${repositoryName}/lifecycle`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to set lifecycle policy: ${errorText}`);
    }
  }

  /**
   * Get the registry URL for docker commands
   */
  getRegistryUrl(): string {
    return this.registryUrl;
  }

  /**
   * Get the full image URI for a repository and tag
   */
  getImageUri(repositoryName: string, tag: string = "latest"): string {
    const host = new URL(this.registryUrl).host;
    return `${host}/${repositoryName}:${tag}`;
  }

  /**
   * Get Docker login command
   */
  async getDockerLoginCommand(): Promise<string> {
    const auth = await this.getAuthorizationToken();
    if (!auth.authorizationToken) {
      throw new Error("No authorization token available");
    }
    const host = new URL(this.registryUrl).host;
    return `echo "${auth.authorizationToken}" | docker login -u dws --password-stdin ${host}`;
  }
}

// Singleton instance
let ecrManagerInstance: ECRManager | null = null;

export function getECRManager(config?: ECRConfig): ECRManager {
  if (!ecrManagerInstance) {
    ecrManagerInstance = new ECRManager(config);
  }
  return ecrManagerInstance;
}

export function resetECRManager(): void {
  ecrManagerInstance = null;
}

// Legacy exports for compatibility
export type Repository = Awaited<ReturnType<ECRManager["describeRepository"]>>;
export { ECRManager as ECRClient };
