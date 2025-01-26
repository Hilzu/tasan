#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

export AWS_PROFILE=SCOy-TasanApp
bucket_name=tasanstack-appassetsbucket64b3098e-jilfxtz5osd3
client_path=./packages/web/build/client

# Check if credentials are valid and log in if not
if ! aws sts get-caller-identity &>/dev/null; then
  aws sso login
fi

git_hash=$(git rev-parse --short HEAD)
git_dirty=$(git diff --quiet || echo '*')
export VITE_APP_VERSION=$git_hash$git_dirty
pnpm --filter=@tasan/web build

aws s3 sync $client_path/assets s3://$bucket_name/assets \
  --delete --cache-control "public, max-age=31536000, immutable"
aws s3 sync $client_path s3://$bucket_name --exclude "*assets/*" \
  --delete --cache-control "public, max-age=1209600"
