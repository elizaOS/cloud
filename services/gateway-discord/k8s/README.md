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

## Required GitHub Secrets

### Automatic (No setup needed)

- **`GITHUB_TOKEN`** - Automatically provided by GitHub, used to push images to GHCR

### Environment-Specific Secrets (Must be configured)

You need to create **two GitHub Environments** (`staging` and `production`) with these secrets:

| Environment | Secret Name | Description |
|-------------|-------------|-------------|
| `staging` | `STAGING_KUBECONFIG` | Full kubeconfig file contents for your staging Kubernetes cluster |
| `production` | `PRODUCTION_KUBECONFIG` | Full kubeconfig file contents for your production Kubernetes cluster |

### Setting Up GitHub Environments

1. Go to your repository **Settings** → **Environments**
2. Create `staging` environment:
   - Add secret `STAGING_KUBECONFIG` with your staging cluster's kubeconfig
   - Optionally configure protection rules (required reviewers, etc.)
3. Create `production` environment:
   - Add secret `PRODUCTION_KUBECONFIG` with your production cluster's kubeconfig
   - Recommended: Add protection rules (required reviewers, deployment branches)

### Getting Kubeconfig Values

For the kubeconfig secrets, you typically get these from your Kubernetes provider:

**AWS EKS:**
```bash
aws eks update-kubeconfig --name <cluster-name> --region <region>
cat ~/.kube/config
```

**Google GKE:**
```bash
gcloud container clusters get-credentials <cluster-name> --zone <zone>
cat ~/.kube/config
```

**Azure AKS:**
```bash
az aks get-credentials --resource-group <rg> --name <cluster-name>
cat ~/.kube/config
```

## Prerequisites

Before the CI/CD pipeline can deploy, ensure the following exist in your clusters:

1. **Namespace**: `gateway-discord`
2. **Deployment**: `gateway-discord` in the namespace

Apply the base manifests first:

```bash
kubectl apply -f namespace.yaml
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
export IMAGE="ghcr.io/<owner>/<repo>/gateway-discord:<tag>"

# Deploy
kubectl set image deployment/gateway-discord gateway=$IMAGE -n gateway-discord
kubectl rollout status deployment/gateway-discord -n gateway-discord
```
