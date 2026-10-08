#!/usr/bin/env bash
# Deploy/update the AWS stack (Lambda API + Amplify app). Run from repo root:
#   infra/deploy.sh <google-sheet-id>
# Needs: AWS profile "uccsite", gh CLI logged in (token for Amplify's GitHub link).
set -euo pipefail
PROFILE=uccsite REGION=us-west-2 STACK=ucc-lookup
BUCKET=cdk-hnb659fds-assets-017110365763-us-west-2
SHEET_ID="${1:?usage: infra/deploy.sh <google-sheet-id>}"
cd "$(dirname "$0")/.."

# Lambda bundle: adapter + handlers + lib (zero npm deps; AWS SDK is in the runtime)
rm -rf lambda-bundle && mkdir lambda-bundle
cp -r lambda.js api lib package.json lambda-bundle/

aws cloudformation package --profile $PROFILE --region $REGION \
  --template-file infra/template.yaml --s3-bucket $BUCKET --s3-prefix ucc-lookup \
  --output-template-file infra/packaged.yaml >/dev/null
aws cloudformation deploy --profile $PROFILE --region $REGION --stack-name $STACK \
  --template-file infra/packaged.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides SheetId="$SHEET_ID" GitHubToken="$(gh auth token)"
rm -rf lambda-bundle infra/packaged.yaml

aws cloudformation describe-stacks --profile $PROFILE --region $REGION --stack-name $STACK \
  --query 'Stacks[0].Outputs' --output table
