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

1. AWS CLI configured with appropriate credentials
2. Terraform >= 1.5.0
3. kubectl (for interacting with the cluster after creation)
4. Helm (for deploying the gateway-discord chart)

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

> **Note**: Infrastructure is managed automatically via GitHub Actions (`.github/workflows/gateway-discord-iac.yml`).
> - **Push to `dev`** → Auto-applies to development
> - **Push to `main`** → Auto-applies to production
> - **Pull Requests** → Runs plan and posts output as PR comment
> - **Manual dispatch** → Run plan/apply/destroy on demand
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

#### 2. Configure GitHub Environments

Create two GitHub Environments (`development` and `production`) in your repository settings with the following:

**Variables** (Settings → Environments → [environment] → Environment variables):
- `TERRAFORM_AWS_ROLE_ARN`: IAM role ARN for Terraform (needs AWS admin permissions)
- `AWS_REGION`: `us-east-1`

**Secrets** (Settings → Environments → [environment] → Environment secrets):
- `GHCR_USERNAME`: GitHub Container Registry username
- `GHCR_TOKEN`: GitHub Container Registry token (PAT with `read:packages`)
- `ELIZA_CLOUD_URL`: Eliza Cloud API URL
- `GATEWAY_BOOTSTRAP_SECRET`: Gateway bootstrap secret
- `REDIS_URL`: Redis connection URL
- `REDIS_TOKEN`: Redis authentication token
- `BLOB_TOKEN`: Blob storage token

#### 3. Bootstrap AWS OIDC (First Deployment)

For the first deployment, you need an IAM role that trusts GitHub OIDC. Create this manually or use an existing admin role, then the Terraform will create the proper OIDC role for subsequent runs.

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

### Local Development (Optional)

If you need to run Terraform locally for debugging or development:

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
