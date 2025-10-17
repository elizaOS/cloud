# ElizaOS Cloud Infrastructure

**Production-ready container deployment infrastructure using AWS CloudFormation, EC2, and ECS.**

---

## 🎯 Core Principle

**1 User = 1 EC2 Instance + 1 ECS Container**

- ✅ No Fargate (EC2 launch type only)
- ✅ No auto-scaling
- ✅ Simple, cost-effective deployment
- ✅ Shared ALB for all users
- ✅ Maximum resource utilization (87.5% of instance)

---

## 🏗️ Architecture

### Infrastructure Diagram

```
┌─────────────────────────────────────────────────────────┐
│              Shared Infrastructure (Deploy Once)         │
├─────────────────────────────────────────────────────────┤
│  • VPC (10.0.0.0/16) with 2 public subnets             │
│  • Application Load Balancer (HTTPS + HTTP→HTTPS)      │
│  • HTTPS Listener with ACM Certificate                  │
│  • IAM Roles (ECS Instance, Task Execution, Task)      │
│  • Security Groups (ALB + container isolation)          │
│                                                          │
│  Cost: ~$21-36/month (fixed, shared across all users)  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│            Per-User Stack (Deploy Per User)              │
├─────────────────────────────────────────────────────────┤
│  • 1x t3g.small EC2 instance (2 vCPU ARM, 2 GB RAM)    │
│  • ECS Cluster (EC2 launch type, Container Insights)   │
│  • ECS Task Definition:                                 │
│    - CPU: 1792 units (1.75 vCPU, 87.5% utilization)   │
│    - Memory: 1792 MB (1.75 GB, 87.5% utilization)     │
│    - Overhead: 256 CPU + 256 MB (ECS agent + OS)      │
│  • ECS Service (desired count: 1, circuit breaker)     │
│  • ALB Target Group + Unique Listener Rule             │
│  • Security Group (allows ALB traffic only)             │
│  • CloudWatch Logs (7 day retention)                    │
│  • CloudWatch Alarms:                                   │
│    - EC2 system check (auto-recovery)                  │
│    - Unhealthy targets                                  │
│    - High CPU (>80%)                                    │
│    - High memory (>80%)                                 │
│                                                          │
│  Cost: ~$14.71/month per user                          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              https://{userId}.elizacloud.ai
```

### Key Features

#### 🚀 Deployment
- One-command deployment via `elizaos deploy`
- Docker image pushed to ECR
- CloudFormation stack provisioned automatically
- Sequential ALB priority allocation (no collisions)
- Full teardown automation with prorated refunds

#### 📊 Monitoring
- Real-time metrics (CPU, memory, network I/O)
- CloudWatch alarms with auto-recovery
- Dynamic log stream discovery
- Container Insights enabled
- Health checks every 30 seconds

#### 🔒 Security
- VPC isolation (10.0.0.0/16)
- Security groups (ALB → container only)
- HTTPS with ACM certificates
- EBS encryption
- IMDSv2 required (token-based metadata)
- Deployment circuit breaker (auto-rollback)

#### 💰 Billing
- Credit-based system
- Automatic deduction on deployment
- Prorated refunds for early deletion
- Cost tracking via resource tags

---

## 🚀 Quick Start

### Prerequisites

1. **AWS Account** with administrator access
2. **ACM Certificate** for `*.elizacloud.ai`:
   ```bash
   aws acm request-certificate \
     --domain-name '*.elizacloud.ai' \
     --validation-method DNS \
     --region us-east-1
   ```
3. **Environment Variables**:
   ```bash
   export AWS_REGION=us-east-1
   export AWS_ACCESS_KEY_ID=AKIA...
   export AWS_SECRET_ACCESS_KEY=...
   export ACM_CERTIFICATE_ARN=arn:aws:acm:us-east-1:ACCOUNT:certificate/ID
   export ENVIRONMENT=production
   ```

### Step 1: Deploy Shared Infrastructure (One Time)

```bash
cd infrastructure/cloudformation
bash deploy-shared.sh
```

