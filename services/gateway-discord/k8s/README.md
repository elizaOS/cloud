# Kubernetes Deployment for Gateway Discord

This directory contains Kubernetes manifests for deploying the Discord Gateway Service.

## Files Overview

| File | Description |
|------|-------------|
| `namespace.yaml` | Creates the `gateway-discord` namespace |
| `deployment.yaml` | Main deployment configuration |
| `hpa.yaml` | Horizontal Pod Autoscaler for auto-scaling |
| `pdb.yaml` | Pod Disruption Budget for high availability |
| `servicemonitor.yaml` | Prometheus ServiceMonitor for metrics |
| `alerts.yaml` | Prometheus alerting rules |

## GitHub Actions CI/CD

The workflow at `.github/workflows/gateway-discord.yml` handles the CI/CD pipeline.

### Authentication Flow (OIDC)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GitHub Actions                                │
│                                                                      │
│  1. GitHub generates OIDC token                                      │
│  2. Token exchanged for AWS credentials via IAM Role                │
│  3. AWS credentials used to authenticate with EKS                   │
│  4. kubectl commands executed against cluster                        │
│                                                                      │
│  No static credentials stored! ✓                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Triggers

| Trigger | Condition |
|---------|-----------|
| **Push** | To `main` or `dev` branches, only when files change in `services/gateway-discord/`, `lib/services/gateway-discord/`, or the workflow file itself |
| **Pull Request** | To `main` or `dev` branches with the same path filters |
| **Manual** (`workflow_dispatch`) | Allows manual deployment with environment selection (staging/production) |

### Jobs

1. **`test`** - Runs tests using Bun in the `services/gateway-discord` directory
2. **`build`** - Builds a Docker image and pushes it to GitHub Container Registry (`ghcr.io`)
3. **`deploy-staging`** - Deploys to staging when pushing to `dev` or manually selecting staging
4. **`deploy-production`** - Deploys to production when pushing to `main` or manually selecting production

## AWS OIDC Setup (One-Time)

This setup allows GitHub Actions to authenticate with AWS without storing any credentials.

### Step 1: Create OIDC Identity Provider in AWS

```bash
# Get the GitHub OIDC thumbprint (or use AWS Console)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Or via AWS Console:
1. Go to **IAM** → **Identity providers** → **Add provider**
2. Provider type: **OpenID Connect**
3. Provider URL: `https://token.actions.githubusercontent.com`
4. Audience: `sts.amazonaws.com`
5. Click **Add provider**

### Step 2: Create IAM Role for GitHub Actions

Create a file `github-actions-role-trust-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:elizaOS/eliza-cloud-v2:*"
        }
      }
    }
  ]
}
```

Create the role:

```bash
aws iam create-role \
  --role-name github-actions-gateway-discord \
  --assume-role-policy-document file://github-actions-role-trust-policy.json
```

### Step 3: Attach Permissions to the Role

Create a file `eks-deploy-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "eks:DescribeCluster",
        "eks:ListClusters"
      ],
      "Resource": "*"
    }
  ]
}
```

Attach the policy:

```bash
aws iam put-role-policy \
  --role-name github-actions-gateway-discord \
  --policy-name eks-access \
  --policy-document file://eks-deploy-policy.json
```

### Step 4: Grant EKS Access to the IAM Role

Use EKS Access Entries (the modern approach) to grant the IAM role access to the cluster.

**Via AWS CLI:**

```bash
# Create access entry for the GitHub Actions role
aws eks create-access-entry \
  --cluster-name gateway-cluster \
  --principal-arn arn:aws:iam::<AWS_ACCOUNT_ID>:role/github-actions-gateway-discord \
  --type STANDARD \
  --region us-east-1

# Associate the cluster admin policy
aws eks associate-access-policy \
  --cluster-name gateway-cluster \
  --principal-arn arn:aws:iam::<AWS_ACCOUNT_ID>:role/github-actions-gateway-discord \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy \
  --access-scope type=cluster \
  --region us-east-1
```

**Via AWS Console:**

1. Go to **EKS** → **gateway-cluster** → **Access** tab
2. Click **Create access entry**
3. IAM principal ARN: `arn:aws:iam::<AWS_ACCOUNT_ID>:role/github-actions-gateway-discord`
4. Type: **Standard**
5. Click **Add access policy**
6. Policy: **AmazonEKSClusterAdminPolicy**
7. Access scope: **Cluster**
8. Click **Create**

