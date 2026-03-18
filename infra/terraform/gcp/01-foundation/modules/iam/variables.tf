variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "github_org" {
  description = "GitHub organization name (e.g. elizaOS)"
  type        = string
}

variable "github_repos" {
  description = "GitHub repos allowed to deploy (e.g. [\"elizaOS/cloud\"])"
  type        = list(string)
}