**What this creates**:
- VPC with 2 availability zones
- Application Load Balancer (internet-facing)
- HTTPS listener (port 443) with your ACM certificate
- HTTP listener (port 80) with redirect to HTTPS
- IAM roles for ECS (instance, task execution, task)
- Security groups

**Duration**: 5-10 minutes  
**Cost**: ~$21-36/month (fixed)

**Outputs** (save these):
```bash
aws cloudformation describe-stacks \
  --stack-name production-elizaos-shared \
  --region us-east-1 \
  --query 'Stacks[0].Outputs'
```

### Step 2: Configure DNS

Point wildcard DNS to the ALB:

```bash
# Get ALB DNS name
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name production-elizaos-shared \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`SharedALBDNS`].OutputValue' \
  --output text)

echo "Create DNS record: *.elizacloud.ai → CNAME → $ALB_DNS"
```

**Verify**:
```bash
dig test.elizacloud.ai
# Should resolve to ALB IP addresses
```

### Step 3: Run Database Migrations

```bash
cd ../..  # Back to eliza-cloud-v2 root

# Apply migrations
npm run db:migrate

# Verify ALB priorities table
psql $DATABASE_URL -c "SELECT * FROM alb_priorities LIMIT 5;"

# Verify container schema updates
psql $DATABASE_URL -c "\d containers"
# Should show: cpu default 1792, memory default 1792
```

### Step 4: Set Up Cron Jobs

Add to `.env.local`:
```bash
CRON_SECRET=$(openssl rand -hex 32)
echo "CRON_SECRET=$CRON_SECRET" >> .env.local
```

Cron jobs are configured in `vercel.json` and run automatically on Vercel:
- `/api/cron/cleanup-priorities` - Runs hourly to cleanup expired ALB priorities

**Test locally**:
```bash
curl http://localhost:3000/api/cron/cleanup-priorities \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Step 5: Deploy Test Container

```bash
# From a test ElizaOS project
export ELIZAOS_API_KEY="eliza_your_key"
elizaos deploy --name test-container
```

**Expected output**:
```
🚀 Starting ElizaOS deployment...
🐳 Building Docker image...
☁️  Pushing to ECR...
✅ Container created: <container-id>
⏳ Waiting for deployment (10-15 minutes)...
✅ Deployment successful!
🌐 URL: https://<userId>.elizacloud.ai
```

**Verify**:
1. Check dashboard: https://elizacloud.ai/dashboard/containers
2. View metrics (wait 5 minutes for CloudWatch data)
3. View logs (should show container startup)
4. Test URL: `curl https://<userId>.elizacloud.ai/health`

---

## 📁 File Structure

### CloudFormation Templates (`cloudformation/`)

**Production Templates**:
- `shared-infrastructure.json`
  - VPC, ALB, IAM roles
  - Deploy once per environment
  - ~$21-36/month

- `per-user-stack.json` ✅ **Enhanced with monitoring**
  - EC2 instance (t3g.small ARM)
  - ECS cluster + service
  - Target group + ALB listener rule
  - CloudWatch alarms (health, CPU, memory, EC2 recovery)
  - Container Insights enabled
  - Deployment circuit breaker
  - ~$14.71/month per user

**Deployment Scripts**:
- `deploy-shared.sh` - Deploy shared infrastructure
- `teardown-user-stack.sh` - Delete single user stack
- `teardown-all-user-stacks.sh` - Delete all user stacks (⚠️ dangerous)
- `list-user-stacks.sh` - List all deployed user stacks

### Services (`../lib/services/`)

**AWS Integration**:
- `cloudformation.ts`
  - Stack creation/deletion/monitoring
  - Retry logic with exponential backoff
  - Error handling and validation
  - Shared infrastructure output retrieval

- `alb-priority-manager.ts` ✅ **Simplified**
  - Sequential priority allocation (MAX + 1)
  - Soft deletes with 1-hour expiry
  - Stats API for monitoring
  - Cleanup automation support

- `ecr.ts`
  - Repository creation
  - Image verification
  - Auth token generation
  - Lifecycle policies (keep last 10 images)

