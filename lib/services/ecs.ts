/**
 * AWS ECS (Elastic Container Service) Integration
 * Handles deployment and management of ElizaOS containers on AWS ECS
 */

import {
  ECSClient,
  CreateServiceCommand,
  UpdateServiceCommand,
  DeleteServiceCommand,
  DescribeServicesCommand,
  DescribeTasksCommand,
  RegisterTaskDefinitionCommand,
  ListTasksCommand,
  type Service as ECSService,
  type TaskDefinition,
  type Task,
} from "@aws-sdk/client-ecs";
import {
  ElasticLoadBalancingV2Client,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
  CreateListenerCommand,
  type LoadBalancer,
  type TargetGroup,
} from "@aws-sdk/client-elastic-load-balancing-v2";

/**
 * Configuration for ECS deployment
 */
export interface ECSConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  clusterName: string;
  vpcId: string;
  subnetIds: string[];
  securityGroupIds: string[];
}

/**
 * Configuration for deploying a container
 */
export interface DeploymentConfig {
  name: string;
  ecrImageUri: string;
  port: number;
  cpu: number; // CPU units (256 = 0.25 vCPU)
  memory: number; // Memory in MB
  desiredCount: number;
  environmentVars?: Record<string, string>;
  healthCheckPath?: string;
}

/**
 * Result of a deployment operation
 */
export interface DeploymentResult {
  serviceArn: string;
  taskDefinitionArn: string;
  loadBalancerUrl?: string;
  status: string;
}

/**
 * AWS ECS Service for managing container deployments
 */
export class ECSManager {
  private ecsClient: ECSClient;
  private elbClient: ElasticLoadBalancingV2Client;
  private config: ECSConfig;

  constructor(config: ECSConfig) {
    this.config = config;
    
    const awsConfig = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    };

