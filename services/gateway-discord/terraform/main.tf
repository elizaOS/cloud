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
  # Note: nat_instance_key_name intentionally not passed - SSM-only access is preferred
  # for security (no SSH keys needed). NAT instance has SSM agent enabled via IAM role.
  # To enable SSH access, add nat_instance_key_name variable to root module and pass here.
}

# EKS Module - Using official terraform-aws-modules/eks/aws v21.x
# https://registry.terraform.io/modules/terraform-aws-modules/eks/aws/latest
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = local.cluster_name
  kubernetes_version = var.kubernetes_version

  # VPC Configuration
  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnet_ids
  control_plane_subnet_ids = concat(module.vpc.private_subnet_ids, module.vpc.public_subnet_ids)

  # Cluster Endpoint Access
  endpoint_public_access       = var.cluster_endpoint_public_access
  endpoint_public_access_cidrs = var.cluster_endpoint_public_access_cidrs
  endpoint_private_access      = var.cluster_endpoint_private_access

  # Authentication - API and ConfigMap mode for flexibility
  authentication_mode                      = "API_AND_CONFIG_MAP"
  enable_cluster_creator_admin_permissions = true

  # KMS encryption for secrets
  create_kms_key                  = true
  kms_key_aliases                 = ["alias/${local.cluster_name}-eks"]
  kms_key_deletion_window_in_days = 7
  enable_kms_key_rotation         = true

  encryption_config = {
    resources = ["secrets"]
  }

  # CloudWatch logging
  enabled_log_types                      = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  create_cloudwatch_log_group            = true
  cloudwatch_log_group_retention_in_days = 30

  # OIDC provider for IRSA (IAM Roles for Service Accounts)
  enable_irsa = true

  # EKS Addons
  addons = {
    vpc-cni = {
      most_recent                 = true
      resolve_conflicts_on_update = "OVERWRITE"
    }
    coredns = {
      most_recent                 = true
      resolve_conflicts_on_update = "OVERWRITE"
    }
    kube-proxy = {
      most_recent                 = true
      resolve_conflicts_on_update = "OVERWRITE"
    }
  }

  # EKS Access Entries for cluster administrators
  access_entries = {
    for idx, arn in var.cluster_admin_arns : "admin-${idx}" => {
      principal_arn = arn
      type          = "STANDARD"
      policy_associations = {
        admin = {
          policy_arn = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
          access_scope = {
            type = "cluster"
          }
        }
      }
    }
  }

  # Managed Node Group
  eks_managed_node_groups = {
    main = {
      name = "${local.cluster_name}-node-group"

      instance_types = var.node_group_instance_types
      capacity_type  = var.node_group_capacity_type
      disk_size      = var.node_group_disk_size

      min_size     = var.node_group_min_size
      max_size     = var.node_group_max_size
      desired_size = var.node_group_desired_size

      labels = {
        role        = "gateway-discord"
        environment = var.environment
      }

      update_config = {
        max_unavailable = 1
      }
    }
  }

  # Security Group Rules - Allow VPC CIDR for NAT instance return traffic
  node_security_group_additional_rules = {
    ingress_from_vpc = {
      description = "Allow all traffic from VPC for NAT instance return traffic"
      protocol    = "-1"
      from_port   = 0
      to_port     = 0
      type        = "ingress"
      cidr_blocks = [var.vpc_cidr]
    }
  }

  tags = {
    Name        = local.cluster_name
    Environment = var.environment
  }
}

# GitHub OIDC Module
module "github_oidc" {
  source = "./modules/github-oidc"

  cluster_name               = local.cluster_name
  environment                = var.environment
  github_org                 = var.github_org
  github_repo                = var.github_repo
  create_oidc_provider       = var.create_oidc_provider
  create_github_actions_role = var.create_github_actions_role
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
  node_group_role_arn      = module.eks.eks_managed_node_groups["main"].iam_role_arn
  github_actions_role_arn  = module.github_oidc.github_actions_role_arn
  existing_aws_auth_roles  = var.existing_aws_auth_roles

  depends_on = [module.eks]
}
