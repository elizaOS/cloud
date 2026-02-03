# Backend configuration for staging environment
# Usage: terraform init -backend-config=backend-staging.hcl

bucket         = "eliza-cloud-terraform-state-staging"
key            = "gateway-discord/terraform.tfstate"
region         = "us-east-1"
encrypt        = true
dynamodb_table = "terraform-state-lock"
