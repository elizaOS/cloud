locals {
  deployer_service_account_email = data.terraform_remote_state.foundation.outputs.service_account_email
}

# Namespaces
resource "kubernetes_namespace" "namespaces" {
  for_each = toset(var.namespaces)

  metadata {
    name = each.value

    labels = {
      name        = each.value
      environment = var.environment
      managed-by  = "terraform"
    }
  }
}

# =============================================================================
# RBAC for CI/CD
# Images are pulled from Artifact Registry natively — no pull secrets needed.
# =============================================================================

# ClusterRole: cluster-level read access
resource "kubernetes_cluster_role" "cluster_reader" {
  metadata {
    name = "github-actions-cluster-reader"
    labels = {
      managed-by = "terraform"
    }
  }

  rule {
    api_groups = [""]
    resources  = ["nodes", "namespaces"]
    verbs      = ["get", "list", "watch"]
  }

  rule {
    api_groups = ["storage.k8s.io"]
    resources  = ["storageclasses"]
    verbs      = ["get", "list", "watch"]
  }
}

# ClusterRoleBinding: bind cluster reader to the CI/CD service account
resource "kubernetes_cluster_role_binding" "cluster_reader" {
  metadata {
    name = "github-actions-cluster-reader"
    labels = {
      managed-by = "terraform"
    }
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role.cluster_reader.metadata[0].name
  }

  subject {
    kind = "User"
    name = local.deployer_service_account_email
  }
}

# Role: namespace-level deployer access (one per namespace)
resource "kubernetes_role" "namespace_deployer" {
  for_each = toset(var.namespaces)

  metadata {
    name      = "github-actions-deployer"
    namespace = kubernetes_namespace.namespaces[each.key].metadata[0].name
    labels = {
      managed-by = "terraform"
    }
  }

  # Core resources
  rule {
    api_groups = [""]
    resources  = ["pods", "pods/log", "pods/exec", "services", "endpoints", "configmaps", "secrets", "serviceaccounts", "persistentvolumeclaims"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }

  # Deployments
  rule {
    api_groups = ["apps"]
    resources  = ["deployments", "replicasets", "statefulsets"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }

  # Batch jobs (Helm hooks)
  rule {
    api_groups = ["batch"]
    resources  = ["jobs", "cronjobs"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }

  # Networking
  rule {
    api_groups = ["networking.k8s.io"]
    resources  = ["ingresses", "networkpolicies"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }

  # Autoscaling
  rule {
    api_groups = ["autoscaling"]
    resources  = ["horizontalpodautoscalers"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }

  # Policy
  rule {
    api_groups = ["policy"]
    resources  = ["poddisruptionbudgets"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }

  # RBAC within namespace
  rule {
    api_groups = ["rbac.authorization.k8s.io"]
    resources  = ["roles", "rolebindings"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }

  # Events (read-only for debugging)
  rule {
    api_groups = [""]
    resources  = ["events"]
    verbs      = ["get", "list", "watch"]
  }
}

# RoleBinding: bind namespace deployer to the CI/CD service account
resource "kubernetes_role_binding" "namespace_deployer" {
  for_each = toset(var.namespaces)

  metadata {
    name      = "github-actions-deployer"
    namespace = kubernetes_namespace.namespaces[each.key].metadata[0].name
    labels = {
      managed-by = "terraform"
    }
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role.namespace_deployer[each.key].metadata[0].name
  }

  subject {
    kind = "User"
    name = local.deployer_service_account_email
  }
}
