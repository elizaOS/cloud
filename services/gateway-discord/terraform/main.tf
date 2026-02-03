# Main Terraform Configuration for Gateway Discord Infrastructure
# This creates all the AWS infrastructure needed for the Discord gateway service

locals {
  cluster_name = var.cluster_name != "" ? var.cluster_name : "gateway-cluster-${var.environment == "production" ? "prod" : "dev"}"
}

# VPC Module
module "vpc" {
  source = "./modules/vpc"

  vpc_cidr             = var.vpc_cidr
  cluster_name         = local.cluster_name
  availability_zones   = var.availability_zones
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs

  # NAT Configuration - use NAT Instance for development (cost savings)
  use_nat_instance   = var.use_nat_instance
  nat_instance_type  = var.nat_instance_type
  single_nat_gateway = var.single_nat_gateway
}

# EKS Module
module "eks" {
  source = "./modules/eks"

  cluster_name                    = local.cluster_name
  kubernetes_version              = var.kubernetes_version
  environment                     = var.environment
  vpc_id                          = module.vpc.vpc_id
  private_subnet_ids              = module.vpc.private_subnet_ids
  public_subnet_ids               = module.vpc.public_subnet_ids
  cluster_endpoint_public_access  = var.cluster_endpoint_public_access
  cluster_endpoint_private_access = var.cluster_endpoint_private_access
  node_group_instance_types       = var.node_group_instance_types
  node_group_desired_size         = var.node_group_desired_size
  node_group_min_size             = var.node_group_min_size
  node_group_max_size             = var.node_group_max_size
  node_group_disk_size            = var.node_group_disk_size
  node_group_capacity_type        = var.node_group_capacity_type
}

# GitHub OIDC Module
module "github_oidc" {
  source = "./modules/github-oidc"

  cluster_name = local.cluster_name
  github_org   = var.github_org
  github_repo  = var.github_repo
}

# Kubernetes Resources Module
# Note: This module requires the EKS cluster to be ready
# Run with: terraform apply -target=module.vpc -target=module.eks first
# Then: terraform apply to create K8s resources
module "k8s_resources" {
  source = "./modules/k8s-resources"

  namespace                = "gateway-discord"
  environment              = var.environment
  ghcr_username            = var.ghcr_username
  ghcr_token               = var.ghcr_token
  eliza_cloud_url          = var.eliza_cloud_url
  gateway_bootstrap_secret = var.gateway_bootstrap_secret
  redis_url                = var.redis_url
  redis_token              = var.redis_token
  blob_token               = var.blob_token
  enable_aws_auth_update   = var.enable_aws_auth_update
  github_actions_role_arn  = module.github_oidc.github_actions_role_arn
  existing_aws_auth_roles  = var.existing_aws_auth_roles

  depends_on = [module.eks]
}
