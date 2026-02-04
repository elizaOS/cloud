# Gateway Discord Terraform Infrastructure

This Terraform configuration provisions the AWS infrastructure required for the Discord Gateway service.

## Infrastructure Components

- **VPC**: Virtual Private Cloud with public and private subnets across 3 availability zones
- **NAT Instance**: Cost-effective NAT using t4g.nano/micro EC2 instances (ARM64)
  - Development: Single t4g.nano (~$3/month)
  - Production: Single t4g.micro (~$6/month)
  - Can be switched to NAT Gateway for high-traffic scenarios (see Cost Considerations)
- **EKS Cluster**: Kubernetes cluster for running the gateway service
- **Node Groups**: EC2 instances managed by EKS for running pods
- **IAM Roles**: 
  - EKS cluster role
  - Node group role
  - NAT instance role (with SSM access)
  - GitHub Actions OIDC role for CI/CD
- **Security Groups**: Network security for cluster, nodes, and NAT instance
- **Kubernetes Resources**:
  - Namespace for gateway-discord
  - GHCR image pull secrets
  - Application secrets

## Prerequisites

### Required Tools
1. AWS CLI configured with appropriate credentials
2. Terraform >= 1.5.0
3. kubectl (for interacting with the cluster after creation)
4. Helm (for deploying the gateway-discord chart)

### Required AWS Resources (Before First `terraform init`)

The Terraform backend requires an S3 bucket and DynamoDB table to exist before you can initialize Terraform. These are used to store state files and prevent concurrent modifications.

| Resource | Name | Purpose |
|----------|------|---------|
| S3 Bucket | `eliza-cloud-terraform-state` | Stores Terraform state files |
| DynamoDB Table | `terraform-state-lock` | Prevents concurrent state modifications |

**See [One-Time Setup](#1-create-s3-backend) below for creation commands.**

> **Note**: If these resources don't exist, `terraform init` will fail with an error like:
> `Error: Failed to get existing workspaces: S3 bucket does not exist.`

## Directory Structure

```
services/gateway-discord/terraform/
├── main.tf                    # Main configuration
├── variables.tf               # Input variables
├── variables-sensitive.tf     # Sensitive input variables
├── outputs.tf                 # Output values
├── providers.tf               # Provider configuration
├── versions.tf                # Required versions
├── development.tfvars         # Development environment values
├── production.tfvars          # Production environment values
├── secrets.tfvars.example     # Example secrets file
├── backend-development.hcl    # Backend config for development
├── backend-production.hcl     # Backend config for production
└── modules/
    ├── vpc/                   # VPC module
    ├── eks/                   # EKS module
    ├── github-oidc/           # GitHub OIDC module
    └── k8s-resources/         # Kubernetes resources module
```

## Usage

> **Note**: Infrastructure is managed via a unified GitHub Actions workflow (`.github/workflows/gateway-discord.yml`).
> The workflow auto-detects terraform vs app changes and runs appropriate jobs in sequence:
> - **Push to `dev`** → Terraform apply + app deploy to development
> - **Push to `main`** → Terraform apply + app deploy to production
> - **Pull Requests** → Terraform plan + tests only (no apply/deploy)
> - **Manual dispatch** → Run terraform-plan/terraform-apply/terraform-destroy/deploy on demand
>
> If both terraform and app files change, terraform runs first, then deploy waits for completion.
>
> You only need to complete the **One-Time Setup** below before the workflow can run.

### One-Time Setup

#### 1. Create S3 Backend

Before the GitHub Actions workflow can run, create an S3 bucket and DynamoDB table for state storage. A single bucket is shared by both development and production - environments are separated by key prefix.

```bash
# Create S3 bucket for state (shared by all environments)
aws s3api create-bucket \
  --bucket eliza-cloud-terraform-state \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket eliza-cloud-terraform-state \
  --versioning-configuration Status=Enabled

# Create DynamoDB table for state locking (shared by all environments)
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

**Cost**: S3 + DynamoDB = ~$0/month (state files are tiny, lock operations are rare)

#### 2. Create AWS OIDC Role for GitHub Actions (Optional)

For the GitHub Actions IaC workflow to run, you need an IAM role that trusts GitHub OIDC. This is a one-time manual setup.

> **Alternative**: Skip this step and run Terraform locally using your own AWS credentials. The IaC workflow is optional - you can manage infrastructure locally and only use GitHub Actions for app deployments.

<details>
<summary><strong>Step 2a: Create OIDC Identity Provider</strong></summary>

```bash
# Create the GitHub OIDC provider in your AWS account
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750d4f2df264fcd
```

Or via AWS Console: **IAM → Identity providers → Add provider** (OpenID Connect)
</details>

<details>
<summary><strong>Step 2b: Create IAM Role for Terraform</strong></summary>

Create a file `terraform-role-trust-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": [
            "repo:elizaOS/eliza-cloud-v2:ref:refs/heads/main",
            "repo:elizaOS/eliza-cloud-v2:ref:refs/heads/dev",
            "repo:elizaOS/eliza-cloud-v2:pull_request",
            "repo:elizaOS/eliza-cloud-v2:environment:gateway-dev",
            "repo:elizaOS/eliza-cloud-v2:environment:gateway-prd"
          ]
        }
      }
    }
  ]
}
```

> **Note**: The `pull_request` subject is required for PRs to run Terraform plan. GitHub uses different OIDC subject formats for different event types. Also ensure the org name case matches exactly (`elizaOS` not `elizaos`).

Create the role:

```bash
# Replace YOUR_ACCOUNT_ID in the JSON file first
aws iam create-role \
  --role-name github-actions-gateway-terraform \
  --assume-role-policy-document file://terraform-role-trust-policy.json

