variable "environment" {
  description = "Environment name (development, production)"
  type        = string
  validation {
    condition     = contains(["development", "production"], var.environment)
    error_message = "Environment must be 'development' or 'production'"
  }
}

variable "namespaces" {
  description = "List of Kubernetes namespaces to create"
  type        = list(string)
  default     = []
}
