/**
 * AWS CloudFormation Service - Production Ready
 * 
 * Provisions and manages per-user CloudFormation stacks with:
 * - ALB priority management
 * - Retry logic
 * - Better error handling
 * - Cost tracking
 */

import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  type Stack,
  type StackStatus,
} from "@aws-sdk/client-cloudformation";
import * as fs from "node:fs";
import * as path from "node:path";
import { dbPriorityManager } from "./alb-priority-manager";

export interface UserStackConfig {
  userId: string;
  userEmail: string;
  containerImage: string;
  containerPort: number;
  containerCpu: number;
  containerMemory: number;
  keyName?: string;
}

export interface StackOutputs {
  clusterName: string;
  clusterArn: string;
  instanceId: string;
  instancePublicIp: string;
  serviceArn: string;
  taskDefinitionArn: string;
  targetGroupArn: string;
  containerUrl: string;
}

/**
 * CloudFormation Stack Manager for Per-User Deployments - Production Ready
 */
export class CloudFormationService {
  private client: CloudFormationClient;
  private region: string;
  private environment: string;
  private templatePath: string;

  constructor() {
    this.region = process.env.AWS_REGION || "us-east-1";
    this.environment = process.env.ENVIRONMENT || "production";

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    // Allow instantiation without credentials for build time
    // Credentials will be validated on first use
    if (accessKeyId && secretAccessKey) {
      this.client = new CloudFormationClient({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } else {
      // Placeholder client for build time - will fail at runtime if used
      this.client = new CloudFormationClient({ region: this.region });
    }

    // Use production template
    this.templatePath = path.join(
      __dirname,
      "../../infrastructure/cloudformation/per-user-stack.json"
    );
  }

  /**
   * Ensure AWS credentials are configured before making API calls
   */
  private ensureCredentials(): void {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"
      );
    }

    // Re-initialize client if it was created without credentials
    if (!this.client.config.credentials) {
      this.client = new CloudFormationClient({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
  }

  /**
   * Get stack name for a user
   */
  getStackName(userId: string): string {
    return `elizaos-user-${userId}`;
  }

  /**
   * Retry helper for CloudFormation operations
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        // Don't retry validation errors
        if (error instanceof Error && error.name === "ValidationError") {
          throw error;
        }

        if (attempt === maxRetries) {
          throw error;
        }

        const backoffDelay = delayMs * Math.pow(2, attempt - 1);
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(
          `CloudFormation operation failed (attempt ${attempt}/${maxRetries}), retrying in ${backoffDelay}ms...`,
          errorMessage
        );
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
    throw new Error("Max retries exceeded");
  }

  /**
   * Create a new CloudFormation stack for a user with ALB priority management
   */
  async createUserStack(config: UserStackConfig): Promise<string> {
    this.ensureCredentials();
    
    return this.withRetry(async () => {
      const stackName = this.getStackName(config.userId);

      console.log(`Creating CloudFormation stack: ${stackName}`);

      // Allocate unique ALB priority
      const albPriority = await dbPriorityManager.allocatePriority(
        config.userId
      );
      console.log(`Allocated ALB priority ${albPriority} for ${config.userId}`);

      // Load template
      const templateBody = fs.readFileSync(this.templatePath, "utf-8");

      // Get shared infrastructure outputs
      const sharedOutputs = await this.getSharedInfrastructureOutputs();

      const command = new CreateStackCommand({
        StackName: stackName,
        TemplateBody: templateBody,
        Parameters: [
          { ParameterKey: "UserId", ParameterValue: config.userId },
          { ParameterKey: "UserEmail", ParameterValue: config.userEmail },
          {
            ParameterKey: "ContainerImage",
            ParameterValue: config.containerImage,
          },
          {
            ParameterKey: "ContainerPort",
            ParameterValue: config.containerPort.toString(),
          },
          {
            ParameterKey: "ContainerCpu",
            ParameterValue: config.containerCpu.toString(),
          },
          {
            ParameterKey: "ContainerMemory",
            ParameterValue: config.containerMemory.toString(),
          },
          { ParameterKey: "SharedVPCId", ParameterValue: sharedOutputs.vpcId },
          {
            ParameterKey: "SharedSubnetId",
            ParameterValue: sharedOutputs.subnetId,
          },
          { ParameterKey: "SharedALBArn", ParameterValue: sharedOutputs.albArn },
          {
            ParameterKey: "SharedListenerArn",
            ParameterValue: sharedOutputs.listenerArn,
          },
          {
            ParameterKey: "ECSExecutionRoleArn",
            ParameterValue: sharedOutputs.executionRoleArn,
          },
          {
            ParameterKey: "ECSTaskRoleArn",
            ParameterValue: sharedOutputs.taskRoleArn,
          },
          {
            ParameterKey: "SharedALBSecurityGroupId",
            ParameterValue: sharedOutputs.albSecurityGroupId,
          },
          { ParameterKey: "KeyName", ParameterValue: config.keyName || "" },
          {
            ParameterKey: "ListenerRulePriority",
            ParameterValue: albPriority.toString(),
          },
        ],
        Tags: [
          { Key: "UserId", Value: config.userId },
          { Key: "UserEmail", Value: config.userEmail },
          { Key: "ManagedBy", Value: "ElizaOS" },
          { Key: "Environment", Value: this.environment },
          { Key: "BillingEntity", Value: "ElizaOS" },
          { Key: "CostCenter", Value: config.userId },
        ],
        OnFailure: "ROLLBACK",
      });

      const response = await this.client.send(command);
      console.log(`Stack creation initiated: ${response.StackId}`);

      return response.StackId!;
    });
  }

  /**
   * Wait for stack to reach a complete state
   */
  async waitForStackComplete(
    userId: string,
    timeoutMinutes: number = 15
  ): Promise<StackStatus> {
    const stackName = this.getStackName(userId);
    const startTime = Date.now();
    const timeoutMs = timeoutMinutes * 60 * 1000;

    while (Date.now() - startTime < timeoutMs) {
      const stack = await this.getStack(userId);

      if (!stack) {
        throw new Error(`Stack ${stackName} not found`);
      }

      const status = stack.StackStatus;

      // Terminal success states
      if (status === "CREATE_COMPLETE" || status === "UPDATE_COMPLETE") {
        console.log(`Stack ${stackName} completed successfully`);
        return status;
      }

      // Terminal failure states
      if (
        status === "CREATE_FAILED" ||
        status === "ROLLBACK_COMPLETE" ||
        status === "ROLLBACK_FAILED" ||
        status === "DELETE_COMPLETE" ||
        status === "DELETE_FAILED"
      ) {
        // Get failure reason from stack events
        const failureReason = stack.StackStatusReason || "Unknown failure";
        throw new Error(
          `Stack ${stackName} failed with status: ${status}. Reason: ${failureReason}`
        );
      }

      // Still in progress, wait and retry
      console.log(`Stack ${stackName} status: ${status}, waiting...`);
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
    }

    throw new Error(
      `Stack ${stackName} creation timeout after ${timeoutMinutes} minutes`
    );
  }

  /**
   * Get stack details
   */
  async getStack(userId: string): Promise<Stack | null> {
    this.ensureCredentials();
    
    const stackName = this.getStackName(userId);

    try {
      const command = new DescribeStacksCommand({
        StackName: stackName,
      });

      const response = await this.client.send(command);
      return response.Stacks?.[0] || null;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "ValidationError") {
        return null; // Stack doesn't exist
      }
      throw error;
    }
  }

  /**
   * Get stack outputs
   */
  async getStackOutputs(userId: string): Promise<StackOutputs | null> {
    const stack = await this.getStack(userId);

    if (!stack || !stack.Outputs) {
      return null;
    }

    const getOutput = (key: string): string => {
      const output = stack.Outputs!.find((o) => o.OutputKey === key);
      return output?.OutputValue || "";
    };

    return {
      clusterName: getOutput("ClusterName"),
      clusterArn: getOutput("ClusterArn"),
      instanceId: getOutput("InstanceId"),
      instancePublicIp: getOutput("InstancePublicIp"),
      serviceArn: getOutput("ServiceArn"),
      taskDefinitionArn: getOutput("TaskDefinitionArn"),
      targetGroupArn: getOutput("TargetGroupArn"),
      containerUrl: getOutput("ContainerUrl"),
    };
  }

  /**
   * Delete a user's stack and release ALB priority
   */
  async deleteUserStack(userId: string): Promise<void> {
    this.ensureCredentials();
    
    return this.withRetry(async () => {
      const stackName = this.getStackName(userId);

      console.log(`Deleting CloudFormation stack: ${stackName}`);

      const command = new DeleteStackCommand({
        StackName: stackName,
      });

      await this.client.send(command);
      console.log(`Stack deletion initiated: ${stackName}`);
      
      // Release ALB priority after stack deletion initiated
      // This will set expiry timestamp for cleanup
      try {
        await dbPriorityManager.releasePriority(userId);
      } catch (error) {
        console.error(`Failed to release ALB priority for ${userId}:`, error);
        // Don't throw - stack deletion is more critical
      }
    });
  }

  /**
   * Wait for stack deletion
   */
  async waitForStackDeletion(
    userId: string,
    timeoutMinutes: number = 15
  ): Promise<void> {
    const stackName = this.getStackName(userId);
    const startTime = Date.now();
    const timeoutMs = timeoutMinutes * 60 * 1000;

    while (Date.now() - startTime < timeoutMs) {
      const stack = await this.getStack(userId);

      if (!stack) {
        console.log(`Stack ${stackName} deleted successfully`);
        return;
      }

      const status = stack.StackStatus;

      if (status === "DELETE_FAILED") {
        const failureReason = stack.StackStatusReason || "Unknown failure";
        throw new Error(
          `Stack ${stackName} deletion failed. Reason: ${failureReason}`
        );
      }

      console.log(
        `Stack ${stackName} status: ${status}, waiting for deletion...`
      );
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    throw new Error(
      `Stack ${stackName} deletion timeout after ${timeoutMinutes} minutes`
    );
  }

  /**
   * Get shared infrastructure outputs (VPC, ALB, IAM roles)
   */
  private async getSharedInfrastructureOutputs(): Promise<{
    vpcId: string;
    subnetId: string;
    albArn: string;
    listenerArn: string;
    executionRoleArn: string;
    taskRoleArn: string;
    albSecurityGroupId: string;
  }> {
    const sharedStackName = `${this.environment}-elizaos-shared`;

    try {
      const command = new DescribeStacksCommand({
        StackName: sharedStackName,
      });

      const response = await this.client.send(command);
      const stack = response.Stacks?.[0];

      if (!stack || !stack.Outputs) {
        throw new Error(
          `Shared infrastructure stack not found: ${sharedStackName}. Deploy it first using deploy-shared.sh`
        );
      }

      const getOutput = (key: string): string => {
        const output = stack.Outputs!.find((o) => o.OutputKey === key);
        if (!output?.OutputValue) {
          throw new Error(
            `Missing output ${key} in shared infrastructure stack`
          );
        }
        return output.OutputValue;
      };

      return {
        vpcId: getOutput("VPCId"),
        subnetId: getOutput("PublicSubnet1Id"),
        albArn: getOutput("SharedALBArn"),
        listenerArn: getOutput("HTTPSListenerArn"),
        executionRoleArn: getOutput("ECSTaskExecutionRoleArn"),
        taskRoleArn: getOutput("ECSTaskRoleArn"),
        albSecurityGroupId: getOutput("ALBSecurityGroupId"),
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Failed to get shared infrastructure outputs:", errorMessage);
      throw new Error(
        `Cannot provision user stack: shared infrastructure not deployed. Run deploy-shared.sh first.`
      );
    }
  }

  /**
   * Check if shared infrastructure exists
   */
  async isSharedInfrastructureDeployed(): Promise<boolean> {
    try {
      await this.getSharedInfrastructureOutputs();
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const cloudFormationService = new CloudFormationService();