**Container Management**:
- `containers.ts` - Container CRUD operations
- `container-quota.ts` - Quota enforcement
- `container-status.ts` - Status updates
- `health-monitor.ts` - Health checking (fixed)

### API Endpoints (`../app/api/v1/containers/`)

**Container Management**:
- `route.ts` - POST (create), GET (list)
- `credentials/route.ts` - POST (get ECR auth)
- `quota/route.ts` - GET (check limits)
- `[id]/route.ts` - GET (details), DELETE (teardown), PATCH (update)

**Monitoring** ✅ **New/Enhanced**:
- `[id]/logs/route.ts` - GET (CloudWatch logs with dynamic stream discovery)
- `[id]/metrics/route.ts` - GET (CloudWatch metrics: CPU, memory, network)

**Automation**:
- `../api/cron/cleanup-priorities/route.ts` - Hourly priority cleanup

### UI Components (`../components/containers/`)

- `containers-table.tsx` - Container list with actions
- `container-metrics.tsx` ✅ **NEW** - Real-time metrics dashboard
- `container-logs-viewer.tsx` - Log viewer with auto-refresh
- `container-deployment-history.tsx` - Deployment timeline
- `containers-page-client.tsx` - Page wrapper
- `containers-skeleton.tsx` - Loading states

### Database (`../db/`)

**Schemas**:
- `schemas/containers.ts` - Container metadata
- `schemas/alb-priorities.ts` - ALB priority tracking

**Migrations**: Located in `../db/migrations/`
- ALB priorities table
- Container schema updates
- Resource allocation defaults (1792/1792)

---

## 💻 CLI Integration

### User Workflow

1. **Get API key** from https://elizacloud.ai/dashboard/api-keys
2. **Set environment**:
   ```bash
   export ELIZAOS_API_KEY="eliza_your_key"
   ```
3. **Deploy project**:
   ```bash
   cd your-elizaos-project
   elizaos deploy
   ```

### CLI Command (`elizaos deploy`)

**Default resources** (maximizes t3g.small):
```bash
elizaos deploy
# CPU: 1792 units (1.75 vCPU, 87.5% utilization)
# Memory: 1792 MB (1.75 GB, 87.5% utilization)
# Port: 3000
```

**Custom resources**:
```bash
elizaos deploy \
  --cpu 1024 \
  --memory 1024 \
  --port 8080 \
  --env "DATABASE_URL=..." \
  --env "OPENAI_API_KEY=..."
```

**Resource limits**:
- CPU: 256-2048 units (0.25-2 vCPU)
- Memory: 512-2048 MB (0.5-2 GB)
- Port: 1-65535
- Desired count: 1-10

**Note**: Since t3g.small costs the same regardless of utilization, we default to **maximum allocation** (1792/1792) to give users the best performance!

### Deployment Flow

```
1. CLI validates project & Docker
2. CLI requests ECR credentials from API
3. CLI builds Docker image locally
4. CLI pushes image to AWS ECR
5. CLI creates container via API with ECR image URI
6. API checks quota & deducts credits
7. API allocates unique ALB priority (sequential)
8. API creates CloudFormation stack:
   ├─ EC2 instance (t3g.small ARM)
   ├─ ECS cluster + service
   ├─ Target group
   ├─ ALB listener rule
   ├─ Security groups
   ├─ CloudWatch logs + alarms
   └─ Container Insights
9. EC2 launches with ECS agent
10. ECS pulls image from ECR
11. Container starts and registers with ALB
12. Health checks pass (/health endpoint)
13. URL becomes accessible: https://{userId}.elizacloud.ai

Duration: 10-15 minutes
```

---

## 📊 Resource Allocation

### t3g.small Instance Specs
- **CPU**: 2 vCPU (ARM64) = 2048 ECS CPU units
- **RAM**: 2 GB = 2048 MB
- **Cost**: $0.0168/hour = **$12.41/month** (fixed)

### Container Allocation (Optimized ✅)

