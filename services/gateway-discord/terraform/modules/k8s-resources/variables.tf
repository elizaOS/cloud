variable "namespace" {
  description = "Kubernetes namespace name"
  type        = string
  default     = "gateway-discord"
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "ghcr_username" {
  description = "GitHub Container Registry username"
  type        = string
  sensitive   = true
}

variable "ghcr_token" {
  description = "GitHub Container Registry token"
  type        = string
  sensitive   = true
}

variable "eliza_cloud_url" {
  description = "Eliza Cloud URL"
  type        = string
  sensitive   = true
}

variable "gateway_bootstrap_secret" {
  description = "Gateway bootstrap secret"
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Redis URL"
  type        = string
  sensitive   = true
}

variable "redis_token" {
  description = "Redis token"
  type        = string
  sensitive   = true
}

variable "blob_token" {
  description = "Blob storage token"
  type        = string
  sensitive   = true
  default     = ""
}

variable "enable_aws_auth_update" {
  description = "Whether to update aws-auth ConfigMap"
  type        = bool
  default     = false
}

variable "github_actions_role_arn" {
  description = "GitHub Actions IAM role ARN"
  type        = string
  default     = ""
}

variable "node_group_role_arn" {
  description = "EKS node group IAM role ARN (required for nodes to join the cluster)"
  type        = string
}

variable "existing_aws_auth_roles" {
  description = "Additional aws-auth roles to include (beyond node group and GitHub Actions)"
  type        = list(any)
  default     = []
}
