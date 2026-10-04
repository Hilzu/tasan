#!/usr/bin/env bash

set -euo pipefail

# Use the deployed resources directly so the first workflow run does not need
# CloudFormation outputs to have been added by an earlier deployment.
bucket_name=$(aws cloudformation list-stack-resources \
  --stack-name TasanStack --region eu-central-1 \
  --query 'StackResourceSummaries[?ResourceType == `AWS::S3::Bucket` && starts_with(LogicalResourceId, `AppAssetsBucket`) && ResourceStatus != `DELETE_COMPLETE`].PhysicalResourceId' \
  --output text)
distribution_id=$(aws cloudformation list-stack-resources \
  --stack-name TasanStack --region eu-central-1 \
  --query 'StackResourceSummaries[?ResourceType == `AWS::CloudFront::Distribution` && starts_with(LogicalResourceId, `AppDistribution`) && ResourceStatus != `DELETE_COMPLETE`].PhysicalResourceId' \
  --output text)

# AWS CLI text output separates multiple matches with whitespace. These checks
# require one valid ID per resource and prevent extra GitHub environment lines.
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