| Component | Units | Percentage | Notes |
|-----------|-------|------------|-------|
| **Container Task** | 1792 CPU | 87.5% | Maximum for user workload |
| **Container Task** | 1792 MB | 87.5% | Maximum for user workload |
| **ECS Agent + OS** | 256 CPU | 12.5% | Required overhead |
| **ECS Agent + OS** | 256 MB | 12.5% | Required overhead |
| **Total** | 2048 CPU | 100% | Fully utilized ✅ |
| **Total** | 2048 MB | 100% | Fully utilized ✅ |

**Why 87.5%?**
- You pay for the **full instance** regardless of container allocation
- ECS agent needs ~256 CPU and 256 MB minimum
- Allocating maximum to container maximizes value for users
- No performance penalty since instance is dedicated

**Previous allocation** (before optimization):
- 256 CPU (12.5%) + 512 MB (25%) = **87.5% wasted!** ❌

---

## 🔐 Security

### Network Security ✅
- VPC isolation (10.0.0.0/16)
- Security groups restrict traffic to ALB only
- No direct internet access to containers
- HTTPS enforced with ACM certificate
- HTTP automatically redirects to HTTPS

### Data Security ✅
- EBS encryption at rest (AES-256)
- Encrypted CloudWatch logs
- IMDSv2 required (token-based metadata access)
- No sensitive data in resource tags

### Access Control ✅
- IAM roles with least privilege
- Instance profiles for EC2
- Task execution roles for ECS
- Task roles for application permissions
- No hardcoded credentials

### Deployment Safety ✅
- Deployment circuit breaker (auto-rollback on failures)
- Health check grace period (5 minutes)
- Rolling deployment strategy
- MaximumPercent: 100%, MinimumHealthyPercent: 0 (single instance)

---

## 📈 Monitoring & Observability

### Real-Time Metrics (CloudWatch)

**Available in UI** (`/dashboard/containers/[id]`):
- CPU utilization (%)
- Memory utilization (%)
- Network RX bytes
- Network TX bytes
- Task health status
- Auto-refresh every 10 seconds

**Available in API** (`/api/v1/containers/[id]/metrics`):
```bash
curl https://elizacloud.ai/api/v1/containers/<id>/metrics \
  -H "Authorization: Bearer $ELIZAOS_API_KEY"

# Response:
{
  "success": true,
  "data": {
    "metrics": {
      "cpu_utilization": 45.2,
      "memory_utilization": 62.8,
      "network_rx_bytes": 1024000,
      "network_tx_bytes": 2048000,
      "task_count": 1,
      "healthy_task_count": 1,
      "timestamp": "2025-01-17T..."
    }
  }
}
```

### CloudWatch Logs

**Dynamic log stream discovery** (fixed):
- Automatically finds latest log streams
- Aggregates logs from all task instances
- Handles task restarts gracefully
- Sorts by timestamp

**Access**:
- UI: `/dashboard/containers/[id]` (logs section)
- API: `/api/v1/containers/[id]/logs?limit=100&since=2025-01-17T00:00:00Z`
- AWS: `aws logs tail /ecs/elizaos-user-<userId> --follow`

### CloudWatch Alarms

**Automatic alerts** (if SNS topic configured):

1. **EC2 System Check Failure**
   - Metric: `StatusCheckFailed_System`
   - Action: Automatic EC2 recovery
   - No notification needed (auto-recovery)

2. **Unhealthy Targets**
   - Metric: `UnHealthyHostCount`
   - Threshold: >= 1 for 2 minutes
   - Action: SNS notification

3. **High CPU**
   - Metric: `CPUUtilization`
   - Threshold: > 80% for 10 minutes
   - Action: SNS notification

4. **High Memory**
   - Metric: `MemoryUtilization`
   - Threshold: > 80% for 10 minutes
   - Action: SNS notification

**To enable SNS alerts**:
```bash
# Create SNS topic
aws sns create-topic --name elizaos-alerts --region us-east-1

# Subscribe email
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT:elizaos-alerts \
  --protocol email \
  --notification-endpoint ops@your-company.com

# Add to CloudFormation service (pass as parameter)
export SNS_TOPIC_ARN="arn:aws:sns:us-east-1:ACCOUNT:elizaos-alerts"
```

---

## 🔄 ALB Priority Management

### How It Works

**Sequential allocation** (simple and reliable):

