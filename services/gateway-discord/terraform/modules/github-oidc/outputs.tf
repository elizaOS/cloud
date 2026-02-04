output "github_oidc_provider_arn" {
  description = "GitHub OIDC provider ARN"
  value       = local.oidc_provider_arn
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions"
  value       = local.github_actions_role_arn
}

output "github_actions_role_name" {
  description = "IAM role name for GitHub Actions"
  value       = local.role_name
}

output "aws_auth_configmap_data" {
  description = "Data to add to aws-auth ConfigMap"
  value       = local.aws_auth_configmap_data
}
