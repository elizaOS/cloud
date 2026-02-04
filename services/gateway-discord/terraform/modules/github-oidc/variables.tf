variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
}

variable "environment" {
  description = "Environment name (development, production)"
  type        = string
}

variable "github_org" {
  description = "GitHub organization name"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
}

variable "create_oidc_provider" {
  description = "Whether to create the GitHub OIDC provider (set to false if it already exists in the account)"
  type        = bool
  default     = true
}

variable "create_github_actions_role" {
  description = "Whether to create the GitHub Actions IAM role (set to false if it already exists)"
  type        = bool
  default     = true
}