# Attach admin policy (required for Terraform to create all resources)
aws iam attach-role-policy \
  --role-name github-actions-gateway-terraform \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

The role ARN will be: `arn:aws:iam::YOUR_ACCOUNT_ID:role/github-actions-gateway-terraform`
</details>

> **Note**: This role needs broad permissions because Terraform creates VPCs, EKS clusters, IAM roles, etc. After Terraform runs, it creates a separate `github-actions-role` with limited EKS-only permissions for app deployments.

#### 3. Configure GitHub Environments

Create two GitHub Environments (`gateway-dev` and `gateway-prd`) in your repository settings with the following:

**Variables** (Settings → Environments → [environment] → Environment variables):
- `TERRAFORM_AWS_ROLE_ARN`: IAM role ARN from Step 2 (e.g., `arn:aws:iam::YOUR_ACCOUNT_ID:role/github-actions-terraform`)
- `AWS_REGION`: `us-east-1`

**Secrets** (Settings → Environments → [environment] → Environment secrets):
- `GHCR_USERNAME`: GitHub Container Registry username
- `GHCR_TOKEN`: GitHub Container Registry token (PAT with `read:packages`)
- `ELIZA_CLOUD_URL`: Eliza Cloud API URL
- `GATEWAY_BOOTSTRAP_SECRET`: Gateway bootstrap secret
- `REDIS_URL`: Redis connection URL
- `REDIS_TOKEN`: Redis authentication token
- `BLOB_TOKEN`: Blob storage token

### Post-Deployment

#### Configure kubectl

After the cluster is created, configure kubectl to access it:

```bash
# For development
aws eks update-kubeconfig --name gateway-cluster-dev --region us-east-1

# For production
aws eks update-kubeconfig --name gateway-cluster-prod --region us-east-1
```

---

### Local Terraform (Recommended)

Running Terraform locally is the simplest approach - no need to set up `TERRAFORM_AWS_ROLE_ARN` or GitHub OIDC for infrastructure.

**Prerequisites:**
- AWS CLI configured with credentials (`aws configure` or `aws sso login`)
- Your AWS user/role needs permissions to create VPCs, EKS, IAM roles, etc.

#### Initialize Terraform

```bash
cd services/gateway-discord/terraform

# For development
terraform init -backend-config=backend-development.hcl

# For production
terraform init -backend-config=backend-production.hcl -reconfigure
```

#### Create Secrets File

```bash
cp secrets.tfvars.example secrets.tfvars
# Edit secrets.tfvars with actual values
```

