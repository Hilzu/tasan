#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

export AWS_PROFILE=SCOy-TasanApp
export bucket_name=tasanstack-appassetsbucket64b3098e-jilfxtz5osd3
export client_path=./packages/web/build/client

# Check if credentials are valid and log in if not
if ! aws sts get-caller-identity &>/dev/null; then
  aws sso login
fi

pnpm --filter=@tasan/web build

aws s3 sync $client_path/assets s3://$bucket_name/assets \
  --delete --cache-control "public, max-age=31536000, immutable"
aws s3 sync $client_path s3://$bucket_name --exclude "*assets/*" \
  --delete --cache-control "public, max-age=1209600"
