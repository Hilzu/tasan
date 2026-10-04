#!/usr/bin/env bash

set -euo pipefail

bucket_name=$(aws cloudformation list-stack-resources \
  --stack-name TasanStack --region eu-central-1 \
  --query 'StackResourceSummaries[?ResourceType == `AWS::S3::Bucket` && starts_with(LogicalResourceId, `AppAssetsBucket`) && ResourceStatus != `DELETE_COMPLETE`].PhysicalResourceId' \
  --output text)
distribution_id=$(aws cloudformation list-stack-resources \
  --stack-name TasanStack --region eu-central-1 \
  --query 'StackResourceSummaries[?ResourceType == `AWS::CloudFront::Distribution` && starts_with(LogicalResourceId, `AppDistribution`) && ResourceStatus != `DELETE_COMPLETE`].PhysicalResourceId' \
  --output text)

# Multiple matches contain whitespace and fail these ID checks.
if [[ ! "$bucket_name" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
  echo "Expected exactly one application assets bucket in TasanStack" >&2
  exit 1
fi
if [[ ! "$distribution_id" =~ ^[A-Z0-9]+$ ]]; then
  echo "Expected exactly one application CloudFront distribution in TasanStack" >&2
  exit 1
fi

printf 'ASSETS_BUCKET_NAME=%s\nCLOUDFRONT_DISTRIBUTION_ID=%s\n' \
  "$bucket_name" "$distribution_id"
