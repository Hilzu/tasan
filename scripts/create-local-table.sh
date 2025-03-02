#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

export $(cat ./packages/web/.env | xargs)

aws dynamodb create-table --no-cli-pager \
 --table-name TasanApp \
 --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
 --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
 --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
 --global-secondary-indexes 'IndexName=GSI-SK-PK,KeySchema=[{AttributeName=sk,KeyType=HASH},{AttributeName=pk,KeyType=RANGE}],Projection={ProjectionType=KEYS_ONLY},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}' \
 --endpoint http://localhost:8000

aws dynamodb update-time-to-live --no-cli-pager \
 --table-name TasanApp \
 --time-to-live-specification "Enabled=true,AttributeName=expiresAt"
