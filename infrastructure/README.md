# ElizaOS Cloud Infrastructure

Production-ready container deployment infrastructure using AWS CloudFormation, EC2, and ECS.

## Architecture

### Core Principle

**1 User = 1 EC2 Instance + 1 ECS Container**

- No Fargate (EC2 launch type only)
- No auto-scaling
- Simple, cost-effective deployment
- Shared ALB for all users

### Components

```
┌─────────────────────────────────────────────────────────┐
│                     Shared (Deploy Once)                 │
├─────────────────────────────────────────────────────────┤
│  • VPC (10.0.0.0/16)                                    │
│  • Application Load Balancer                            │
│  • HTTPS Listener (ACM Certificate)                     │
│  • IAM Roles (ECS Instance, Task Execution, Task)      │
│  • Security Groups                                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Per-User Stack (Deploy Per User)            │
├─────────────────────────────────────────────────────────┤
│  • 1x t3g.small EC2 instance (ARM)                      │
│  • ECS Cluster (EC2 launch type)                        │
│  • ECS Task Definition (256 CPU, 512 MB RAM)            │
│  • ECS Service (desired count: 1)                       │
│  • ALB Target Group + Listener Rule                     │
│  • Security Group (ALB access only)                     │
│  • CloudWatch Logs (7 day retention)                    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
                https://{userId}.elizacloud.ai
```

## Quick Start

### Prerequisites

1. **AWS Account** with administrator access
2. **ACM Certificate** for `*.elizacloud.ai`
3. **Environment Variables**:
   ```bash
   export AWS_REGION=us-east-1
   export AWS_ACCESS_KEY_ID=your_access_key
   export AWS_SECRET_ACCESS_KEY=your_secret_key
   export ACM_CERTIFICATE_ARN=arn:aws:acm:...
   export ENVIRONMENT=production
   ```

### Deploy Shared Infrastructure (One Time)

```bash
cd infrastructure/cloudformation
./deploy-shared.sh
```

This creates:

- VPC and subnets
- Application Load Balancer
- HTTPS listener with your certificate
- IAM roles for ECS
- Security groups

**Cost:** ~$21-36/month (fixed, shared across all users)

### Deploy User Container (Per User)

```bash
# From CLI
elizaos deploy

# Or via API
curl -X POST https://elizacloud.ai/api/v1/containers \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-agent",
    "ecr_image_uri": "123456789.dkr.ecr.us-east-1.amazonaws.com/elizaos/org/project:v1.0.0",
    "port": 3000,
    "cpu": 256,
    "memory": 512
  }'
```

**Cost:** ~$14/month per user

## Database Setup

### Migration

```bash
# Apply ALB priorities migration
psql $DATABASE_URL < db/migrations/0005_alb_priorities.sql

# Verify
psql $DATABASE_URL -c "SELECT * FROM alb_priorities LIMIT 5;"
```

### Schema

```sql
CREATE TABLE alb_priorities (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  priority INTEGER NOT NULL UNIQUE CHECK (priority BETWEEN 1 AND 50000),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP  -- Set when stack is deleted
);
```

## Teardown

### Single User

```bash
./infrastructure/cloudformation/teardown-user-stack.sh <userId>
```

### All Users (Dangerous!)

```bash
./infrastructure/cloudformation/teardown-all-user-stacks.sh --force
```

**Warning:** Requires typing "DELETE ALL" to confirm.

## Maintenance

### Automated Cleanup (Recommended)

Set up daily cron job:

```bash
crontab -e

# Daily at 2 AM
0 2 * * * cd /app && bun run scripts/cleanup-orphaned-stacks.ts >> /var/log/eliza-cleanup.log 2>&1
```

This will:

- Delete orphaned CloudFormation stacks
- Clean up expired ALB priorities
- Maintain database hygiene

### Manual Cleanup

```bash
# Dry run (no changes)
bun run scripts/cleanup-orphaned-stacks.ts --dry-run

# Actual cleanup
bun run scripts/cleanup-orphaned-stacks.ts
```

## Monitoring

### CloudFormation Stacks

```bash
# List all user stacks
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE \
  --query 'StackSummaries[?starts_with(StackName, `elizaos-user-`)].StackName'

# Get stack details
aws cloudformation describe-stacks --stack-name elizaos-user-<userId>

# Watch stack creation
aws cloudformation wait stack-create-complete --stack-name elizaos-user-<userId>
```

### ALB Priorities

