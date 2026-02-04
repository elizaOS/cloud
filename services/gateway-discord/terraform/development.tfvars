# Development Environment Configuration

environment  = "development"
cluster_name = "gateway-cluster-dev"
aws_region   = "us-east-1"

# VPC Configuration
vpc_cidr             = "10.0.0.0/16"
availability_zones   = ["us-east-1a", "us-east-1b", "us-east-1c"]
private_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
public_subnet_cidrs  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

# NAT Configuration - Use NAT Instance instead of NAT Gateway (saves ~$29/month)
use_nat_instance   = true
nat_instance_type  = "t4g.nano"
single_nat_gateway = true

# EKS Configuration
kubernetes_version              = "1.29"
cluster_endpoint_public_access  = true
cluster_endpoint_private_access = true

# Node Group Configuration - Cost-effective for I/O-bound workload (Discord websockets)
# Using t3 (x86) because Docker image currently only supports amd64
# Discord gateway is I/O bound, not CPU bound - burstable instances are ideal
# TODO: Build ARM64 images to use cheaper t4g instances
node_group_instance_types = ["t3.small", "t3.medium"] # 2 vCPU, 2-4GB RAM
node_group_desired_size   = 1
node_group_min_size       = 1
node_group_max_size       = 3
node_group_disk_size      = 30 # Reduced - mostly stateless workload
node_group_capacity_type  = "ON_DEMAND"

# GitHub Configuration
github_org  = "elizaos"
github_repo = "eliza-cloud-v2"

# aws-auth ConfigMap
enable_aws_auth_update = true

# Tags
tags = {
  Environment = "development"
  Project     = "gateway-discord"
  Team        = "elizaos"
}