#### Plan and Apply

```bash
# For development
terraform plan -var-file=development.tfvars -var-file=secrets.tfvars
terraform apply -var-file=development.tfvars -var-file=secrets.tfvars

# For production
terraform plan -var-file=production.tfvars -var-file=secrets.tfvars
terraform apply -var-file=production.tfvars -var-file=secrets.tfvars
```

#### Phased Deployment (Large Infrastructure)

For initial deployment or debugging, you can deploy in phases:

```bash
# Phase 1: VPC and EKS
terraform apply -var-file=development.tfvars -var-file=secrets.tfvars \
  -target=module.vpc \
  -target=module.eks

# Phase 2: GitHub OIDC
terraform apply -var-file=development.tfvars -var-file=secrets.tfvars \
  -target=module.github_oidc

# Phase 3: Kubernetes resources
terraform apply -var-file=development.tfvars -var-file=secrets.tfvars
```

## Outputs

After applying, Terraform outputs:

| Output | Description |
|--------|-------------|
| `cluster_name` | EKS cluster name |
| `cluster_endpoint` | Kubernetes API server endpoint |
| `github_actions_role_arn` | IAM role ARN for GitHub Actions |
| `kubeconfig_command` | Command to configure kubectl |
| `github_actions_variables` | All variables needed for GitHub Actions |

## Destroying Infrastructure

```bash
# CAUTION: This will destroy all resources
terraform destroy -var-file=development.tfvars -var-file=secrets.tfvars
```

## Security Notes

1. Never commit `secrets.tfvars` to version control
2. The S3 state bucket should have encryption enabled
3. Use IAM roles with least-privilege access
4. GitHub OIDC is used instead of long-lived credentials

## Cost Considerations

- **EKS Control Plane**: ~$72/month
- **NAT**:
  - NAT Gateway: ~$32/month per gateway + $0.045/GB data
  - NAT Instance (t4g.nano): ~$3/month (development) - significant cost savings
- **EC2 Instances (EKS nodes)**: Varies by instance type and count
- **Data Transfer**: Varies by usage

### NAT Instance vs NAT Gateway

The infrastructure supports both NAT Gateway and NAT Instance. Configure via `use_nat_instance` variable:

```hcl
# Default: NAT Instance for cost savings (both development and production)
use_nat_instance   = true
nat_instance_type  = "t4g.nano"   # development (~$3/month)
nat_instance_type  = "t4g.micro"  # production (~$6/month)

# High-traffic: Switch to NAT Gateway
use_nat_instance   = false
```

| Feature | NAT Gateway | NAT Instance (t4g.nano/micro) |
|---------|-------------|------------------------------|
| Cost | ~$32/month + data | ~$3-6/month + data |
| Bandwidth | Up to 100 Gbps | Up to 5 Gbps (burst) |
| Availability | Managed, HA | Single instance (can fail) |
| Maintenance | None | OS updates, monitoring |
| Best for | High-traffic, mission-critical | Low-moderate traffic, cost-sensitive |

#### When to Use NAT Gateway

Switch to NAT Gateway (`use_nat_instance = false`) if:

1. **High outbound traffic** (>5 Gbps sustained) - NAT Instance bandwidth limit reached
2. **Mission-critical workloads** - Cannot tolerate any NAT downtime
3. **Compliance requirements** - Need AWS-managed, auditable infrastructure
4. **Multi-AZ redundancy** - Need NAT per AZ for HA (set `single_nat_gateway = false`)

#### When NAT Instance is Sufficient

NAT Instance is recommended for:

1. **Discord gateway workloads** - I/O bound, low bandwidth (websockets + API calls)
2. **Development environments** - Cost optimization priority
3. **Low-moderate traffic production** - <1 Gbps sustained outbound traffic
4. **Cost-sensitive deployments** - Saves ~$26-29/month per NAT

**Note**: For Discord gateway specifically, traffic is primarily:
- Inbound websocket connections (not through NAT)
- Outbound API calls to Vercel (low bandwidth)

This makes NAT Instance ideal for this workload even in production.
