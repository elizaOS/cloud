# GitHub OIDC Module for CI/CD Deployments

locals {
  # Convert environment name to short suffix (dev/prd)
  env_suffix = var.environment == "production" ? "prd" : "dev"
  role_name  = "github-actions-gateway-${local.env_suffix}"
}

# GitHub OIDC Provider
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]

  tags = {
    Name = "github-oidc-provider"
  }
}

# IAM Role for GitHub Actions
resource "aws_iam_role" "github_actions" {
  name = local.role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
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

# Policy for EKS access
resource "aws_iam_role_policy" "github_actions_eks" {
  name = "${local.role_name}-eks-policy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "eks:DescribeCluster",
          "eks:ListClusters"
        ]
        Resource = "*"
      }
    ]
  })
}

# Policy for ECR access (if needed)
resource "aws_iam_role_policy" "github_actions_ecr" {
  name = "${local.role_name}-ecr-policy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload"
        ]
        Resource = "*"
      }
    ]
  })
}

# aws-auth ConfigMap data
# This needs to be applied via Kubernetes provider or eksctl
# to grant the GitHub Actions role access to the cluster
locals {
  aws_auth_configmap_data = {
    mapRoles = yamlencode([
      {
        rolearn  = aws_iam_role.github_actions.arn
        username = "github-actions"
        groups   = ["system:masters"]
      }
    ])
  }
}
