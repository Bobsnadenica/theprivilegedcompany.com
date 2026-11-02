#!/usr/bin/env bash
set -euo pipefail

home_region="${AWS_REGION:-eu-west-1}"
regions=$(aws ec2 describe-regions --region "$home_region" --all-regions \
  --query "Regions[?OptInStatus=='opt-in-not-required'||OptInStatus=='opted-in'].RegionName" \
  --output text)
for region in $regions; do
  if aws resource-explorer-2 get-index --region "$region" >/dev/null 2>&1; then
    continue
  fi
  echo "Creating Resource Explorer local index in $region"
  if ! aws resource-explorer-2 create-index --region "$region" >/dev/null; then
    # A concurrent/setup-time index creation can race the check above.
    aws resource-explorer-2 get-index --region "$region" >/dev/null
  fi
done