```sql
-- Allocate next priority
SELECT COALESCE(MAX(priority), 0) + 1 
FROM alb_priorities 
WHERE expires_at IS NULL;

-- Result: Simple, no collisions, predictable
```

**Lifecycle**:
1. User deploys container → Allocate next available priority (1, 2, 3, ...)
2. User deletes container → Set `expires_at = NOW() + 1 hour`
3. Cron job (hourly) → Delete expired priorities
4. Priority becomes available for reuse

**Benefits vs old hash-based approach**:
- ✅ No collision retry logic
- ✅ Predictable allocation
- ✅ Simpler code (200 lines vs 300+)
- ✅ Better performance
- ✅ Easy to monitor

### Monitoring

**Check active priorities**:
```sql
SELECT 
  COUNT(*) as active_count,
  MAX(priority) as highest_priority,
  50000 - COUNT(*) as available_slots
FROM alb_priorities 
WHERE expires_at IS NULL;
```

**Check stats via API**:
```bash
# Manual cleanup trigger
curl https://elizacloud.ai/api/cron/cleanup-priorities \
  -H "Authorization: Bearer $CRON_SECRET"

# Returns:
{
  "success": true,
  "data": {
    "deleted_count": 5,
    "stats_before": {
      "totalActive": 42,
      "totalExpired": 5,
      "highestPriority": 42,
      "availableSlots": 49958
    },
    "stats_after": {
      "totalActive": 42,
      "totalExpired": 0,
      "highestPriority": 42,
      "availableSlots": 49958
    }
  }
}
```

---

## 🗑️ Teardown

### Via Dashboard

1. Go to https://elizacloud.ai/dashboard/containers
2. Click trash icon next to container
3. Confirm deletion

### Via API

```bash
curl -X DELETE https://elizacloud.ai/api/v1/containers/<id> \
  -H "Authorization: Bearer $ELIZAOS_API_KEY"

# Returns:
{
  "success": true,
  "message": "Container deleted successfully",
  "refundAmount": 250  # If deleted within 1 hour
}
```

### What Happens

1. Status updated to "deleting"
2. CloudFormation stack deletion initiated
3. Resources deleted in order:
   - ECS Service stopped
   - Target group de-registered
   - ALB listener rule removed
   - EC2 instance terminated
   - ECS cluster deleted
   - Security groups deleted
   - Log group retained (7 days)
4. ALB priority released (expires in 1 hour)
5. Prorated credit refund (if <1 hour runtime)
6. Database record deleted

**Duration**: 5-10 minutes

### Manual Stack Deletion

```bash
cd infrastructure/cloudformation

# Delete single user
bash teardown-user-stack.sh <userId>

# Delete all users (⚠️ DANGEROUS)
bash teardown-all-user-stacks.sh
# Requires typing "DELETE ALL" to confirm
```

---

## 💰 Cost Analysis

### Shared Infrastructure (Fixed Cost)

| Component | Monthly Cost |
|-----------|--------------|
| Application Load Balancer | $16.20 |
| Data Transfer (out) | $5-20 |
| **Total** | **$21-36** |

**Shared across all users** - Cost per user decreases as you scale.

### Per-User Container (Variable Cost)

| Component | Monthly Cost | Notes |
|-----------|--------------|-------|
| EC2 t3g.small (24/7) | $12.41 | ARM64, on-demand |
| EBS 20GB gp3 | $1.60 | 3000 IOPS, 125 MB/s |
| CloudWatch Logs (5GB) | $0.50 | 7 day retention |
| Container Insights | $0.20 | Enhanced metrics |
| **Total** | **$14.71** | Fixed per container |

### Scaling Economics

| Users | Infrastructure | Per-User | Total/Month | Cost/User |
|-------|---------------|----------|-------------|-----------|
| 1 | $36 | $14.71 | **$50.71** | $50.71 |
| 10 | $36 | $14.71 | **$183.10** | $18.31 |
| 50 | $36 | $14.71 | **$771.50** | $15.43 |
| 100 | $36 | $14.71 | **$1,507** | $15.07 |
| 500 | $36 | $14.71 | **$7,391** | $14.78 |
| 1000 | $36 | $14.71 | **$14,746** | $14.75 |

