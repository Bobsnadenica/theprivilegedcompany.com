provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  user_discoveries_table_name = "${local.name_prefix}-user-discoveries"
  shared_cells_table_name     = "${local.name_prefix}-shared-cells"
  player_presence_table_name  = "${local.name_prefix}-player-presence"
  landmarks_table_name        = "${local.name_prefix}-landmarks"

  pending_bucket_name         = "${local.name_prefix}-${data.aws_caller_identity.current.account_id}-${var.aws_region}-pending"
  approved_bucket_name        = "${local.name_prefix}-${data.aws_caller_identity.current.account_id}-${var.aws_region}-approved"
  discovery_cache_bucket_name = "${local.name_prefix}-${data.aws_caller_identity.current.account_id}-${var.aws_region}-discovery-cache"
  shared_tile_cache_prefix    = "shared-tiles/v1"

  allowed_upload_content_types_csv = join(",", var.allowed_upload_content_types)
}