**Verify it worked:**

```bash
aws eks list-access-entries --cluster-name gateway-cluster --region us-east-1
```

### Step 5: Configure GitHub Environment Variables

1. Go to repository **Settings** → **Environments**
2. Create/edit `staging` environment:
   - Add variable `GATEWAY_AWS_ROLE_ARN` = `arn:aws:iam::<AWS_ACCOUNT_ID>:role/github-actions-gateway-discord`
3. Create/edit `production` environment:
   - Add variable `GATEWAY_AWS_ROLE_ARN` = `arn:aws:iam::<AWS_ACCOUNT_ID>:role/github-actions-gateway-discord`
   - Recommended: Add protection rules (required reviewers, deployment branches)

## Required GitHub Configuration

### Environment Variables (per environment)

| Environment | Variable | Description |
|-------------|----------|-------------|
| `staging` | `GATEWAY_AWS_ROLE_ARN` | ARN of the IAM role for OIDC authentication |
| `production` | `GATEWAY_AWS_ROLE_ARN` | ARN of the IAM role for OIDC authentication |

### Workflow Environment Variables

These are set in the workflow file and may need adjustment:

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_AWS_REGION` | `us-east-1` | AWS region where EKS cluster is located |
| `GATEWAY_CLUSTER_NAME` | `gateway-cluster` | Name of your EKS cluster |

## Kubernetes Prerequisites

Before the CI/CD pipeline can deploy, ensure the following exist in your cluster:

### 1. Create the Namespace

```bash
kubectl apply -f namespace.yaml
```

### 2. Create GHCR Pull Secret

The deployment pulls images from GitHub Container Registry (GHCR), which requires authentication:

```bash
# Create a GitHub PAT with read:packages scope at:
# https://github.com/settings/tokens/new?scopes=read:packages

kubectl create secret docker-registry ghcr-credentials \
  --namespace=gateway-discord \
  --docker-server=ghcr.io \
  --docker-username=<github-username> \
  --docker-password=<github-pat> \
  --docker-email=<email>
```

### 3. Create Application Secrets

```bash
kubectl create secret generic gateway-discord-secrets \
  --namespace=gateway-discord \
  --from-literal=eliza-cloud-url="https://your-eliza-cloud-url.com" \
  --from-literal=internal-api-key="your-internal-api-key" \
  --from-literal=redis-url="https://your-redis-url" \
  --from-literal=redis-token="your-redis-token" \
  --from-literal=blob-token="your-blob-token"
```

### 4. Apply Manifests

```bash
kubectl apply -f deployment.yaml
kubectl apply -f hpa.yaml
kubectl apply -f pdb.yaml
kubectl apply -f servicemonitor.yaml
kubectl apply -f alerts.yaml
```

## Manual Deployment

To deploy manually without CI/CD:

```bash
# Set the image
export IMAGE="ghcr.io/elizaOS/eliza-cloud-v2/gateway-discord:<tag>"

# Deploy
kubectl set image deployment/gateway-discord gateway=$IMAGE -n gateway-discord
kubectl rollout status deployment/gateway-discord -n gateway-discord
```

## Troubleshooting

### OIDC Authentication Errors

If you see "Error assuming role":
1. Verify the OIDC provider exists in IAM
2. Check the trust policy has the correct repo name
3. Ensure `id-token: write` permission is in the workflow

### EKS Access Denied

If kubectl commands fail with "Unauthorized":
1. Verify the IAM role has an EKS access entry:
   ```bash
   aws eks list-access-entries --cluster-name gateway-cluster --region us-east-1
   ```
2. Check the access policy is associated:
   ```bash
   aws eks list-associated-access-policies \
     --cluster-name gateway-cluster \
     --principal-arn arn:aws:iam::<AWS_ACCOUNT_ID>:role/github-actions-gateway-discord \
     --region us-east-1
   ```
3. Ensure the cluster name and region are correct in the workflow

### Image Pull Errors

If pods fail with "ImagePullBackOff":
1. Verify `ghcr-credentials` secret exists in the namespace
2. Check the GitHub PAT has `read:packages` scope
3. Ensure `imagePullSecrets` is configured in deployment
