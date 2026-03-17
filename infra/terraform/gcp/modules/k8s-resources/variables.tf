variable "environment" {
  description = "Environment name (development, production)"
  type        = string
}

variable "namespaces" {
  description = "List of Kubernetes namespaces to create"
  type        = list(string)
  default     = []
}

variable "deployer_service_account_email" {
  description = "Email of the GCP service account used for CI/CD deployments"
  type        = string
}
