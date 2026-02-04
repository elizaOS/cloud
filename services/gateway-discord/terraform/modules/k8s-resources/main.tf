# Kubernetes Resources Module for Gateway Discord

# Namespace
resource "kubernetes_namespace" "gateway_discord" {
  metadata {
    name = var.namespace

    labels = {
      name        = var.namespace
      environment = var.environment
      managed-by  = "terraform"
    }
  }
}

# GHCR Image Pull Secret
resource "kubernetes_secret" "ghcr_credentials" {
  metadata {
    name      = "ghcr-credentials"
    namespace = kubernetes_namespace.gateway_discord.metadata[0].name
  }

  type = "kubernetes.io/dockerconfigjson"

  data = {
    ".dockerconfigjson" = jsonencode({
      auths = {
        "ghcr.io" = {
          auth = base64encode("${var.ghcr_username}:${var.ghcr_token}")
        }
      }
    })
  }
}

# Application Secrets
resource "kubernetes_secret" "gateway_discord_secrets" {
  metadata {
    name      = "gateway-discord-secrets"
    namespace = kubernetes_namespace.gateway_discord.metadata[0].name

    labels = {
      app         = "gateway-discord"
      environment = var.environment
    }
  }

  data = {
    "eliza-cloud-url"          = var.eliza_cloud_url
    "gateway-bootstrap-secret" = var.gateway_bootstrap_secret
    "redis-url"                = var.redis_url
    "redis-token"              = var.redis_token
    "blob-token"               = var.blob_token
  }
}

# aws-auth ConfigMap update for EKS access
#
# This resource manages the aws-auth ConfigMap which controls IAM role to Kubernetes
# RBAC mappings. It includes:
# - Node group role: Required for worker nodes to join the cluster
# - GitHub Actions role: For CI/CD deployments (system:masters for full access)
#
# The 'system:masters' group for GitHub Actions provides full cluster admin
# permissions, which is required for:
# - Initial cluster bootstrap and namespace creation
# - Helm install/upgrade operations (requires create/update on various resources)
# - Managing secrets, configmaps, and deployments
#
# For tighter security in production, consider:
# 1. Creating a custom ClusterRole with permissions scoped to the gateway-discord namespace
# 2. Using a ClusterRoleBinding to bind the role to the github-actions user
# 3. Granting cluster-level read permissions for kubectl get nodes, etc.
resource "kubernetes_config_map_v1_data" "aws_auth" {
  count = var.enable_aws_auth_update ? 1 : 0

  metadata {
    name      = "aws-auth"
    namespace = "kube-system"
  }

  data = {
    mapRoles = yamlencode(concat(
      # Node group role - required for nodes to register with the cluster
      [
        {
          rolearn  = var.node_group_role_arn
          username = "system:node:{{EC2PrivateDNSName}}"
          groups   = ["system:bootstrappers", "system:nodes"]
        }
      ],
      # GitHub Actions role for CI/CD deployments
      [
        {
          rolearn  = var.github_actions_role_arn
          username = "github-actions"
          groups   = ["system:masters"]
        }
      ],
      # Any additional roles specified by the user
      var.existing_aws_auth_roles
    ))
  }

  # Force update to ensure node group role is always present
  # This is safe because we explicitly include the node group role above
  force = true
}
