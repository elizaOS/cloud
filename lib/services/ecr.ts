/**
 * AWS ECR (Elastic Container Registry) Integration
 * Handles Docker image storage and management
 */

import {
  ECRClient,
  CreateRepositoryCommand,
  GetAuthorizationTokenCommand,
  DescribeRepositoriesCommand,
  DescribeImagesCommand,
  BatchDeleteImageCommand,
  type Repository,
  type ImageIdentifier,
  type AuthorizationData,
} from "@aws-sdk/client-ecr";

/**
 * Configuration for ECR client
 */
export interface ECRConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Result of image push operation
 */
export interface ImagePushResult {
  repositoryUri: string;
  imageUri: string;
  imageDigest?: string;
  imageTag: string;
}

/**
 * Repository creation result
 */
export interface RepositoryResult {
  repositoryUri: string;
  repositoryArn: string;
  registryId: string;
}

/**
 * AWS ECR Manager for handling container image operations
 */
export class ECRManager {
  private client: ECRClient;
  private config: ECRConfig;

  constructor(config: ECRConfig) {
    this.config = config;
    this.client = new ECRClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /**
   * Create a new ECR repository if it doesn't exist
   */
  async createRepository(repositoryName: string): Promise<RepositoryResult> {
    try {
      // Check if repository exists
      const describeCommand = new DescribeRepositoriesCommand({
        repositoryNames: [repositoryName],
      });

      const describeResponse = await this.client.send(describeCommand);
      const repository = describeResponse.repositories?.[0];

      if (repository) {
        console.log("Repository already exists:", repository.repositoryUri);
        return {
          repositoryUri: repository.repositoryUri!,
          repositoryArn: repository.repositoryArn!,
          registryId: repository.registryId!,
        };
      }
    } catch (error) {
      // Repository doesn't exist, create it
      if (error instanceof Error && error.name !== "RepositoryNotFoundException") {
        throw error;
      }
    }

    console.log("Creating new ECR repository:", repositoryName);
    const createCommand = new CreateRepositoryCommand({
      repositoryName,
      imageScanningConfiguration: {
        scanOnPush: true,
      },
      imageTagMutability: "MUTABLE",
      encryptionConfiguration: {
        encryptionType: "AES256",
      },
    });

    const createResponse = await this.client.send(createCommand);
    const repository = createResponse.repository!;

    console.log("Repository created:", repository.repositoryUri);
    return {
      repositoryUri: repository.repositoryUri!,
      repositoryArn: repository.repositoryArn!,
      registryId: repository.registryId!,
    };
  }

  /**
   * Get Docker login credentials for ECR
   */
  async getAuthorizationToken(): Promise<AuthorizationData> {
    const command = new GetAuthorizationTokenCommand({});
    const response = await this.client.send(command);
    
    const authData = response.authorizationData?.[0];
    if (!authData || !authData.authorizationToken) {
      throw new Error("Failed to get ECR authorization token");
    }

    return authData;
  }

  /**
   * Get the full image URI for a repository and tag
   */
  getImageUri(repositoryUri: string, tag: string): string {
    return `${repositoryUri}:${tag}`;
  }

  /**
   * List images in a repository
   */
  async listImages(repositoryName: string): Promise<ImageIdentifier[]> {
    const command = new DescribeImagesCommand({
      repositoryName,
    });

    const response = await this.client.send(command);
    return response.imageDetails?.map((detail) => ({
      imageDigest: detail.imageDigest,
      imageTag: detail.imageTags?.[0],
    })) || [];
  }

  /**
   * Delete images from a repository
   */
  async deleteImages(
    repositoryName: string,
    imageIds: ImageIdentifier[]
  ): Promise<void> {
    if (imageIds.length === 0) {
      return;
    }

    const command = new BatchDeleteImageCommand({
      repositoryName,
      imageIds,
    });

    await this.client.send(command);
    console.log(`Deleted ${imageIds.length} images from ${repositoryName}`);
  }

  /**
   * Get repository details
   */
  async getRepository(repositoryName: string): Promise<Repository | null> {
    try {
      const command = new DescribeRepositoriesCommand({
        repositoryNames: [repositoryName],
      });

      const response = await this.client.send(command);
      return response.repositories?.[0] || null;
    } catch (error) {
      if (error instanceof Error && error.name === "RepositoryNotFoundException") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Generate repository name from project details
   */
  static generateRepositoryName(
    organizationId: string,
    projectId: string
  ): string {
    // ECR repository names must be lowercase
    const sanitized = `${organizationId}/${projectId}`
      .toLowerCase()
      .replace(/[^a-z0-9/_-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");

    return `elizaos/${sanitized}`;
  }

  /**
   * Decode ECR authorization token
   */
  static decodeAuthToken(authorizationToken: string): {
    username: string;
    password: string;
  } {
    const decoded = Buffer.from(authorizationToken, "base64").toString("utf-8");
    const [username, password] = decoded.split(":");
    return { username, password };
  }

  /**
   * Get registry hostname from repository URI
   */
  static getRegistryHostname(repositoryUri: string): string {
    return repositoryUri.split("/")[0];
  }

  /**
   * Verify that an ECR image exists before attempting deployment
   * Critical for preventing failed deployments due to missing images
   */
  async verifyImageExists(imageUri: string): Promise<boolean> {
    try {
      // Parse image URI: registry/repository:tag
      const [repoWithRegistry, tag] = imageUri.split(":");
      const repositoryName = repoWithRegistry.split("/").slice(1).join("/");
      
      if (!tag) {
        throw new Error("Image URI must include a tag");
      }

      const command = new DescribeImagesCommand({
        repositoryName,
        imageIds: [{ imageTag: tag }],
      });

      const response = await this.client.send(command);
      return !!(response.imageDetails && response.imageDetails.length > 0);
    } catch (error) {
      if (error instanceof Error && error.name === "ImageNotFoundException") {
        return false;
      }
      throw error;
    }
  }
}

/**
 * Get ECR manager instance with configuration from environment
 */
export function getECRManager(): ECRManager {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS ECR configuration missing. Required: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
    );
  }

  return new ECRManager({
    region,
    accessKeyId,
    secretAccessKey,
  });
}