**Key insight**: Cost approaches $14.71/user at scale (shared ALB cost becomes negligible).

### Revenue Model (Recommended)

**Credit pricing** (40% margin):
- Charge: **350 credits/month** per container
- Customer pays: ~$17.50/month equivalent (at $0.05/credit)
- Your cost: $14.71/month
- **Margin**: ~16% ($2.79/container/month)

**Or hourly pricing**:
- Charge: **15 credits/hour** per container
- Monthly (720 hours): 10,800 credits = ~$540 at $0.05/credit
- Better for variable usage patterns

---

## 🧪 Testing

### Infrastructure Test Script

```bash
cd ..  # eliza-cloud-v2 root
bash scripts/test-infrastructure.sh
```

**Tests**:
- ✅ AWS CLI installed and configured
- ✅ Docker available
- ✅ Environment variables set
- ✅ CloudFormation templates valid
- ✅ Database connected
- ✅ Shared infrastructure deployed
- ✅ ECR accessible
- ✅ No TypeScript errors

### Manual Testing

```bash
# Test shared infrastructure deployment
cd cloudformation
bash deploy-shared.sh

# Test single container deployment
cd ../..
elizaos deploy --name test-1

# Test metrics API
curl https://elizacloud.ai/api/v1/containers/<id>/metrics \
  -H "Authorization: Bearer $ELIZAOS_API_KEY"

# Test logs API
curl https://elizacloud.ai/api/v1/containers/<id>/logs \
  -H "Authorization: Bearer $ELIZAOS_API_KEY"

# Test teardown
curl -X DELETE https://elizacloud.ai/api/v1/containers/<id> \
  -H "Authorization: Bearer $ELIZAOS_API_KEY"

# Verify priority cleanup
curl https://elizacloud.ai/api/cron/cleanup-priorities \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## 🐛 Troubleshooting

### Container Not Deploying

**Check CloudFormation events**:
```bash
aws cloudformation describe-stack-events \
  --stack-name elizaos-user-<userId> \
  --region us-east-1 \
  --max-items 20
```

**Common issues**:
- ECR image not found → Verify image was pushed
- ALB priority conflict → Run cleanup cron
- Insufficient capacity → Check AWS limits
- IAM permissions → Verify roles exist

### Container Not Healthy

**Check target health**:
```bash
aws elbv2 describe-target-health \
  --target-group-arn <arn>
```

**Common issues**:
- Container not listening on correct port
- Health check path wrong (should be `/health`)
- Container startup taking too long (>5 minutes)
- Application crashed (check logs)

### Logs Not Showing

**Verify log group exists**:
```bash
aws logs describe-log-groups \
  --log-group-name-prefix /ecs/elizaos-user- \
  --region us-east-1
```

**Check log streams**:
```bash
aws logs describe-log-streams \
  --log-group-name /ecs/elizaos-user-<userId> \
  --order-by LastEventTime \
  --descending \
  --max-items 5
```

**Note**: Logs appear after container starts (wait 2-3 minutes after deployment).

### High CPU/Memory

**Check metrics**:
```bash
# Via API
curl https://elizacloud.ai/api/v1/containers/<id>/metrics \
  -H "Authorization: Bearer $ELIZAOS_API_KEY"

# Via AWS CloudWatch
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=elizaos-user-<userId> Name=ClusterName,Value=elizaos-user-<userId> \
  --start-time 2025-01-17T00:00:00Z \
  --end-time 2025-01-17T23:59:59Z \
  --period 300 \
  --statistics Average
```

**Solutions**:
- High CPU persistent → Application optimization needed
- High memory → Check for memory leaks
- Spiky usage → Normal for AI workloads
- Sustained >80% → Consider larger instance type (not currently supported)

### ALB Priority Exhausted

**Check usage**:
```sql
SELECT 
  COUNT(*) as active,
  MAX(priority) as highest,
  50000 - COUNT(*) as available