    this.ecsClient = new ECSClient(awsConfig);
    this.elbClient = new ElasticLoadBalancingV2Client(awsConfig);
  }

  /**
   * Deploy a container to ECS
   */
  async deployContainer(deploymentConfig: DeploymentConfig): Promise<DeploymentResult> {
    try {
      console.log("Starting ECS container deployment", {
        name: deploymentConfig.name,
        image: deploymentConfig.ecrImageUri,
      });

      // Step 1: Register task definition
      console.log("Registering task definition...");
      const taskDefinition = await this.registerTaskDefinition(deploymentConfig);
      console.log("Task definition registered:", taskDefinition.taskDefinitionArn);

      // Step 2: Create or update load balancer and target group
      console.log("Setting up load balancer...");
      const { loadBalancer, targetGroup } = await this.setupLoadBalancer(deploymentConfig);
      console.log("Load balancer created:", loadBalancer.DNSName);

      // Step 3: Create ECS service
      console.log("Creating ECS service...");
      const service = await this.createService(
        deploymentConfig,
        taskDefinition.taskDefinitionArn!,
        targetGroup.TargetGroupArn!
      );
      console.log("ECS service created:", service.serviceArn);

      const result: DeploymentResult = {
        serviceArn: service.serviceArn!,
        taskDefinitionArn: taskDefinition.taskDefinitionArn!,
        loadBalancerUrl: loadBalancer.DNSName
          ? `http://${loadBalancer.DNSName}`
          : undefined,
        status: "deployed",
      };

      console.log("ECS deployment completed successfully", result);
      return result;
    } catch (error) {
      console.error("ECS deployment failed", error);
      throw new Error(
        `Deployment failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Register a task definition with ECS
   */
  private async registerTaskDefinition(
    config: DeploymentConfig
  ): Promise<TaskDefinition> {
    const environment = Object.entries(config.environmentVars || {}).map(
      ([name, value]) => ({ name, value })
    );

    const command = new RegisterTaskDefinitionCommand({
      family: `elizaos-${config.name}`,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: config.cpu.toString(),
      memory: config.memory.toString(),
      containerDefinitions: [
        {
          name: config.name,
          image: config.ecrImageUri,
          essential: true,
          portMappings: [
            {
              containerPort: config.port,
              protocol: "tcp",
            },
          ],
          environment,
          healthCheck: config.healthCheckPath
            ? {
                command: [
                  "CMD-SHELL",
                  `curl -f http://localhost:${config.port}${config.healthCheckPath} || exit 1`,
                ],
                interval: 30,
                timeout: 5,
                retries: 3,
                startPeriod: 60,
              }
            : undefined,
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": `/ecs/elizaos-${config.name}`,
              "awslogs-region": this.config.region,
              "awslogs-stream-prefix": "ecs",
              "awslogs-create-group": "true",
            },
          },
        },
      ],
      executionRoleArn: process.env.ECS_EXECUTION_ROLE_ARN,
      taskRoleArn: process.env.ECS_TASK_ROLE_ARN,
    });

    const response = await this.ecsClient.send(command);
    if (!response.taskDefinition) {
      throw new Error("Failed to register task definition");
    }

    return response.taskDefinition;
  }

  /**
   * Set up Application Load Balancer and Target Group
   */
  private async setupLoadBalancer(config: DeploymentConfig): Promise<{
    loadBalancer: LoadBalancer;
    targetGroup: TargetGroup;
  }> {
    // Create Application Load Balancer
    const lbCommand = new CreateLoadBalancerCommand({
      Name: `elizaos-${config.name}-alb`,
      Subnets: this.config.subnetIds,
      SecurityGroups: this.config.securityGroupIds,
      Scheme: "internet-facing",
      Type: "application",
      IpAddressType: "ipv4",
    });

    const lbResponse = await this.elbClient.send(lbCommand);
    const loadBalancer = lbResponse.LoadBalancers![0];

    // Create Target Group
    const tgCommand = new CreateTargetGroupCommand({
      Name: `elizaos-${config.name}-tg`,
      Protocol: "HTTP",
      Port: config.port,
      VpcId: this.config.vpcId,
      TargetType: "ip",
      HealthCheckEnabled: true,
      HealthCheckPath: config.healthCheckPath || "/health",
      HealthCheckProtocol: "HTTP",
      HealthCheckIntervalSeconds: 30,
      HealthCheckTimeoutSeconds: 5,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 3,
    });

    const tgResponse = await this.elbClient.send(tgCommand);
    const targetGroup = tgResponse.TargetGroups![0];

    // Create Listener
    const listenerCommand = new CreateListenerCommand({
      LoadBalancerArn: loadBalancer.LoadBalancerArn,
      Protocol: "HTTP",
      Port: 80,
      DefaultActions: [
        {
          Type: "forward",
          TargetGroupArn: targetGroup.TargetGroupArn,
        },
      ],
    });

    await this.elbClient.send(listenerCommand);

    return { loadBalancer, targetGroup };
  }

  /**
   * Create ECS service
   */
  private async createService(
    config: DeploymentConfig,
    taskDefinitionArn: string,
    targetGroupArn: string
  ): Promise<ECSService> {
    const command = new CreateServiceCommand({
      cluster: this.config.clusterName,
      serviceName: `elizaos-${config.name}`,
      taskDefinition: taskDefinitionArn,
      desiredCount: config.desiredCount,
      launchType: "FARGATE",
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: this.config.subnetIds,
          securityGroups: this.config.securityGroupIds,
          assignPublicIp: "ENABLED",
        },
      },
      loadBalancers: [
        {
          targetGroupArn,
          containerName: config.name,
          containerPort: config.port,
        },
      ],
      healthCheckGracePeriodSeconds: 60,
      deploymentConfiguration: {
        maximumPercent: 200,
        minimumHealthyPercent: 100,
        deploymentCircuitBreaker: {
          enable: true,
          rollback: true,
        },
      },
    });

    const response = await this.ecsClient.send(command);
    if (!response.service) {
      throw new Error("Failed to create ECS service");
    }

    return response.service;
  }

  /**
   * Update an existing ECS service
   */
  async updateService(
    serviceArn: string,
    updates: {
      desiredCount?: number;
      taskDefinitionArn?: string;
    }
  ): Promise<ECSService> {
    const command = new UpdateServiceCommand({
      cluster: this.config.clusterName,
      service: serviceArn,
      desiredCount: updates.desiredCount,
      taskDefinition: updates.taskDefinitionArn,
      forceNewDeployment: !!updates.taskDefinitionArn,
    });

    const response = await this.ecsClient.send(command);
    if (!response.service) {
      throw new Error("Failed to update ECS service");
    }

    return response.service;
  }

  /**
   * Delete an ECS service
   */
  async deleteService(serviceArn: string): Promise<void> {
    // Scale down to 0
    await this.updateService(serviceArn, { desiredCount: 0 });

    // Delete service
    const command = new DeleteServiceCommand({
      cluster: this.config.clusterName,
      service: serviceArn,
      force: true,
    });

    await this.ecsClient.send(command);
  }

  /**
   * Get service status
   */
  async getServiceStatus(serviceArn: string): Promise<{
    status: string;
    runningCount: number;
    desiredCount: number;
    tasks: Task[];
  }> {
    const command = new DescribeServicesCommand({
      cluster: this.config.clusterName,
      services: [serviceArn],
    });

    const response = await this.ecsClient.send(command);
    const service = response.services?.[0];

    if (!service) {
      throw new Error("Service not found");
    }

    // Get task details
    const tasksCommand = new ListTasksCommand({
      cluster: this.config.clusterName,
      serviceName: serviceArn,
    });

    const tasksResponse = await this.ecsClient.send(tasksCommand);
    const taskArns = tasksResponse.taskArns || [];

    let tasks: Task[] = [];
    if (taskArns.length > 0) {
      const describeTasksCommand = new DescribeTasksCommand({
        cluster: this.config.clusterName,
        tasks: taskArns,
      });

      const describeTasksResponse = await this.ecsClient.send(describeTasksCommand);
      tasks = describeTasksResponse.tasks || [];
    }

    return {
      status: service.status || "UNKNOWN",
      runningCount: service.runningCount || 0,
      desiredCount: service.desiredCount || 0,
      tasks,
    };
  }

  /**
   * Check container health
   */
  async checkContainerHealth(loadBalancerUrl: string): Promise<boolean> {
    try {
      const response = await fetch(loadBalancerUrl, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Get ECS manager instance with configuration from environment
 */
export function getECSManager(): ECSManager {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const clusterName = process.env.ECS_CLUSTER_NAME;
  const vpcId = process.env.AWS_VPC_ID;
  const subnetIds = process.env.AWS_SUBNET_IDS?.split(",") || [];
  const securityGroupIds = process.env.AWS_SECURITY_GROUP_IDS?.split(",") || [];

  if (!region || !accessKeyId || !secretAccessKey || !clusterName || !vpcId) {
    throw new Error(
      "AWS ECS configuration missing. Required: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, ECS_CLUSTER_NAME, AWS_VPC_ID"
    );
  }

  if (subnetIds.length === 0 || securityGroupIds.length === 0) {
    throw new Error(
      "AWS network configuration missing. Required: AWS_SUBNET_IDS, AWS_SECURITY_GROUP_IDS"
    );
  }

  return new ECSManager({
    region,
    accessKeyId,
    secretAccessKey,
    clusterName,
    vpcId,
    subnetIds,
    securityGroupIds,
  });
}

