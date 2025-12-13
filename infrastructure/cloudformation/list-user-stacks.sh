#!/bin/bash
# List all per-user CloudFormation stacks

set -e

REGION="${AWS_REGION:-us-east-1}"

echo "📋 ElizaOS User Stacks"
echo "======================"
echo "Region: $REGION"
echo ""

aws cloudformation list-stacks \
  --region "$REGION" \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query 'StackSummaries[?starts_with(StackName, `elizaos-user-`)].{Name:StackName,Status:StackStatus,Created:CreationTime}' \
  --output table

echo ""
echo "Total user stacks:"
aws cloudformation list-stacks \
  --region "$REGION" \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query 'length(StackSummaries[?starts_with(StackName, `elizaos-user-`)])' \
  --output text

echo ""
echo "💰 Estimated cost: ~$13/month × number of stacks"
echo ""