FROM alb_priorities 
WHERE expires_at IS NULL;
```

**If near limit (>45,000)**:
- Run cleanup to free expired priorities
- Consider second ALB with separate domain
- Contact AWS for increased listener rule limits

---

## 🔧 Maintenance

### Daily

- [ ] Monitor CloudWatch dashboard
- [ ] Check container status in UI
- [ ] Review failed deployments (if any)

### Weekly

- [ ] Review cost reports (AWS Cost Explorer)
- [ ] Check ALB priority utilization
- [ ] Review CloudWatch logs for errors
- [ ] Verify cron jobs running (check last execution)

### Monthly

- [ ] Optimize resource allocation
- [ ] Review security groups
- [ ] Check for stuck CloudFormation stacks
- [ ] Update CloudFormation templates if needed
- [ ] Review and update documentation

### Automated (Cron)

**Hourly** - ALB Priority Cleanup:
- Endpoint: `/api/cron/cleanup-priorities`
- Schedule: `0 * * * *` (every hour)
- Action: Delete priorities where `expires_at < NOW()`
- Configured in: `vercel.json`

---

## 📋 Production Checklist

Before going live:

### Infrastructure
- [ ] Deploy shared infrastructure successfully
- [ ] Apply all database migrations (0005, 0006, 0007)
- [ ] Configure DNS (*.elizacloud.ai → ALB)
- [ ] Verify DNS propagation
- [ ] Set up SNS topic for alerts (optional but recommended)

### Testing
- [ ] Deploy 1 test container successfully
- [ ] Verify container accessible via ALB URL
- [ ] Check metrics showing in UI
- [ ] Check logs showing in UI
- [ ] Delete test container successfully
- [ ] Verify ALB priority released
- [ ] Test cron job manually

### Monitoring
- [ ] CloudWatch dashboard created
- [ ] Cost allocation tags enabled
- [ ] Billing alerts configured
- [ ] On-call rotation established (if applicable)

### Documentation
- [ ] Runbooks documented
- [ ] Team trained on procedures
- [ ] Escalation process defined

### Security
- [ ] IAM policies reviewed
- [ ] Security groups validated
- [ ] Secrets management in place
- [ ] Compliance requirements met (if applicable)

---

## 📚 Additional Resources

### AWS Documentation
- [ECS on EC2](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ECS_instances.html)
- [CloudFormation Best Practices](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/best-practices.html)
- [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/)
- [CloudWatch Container Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights.html)

### Internal Documentation
- Code comments contain implementation details
- `../README.md` - User-facing documentation
- `../docs/` - API reference and setup guides

### Support
- **Infrastructure issues**: Check CloudFormation events and CloudWatch logs
- **Application issues**: Check container logs via UI or AWS
- **Cost issues**: Review AWS Cost Explorer with UserId tag filter
- **Security issues**: Review security groups and VPC flow logs (if enabled)

---

## 🚀 Version History

### v2.0 (January 2025) - Production Ready ✅
- **Resource optimization**: 1792 CPU / 1792 MB (87.5% utilization)
- **Simplified ALB priority manager**: Sequential allocation
- **Enhanced monitoring**: CloudWatch alarms + Container Insights
- **Fixed CloudWatch logs**: Dynamic stream discovery
- **Metrics API & UI**: Real-time CPU/memory/network monitoring
- **Automated cleanup**: Hourly cron for ALB priorities
- **Deployment circuit breaker**: Auto-rollback on failures
- **Comprehensive tagging**: Full cost allocation support

### v1.0 - Initial Implementation
- EC2 + ECS deployment
- CloudFormation IaC
- Basic monitoring and logging

---

---

**Built with ❤️ for the ElizaOS ecosystem**

**Status**: ✅ Production Ready | **Architecture**: Simple, Clean, Scalable

---

## 📞 Support

For infrastructure issues:
1. Check CloudFormation events: `aws cloudformation describe-stack-events --stack-name elizaos-user-<userId>`
2. Review CloudWatch logs: `/api/v1/containers/[id]/logs`
3. Check container metrics: `/api/v1/containers/[id]/metrics`
4. Verify shared infrastructure: `aws cloudformation describe-stacks --stack-name production-elizaos-shared`