```sql
-- Count active priorities
SELECT COUNT(*) FROM alb_priorities WHERE expires_at IS NULL;

-- Find expired priorities
SELECT * FROM alb_priorities WHERE expires_at < NOW();

-- Priority distribution
SELECT
  FLOOR(priority / 10000) * 10000 AS range,
  COUNT(*)
FROM alb_priorities
WHERE expires_at IS NULL
GROUP BY range;
```

### Container Health

```bash
# ECS service status
aws ecs describe-services \
  --cluster elizaos-user-<userId> \
  --services elizaos-user-<userId>

# Task status
aws ecs list-tasks --cluster elizaos-user-<userId>

# CloudWatch logs
aws logs tail /ecs/elizaos-user-<userId> --follow
```

## Troubleshooting

### Stack Creation Fails

1. **Check CloudFormation events:**

   ```bash
   aws cloudformation describe-stack-events \
     --stack-name elizaos-user-<userId> \
     --max-items 20
   ```

2. **Common issues:**
   - ALB priority conflict (run cleanup script)
   - Insufficient IAM permissions
   - ECR image not found
   - Subnet capacity exhausted

### Priority Allocation Fails

```bash
# Check priority usage
psql $DATABASE_URL -c "SELECT COUNT(*) FROM alb_priorities WHERE expires_at IS NULL;"

# Manually release stuck priority
psql $DATABASE_URL -c "UPDATE alb_priorities SET expires_at = NOW() WHERE user_id = '<userId>';"

# Run cleanup
bun run scripts/cleanup-orphaned-stacks.ts
```

### Container Not Accessible

1. **Check ALB target health:**

   ```bash
   aws elbv2 describe-target-health \
     --target-group-arn <target-group-arn>
   ```

2. **Check security group rules:**

   ```bash
   aws ec2 describe-security-groups \
     --filters "Name=tag:UserId,Values=<userId>"
   ```

3. **Check container logs:**
   ```bash
   aws logs tail /ecs/elizaos-user-<userId> --follow
   ```

## Cost Breakdown

### Shared Infrastructure

- Application Load Balancer: $16.20/month
- Data transfer: $5-20/month
- **Total: $21-36/month** (fixed)

### Per User

- EC2 t3g.small (ARM): $12.41/month
- EBS 20GB gp3: $1.60/month
- CloudWatch Logs (7 days): $0.50/month
- **Total: $14.51/month per user**

### Break-Even

- 1 user: $35.71/month
- 10 users: $166.30/month ($16.63/user)
- 100 users: $1,472/month ($14.72/user)

## Security

### Network

- ✅ VPC isolation (10.0.0.0/16)
- ✅ Security groups restrict traffic to ALB only
- ✅ HTTPS with ACM certificate
- ✅ HTTP→HTTPS redirect

### Storage

- ✅ EBS encryption at rest
- ✅ Encrypted CloudWatch logs
- ✅ No sensitive data in tags

### Access

- ✅ IAM roles (least privilege)
- ✅ Instance profiles for EC2
- ✅ Task execution roles for ECS
- ✅ No hardcoded credentials

## Files

### CloudFormation Templates

- `shared-infrastructure.json` - VPC, ALB, IAM (deploy once)
- `per-user-stack.json` - EC2 + ECS per user

### Scripts

- `deploy-shared.sh` - Deploy shared infrastructure
- `teardown-user-stack.sh` - Delete single user
- `teardown-all-user-stacks.sh` - Delete all users (dangerous)
- `../scripts/cleanup-orphaned-stacks.ts` - Automated cleanup

### Database

- `../db/schemas/alb-priorities.ts` - Priority schema
- `../db/migrations/0005_alb_priorities.sql` - Migration

### Services

- `../lib/services/cloudformation.ts` - Stack management
- `../lib/services/alb-priority-manager.ts` - Priority allocation

## Production Checklist

Before going live:

- [ ] Deploy shared infrastructure
- [ ] Apply database migration
- [ ] Test single user deployment
- [ ] Test teardown flow
- [ ] Set up cleanup cron job
- [ ] Configure monitoring/alerting
- [ ] Test failover scenarios
- [ ] Load test (10+ concurrent deploys)
- [ ] Verify DNS propagation
- [ ] Document runbooks

## Support

See `INFRASTRUCTURE_REVIEW.md` for:

- Detailed architecture analysis
- Cost optimization strategies
- Incident response runbooks
- Testing procedures
- Sprint planning

See `FIXES_IMPLEMENTED.md` for:

- Recent production-readiness fixes
- Database schema changes
- Security improvements
- Deployment checklist
