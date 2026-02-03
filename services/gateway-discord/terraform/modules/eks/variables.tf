variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "Public subnet IDs"
  type        = list(string)
}

variable "cluster_endpoint_public_access" {
  description = "Whether to enable public access to the EKS API server"
  type        = bool
  default     = true
}

variable "cluster_endpoint_private_access" {
  description = "Whether to enable private access to the EKS API server"
  type        = bool
  default     = true
}

variable "node_group_instance_types" {
  description = "Instance types for the node group"
  type        = list(string)
}

variable "node_group_desired_size" {
  description = "Desired number of nodes"
  type        = number
}

variable "node_group_min_size" {
  description = "Minimum number of nodes"
  type        = number
}

variable "node_group_max_size" {
  description = "Maximum number of nodes"
  type        = number
}

variable "node_group_disk_size" {
  description = "Disk size in GB for nodes"
  type        = number
}

variable "node_group_capacity_type" {
  description = "Capacity type: ON_DEMAND or SPOT"
  type        = string
}
