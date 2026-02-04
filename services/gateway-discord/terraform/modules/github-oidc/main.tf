# GitHub OIDC Module for CI/CD Deployments

# Data sources for scoping IAM policies
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  # Convert environment name to short suffix (dev/prd)
  env_suffix        = var.environment == "production" ? "prd" : "dev"
  role_name         = "github-actions-gateway-${local.env_suffix}"
  oidc_provider_url = "https://token.actions.githubusercontent.com"
  account_id        = data.aws_caller_identity.current.account_id
  region            = data.aws_region.current.name
}

# Check if GitHub Actions IAM role already exists
data "aws_iam_role" "github_actions_existing" {
  count = var.create_github_actions_role ? 0 : 1
  name  = local.role_name
}

# Fetch GitHub OIDC thumbprint dynamically
data "tls_certificate" "github" {
  url = local.oidc_provider_url
}

# Check if GitHub OIDC provider already exists in the account
data "aws_iam_openid_connect_provider" "github_existing" {
  count = var.create_oidc_provider ? 0 : 1
  url   = local.oidc_provider_url
}

# GitHub OIDC Provider - only create if it doesn't exist
# Uses dynamic thumbprint lookup to handle GitHub certificate rotations
resource "aws_iam_openid_connect_provider" "github" {
  count           = var.create_oidc_provider ? 1 : 0
  url             = local.oidc_provider_url
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github.certificates[0].sha1_fingerprint]

  tags = {
    Name = "github-oidc-provider"
  }
}

locals {
  # Use existing provider ARN if not creating, otherwise use the created one
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github_existing[0].arn
}

# IAM Role for GitHub Actions - only create if not already exists
resource "aws_iam_role" "github_actions" {
  count = var.create_github_actions_role ? 1 : 0
  name  = local.role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = local.oidc_provider_arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = [
              "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/main",
              "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/dev",
              "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/feat/*",
              "repo:${var.github_org}/${var.github_repo}:pull_request",
              "repo:${var.github_org}/${var.github_repo}:environment:gateway-dev",
              "repo:${var.github_org}/${var.github_repo}:environment:gateway-prd"
            ]
          }
        }
      }
    ]
  })

  tags = {
    Name = local.role_name
  }
}

locals {
  # Use existing role if not creating, otherwise use the created one
  github_actions_role_arn = var.create_github_actions_role ? aws_iam_role.github_actions[0].arn : data.aws_iam_role.github_actions_existing[0].arn
  github_actions_role_id  = var.create_github_actions_role ? aws_iam_role.github_actions[0].id : data.aws_iam_role.github_actions_existing[0].id
}

# Policy for EKS access - scoped to specific cluster
resource "aws_iam_role_policy" "github_actions_eks" {
  name = "${local.role_name}-eks-policy"
  role = local.github_actions_role_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "eks:DescribeCluster",
          "eks:ListClusters"
        ]
        # Scoped to the specific cluster for this environment
        Resource = "arn:aws:eks:${local.region}:${local.account_id}:cluster/${var.cluster_name}"
      }
    ]
  })
}

# Policy for ECR access - scoped to gateway-discord repositories
# Note: GetAuthorizationToken requires * resource, but other actions are scoped
resource "aws_iam_role_policy" "github_actions_ecr" {
  name = "${local.role_name}-ecr-policy"
  role = local.github_actions_role_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRGetAuthToken"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        # GetAuthorizationToken must use * resource
        Resource = "*"
      },
      {
        Sid    = "ECRRepositoryAccess"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload"
        ]
        # Scoped to gateway-discord repository pattern
        Resource = "arn:aws:ecr:${local.region}:${local.account_id}:repository/gateway-discord*"
      }
    ]
  })
}

# aws-auth ConfigMap data
# Note: The github-actions-deployers group is bound to custom RBAC roles defined
# in the k8s-resources module, providing least-privilege access:
# - ClusterRole: Read-only access to nodes and namespaces
# - Role: Full access to gateway-discord namespace only
locals {
  aws_auth_configmap_data = {
    mapRoles = yamlencode([
      {
        rolearn  = local.github_actions_role_arn
        username = "github-actions"
        groups   = ["github-actions-deployers"]
      }
    ])
  }
}
