#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

export $(cat ./packages/web/.env | xargs)

aws dynamodb create-table \
 --table-name TasanApp \
 --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
 --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
 --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
 --endpoint http://localhost:8000
