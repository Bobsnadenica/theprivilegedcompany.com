# Cognito
resource "aws_cognito_user_pool" "main" {
  name                     = "${local.name_prefix}-user-pool"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 6
    require_lowercase                = false
    require_numbers                  = false
    require_symbols                  = false
    require_uppercase                = false
    temporary_password_validity_days = 7
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
  }

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  user_pool_add_ons {
    advanced_security_mode = "AUDIT"
  }

  schema {
    attribute_data_type = "String"
    name                = "display_name"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 1
      max_length = 80
    }
  }

  schema {
    attribute_data_type = "String"
    name                = "display_name_locked"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 0
      max_length = 5
    }
  }

  schema {
    attribute_data_type = "String"
    name                = "profile_icon"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 1
      max_length = 8
    }
  }

  schema {
    attribute_data_type = "String"
    name                = "profile_icon_locked"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 0
      max_length = 5
    }
  }

  tags = local.tags
}

resource "aws_cognito_user_pool_client" "mobile" {
  name         = "${local.name_prefix}-mobile-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  explicit_auth_flows                  = ["ALLOW_USER_SRP_AUTH", "ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = var.cognito_callback_urls
  logout_urls                          = var.cognito_logout_urls
  allowed_oauth_flows_user_pool_client = length(var.cognito_callback_urls) > 0
  allowed_oauth_flows                  = length(var.cognito_callback_urls) > 0 ? ["code"] : []
  allowed_oauth_scopes                 = length(var.cognito_callback_urls) > 0 ? ["email", "openid", "profile"] : []

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_group" "admin" {
  user_pool_id = aws_cognito_user_pool.main.id
  name         = var.cognito_admin_group_name
  precedence   = 1
  description  = "Can review pending landmarks and approve/reject them."
}

resource "aws_cognito_user_group" "moderator" {
  user_pool_id = aws_cognito_user_pool.main.id
  name         = var.cognito_moderator_group_name
  precedence   = 5
  description  = "Can review pending landmarks and approve/reject them."
}

resource "aws_cognito_user_group" "user" {
  user_pool_id = aws_cognito_user_pool.main.id
  name         = var.cognito_user_group_name
  precedence   = 10
  description  = "Regular players."
}

# DynamoDB
resource "aws_dynamodb_table" "user_discoveries" {
  name         = local.user_discoveries_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "shared_cells" {
  name         = local.shared_cells_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "player_presence" {
  name         = local.player_presence_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "landmarks" {
  name         = local.landmarks_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "gsi1pk"
    type = "S"
  }

  attribute {
    name = "gsi1sk"
    type = "S"
  }

  attribute {
    name = "gsi2pk"
    type = "S"
  }

  attribute {
    name = "gsi2sk"
    type = "S"
  }

  attribute {
    name = "gsi3pk"
    type = "S"
  }

  attribute {
    name = "gsi3sk"
    type = "S"
  }

  global_secondary_index {
    name            = "gsi1"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "gsi2"
    hash_key        = "gsi2pk"
    range_key       = "gsi2sk"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "gsi3"
    hash_key        = "gsi3pk"
    range_key       = "gsi3sk"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = local.tags
}

# Buckets and CloudFront
resource "aws_s3_bucket" "pending_landmarks" {
  bucket = local.pending_bucket_name
  tags   = local.tags
}

resource "aws_s3_bucket" "approved_landmarks" {
  bucket = local.approved_bucket_name
  tags   = local.tags
}

resource "aws_s3_bucket" "discovery_cache" {
  bucket = local.discovery_cache_bucket_name
  tags   = local.tags
}

resource "aws_s3_bucket_ownership_controls" "pending_landmarks" {
  bucket = aws_s3_bucket.pending_landmarks.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_ownership_controls" "approved_landmarks" {
  bucket = aws_s3_bucket.approved_landmarks.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_ownership_controls" "discovery_cache" {
  bucket = aws_s3_bucket.discovery_cache.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "pending_landmarks" {
  bucket = aws_s3_bucket.pending_landmarks.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_versioning" "approved_landmarks" {
  bucket = aws_s3_bucket.approved_landmarks.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_versioning" "discovery_cache" {
  bucket = aws_s3_bucket.discovery_cache.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "pending_landmarks" {
  bucket = aws_s3_bucket.pending_landmarks.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "approved_landmarks" {
  bucket = aws_s3_bucket.approved_landmarks.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "discovery_cache" {
  bucket = aws_s3_bucket.discovery_cache.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "pending_landmarks" {
  bucket                  = aws_s3_bucket.pending_landmarks.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "approved_landmarks" {
  bucket                  = aws_s3_bucket.approved_landmarks.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "discovery_cache" {
  bucket                  = aws_s3_bucket.discovery_cache.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "pending_landmarks" {
  bucket = aws_s3_bucket.pending_landmarks.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["POST", "PUT", "GET", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag", "Location"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "pending_landmarks" {
  bucket = aws_s3_bucket.pending_landmarks.id

  rule {
    id     = "cleanup-pending-landmarks"
    status = "Enabled"

    filter {}

    expiration {
      days = var.pending_landmark_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "approved_landmarks" {
  bucket = aws_s3_bucket.approved_landmarks.id

  rule {
    id     = "cleanup-approved-landmark-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.approved_landmark_noncurrent_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "discovery_cache" {
  bucket = aws_s3_bucket.discovery_cache.id

  rule {
    id     = "cleanup-discovery-cache"
    status = "Enabled"

    filter {}

    expiration {
      days = var.discovery_cache_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_cloudfront_origin_access_control" "approved_landmarks" {
  name                              = "${local.name_prefix}-approved-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "shared_tiles" {
  name                              = "${local.name_prefix}-shared-tiles-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "approved_landmarks" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  comment         = "World Of Fog approved landmark delivery"

  origin {
    domain_name              = aws_s3_bucket.approved_landmarks.bucket_regional_domain_name
    origin_id                = "approved-landmarks-s3-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.approved_landmarks.id
  }

  default_cache_behavior {
    target_origin_id       = "approved-landmarks-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  depends_on = [aws_s3_bucket_public_access_block.approved_landmarks]
}

resource "aws_cloudfront_distribution" "shared_tiles" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  comment         = "World Of Fog shared tile delivery"

  origin {
    domain_name              = aws_s3_bucket.discovery_cache.bucket_regional_domain_name
    origin_id                = "shared-tiles-s3-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.shared_tiles.id
  }

  default_cache_behavior {
    target_origin_id       = "shared-tiles-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  depends_on = [aws_s3_bucket_public_access_block.discovery_cache]
}

resource "aws_s3_bucket_policy" "pending_landmarks" {
  bucket = aws_s3_bucket.pending_landmarks.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.pending_landmarks.arn,
          "${aws_s3_bucket.pending_landmarks.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_policy" "approved_landmarks" {
  bucket = aws_s3_bucket.approved_landmarks.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.approved_landmarks.arn,
          "${aws_s3_bucket.approved_landmarks.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid    = "AllowCloudFrontRead"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.approved_landmarks.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.approved_landmarks.arn
          }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_policy" "discovery_cache" {
  bucket = aws_s3_bucket.discovery_cache.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.discovery_cache.arn,
          "${aws_s3_bucket.discovery_cache.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid    = "AllowCloudFrontReadSharedTiles"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action = ["s3:GetObject"]
        Resource = [
          "${aws_s3_bucket.discovery_cache.arn}/${local.shared_tile_cache_prefix}/*",
          "${aws_s3_bucket.discovery_cache.arn}/shared-regions/v1/*"
        ]
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.shared_tiles.arn
          }
        }
      }
    ]
  })
}

resource "aws_sqs_queue" "shared_tile_rebuild_dlq" {
  name                      = "${local.name_prefix}-shared-tile-rebuild-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true

  tags = local.tags
}

resource "aws_sqs_queue" "shared_tile_rebuild" {
  name                       = "${local.name_prefix}-shared-tile-rebuild"
  visibility_timeout_seconds = 90
  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 10
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.shared_tile_rebuild_dlq.arn
    maxReceiveCount     = 5
  })

  tags = local.tags
}

# IAM
resource "aws_iam_role" "lambda_exec" {
  name = "${local.name_prefix}-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "lambda_app" {
  name = "${local.name_prefix}-lambda-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem"
        ]
        Resource = [
          aws_dynamodb_table.user_discoveries.arn,
          aws_dynamodb_table.shared_cells.arn,
          aws_dynamodb_table.player_presence.arn,
          aws_dynamodb_table.landmarks.arn,
          "${aws_dynamodb_table.landmarks.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:SendMessageBatch"
        ]
        Resource = aws_sqs_queue.shared_tile_rebuild.arn
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:ChangeMessageVisibility",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.shared_tile_rebuild.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:PutObject"
        ]
        Resource = [
          "${aws_s3_bucket.pending_landmarks.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = [
          "${aws_s3_bucket.approved_landmarks.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = [
          "${aws_s3_bucket.discovery_cache.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.discovery_cache.arn
        Condition = {
          StringLike = {
            "s3:prefix" = [
              "${local.shared_tile_cache_prefix}/*",
              "user-bootstrap/v1/*"
            ]
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_app" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_app.arn
}

resource "aws_iam_role" "appsync_lambda" {
  name = "${local.name_prefix}-appsync-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "appsync.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.tags
}

# Lambda packaging
data "archive_file" "lambda_bundle" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  output_path = "${path.module}/lambda_bundle.zip"
}

locals {
  lambda_env = {
    USER_DISCOVERIES_TABLE           = aws_dynamodb_table.user_discoveries.name
    SHARED_CELLS_TABLE               = aws_dynamodb_table.shared_cells.name
    PLAYER_PRESENCE_TABLE            = aws_dynamodb_table.player_presence.name
    LANDMARKS_TABLE                  = aws_dynamodb_table.landmarks.name
    PENDING_LANDMARK_BUCKET          = aws_s3_bucket.pending_landmarks.id
    APPROVED_LANDMARK_BUCKET         = aws_s3_bucket.approved_landmarks.id
    DISCOVERY_CACHE_BUCKET           = aws_s3_bucket.discovery_cache.id
    CLOUDFRONT_DOMAIN                = aws_cloudfront_distribution.approved_landmarks.domain_name
    MAX_UPLOAD_BYTES                 = tostring(var.max_landmark_upload_bytes)
    MAX_PENDING_PER_USER             = tostring(var.max_pending_landmarks_per_user)
    MAX_UPLOADS_PER_DAY              = tostring(var.max_landmark_uploads_per_day)
    PRESENCE_TTL_SECONDS             = tostring(var.presence_ttl_seconds)
    SHARED_TILE_CACHE_PREFIX         = local.shared_tile_cache_prefix
    SHARED_TILE_CACHE_TTL_SECONDS    = tostring(var.shared_tile_cache_ttl_seconds)
    SHARED_TILE_EDGE_CACHE_SECONDS   = tostring(var.shared_tile_edge_cache_seconds)
    SHARED_TILE_REBUILD_QUEUE_URL    = aws_sqs_queue.shared_tile_rebuild.id
    USER_BOOTSTRAP_CACHE_PREFIX      = "user-bootstrap/v1"
    USER_BOOTSTRAP_CACHE_TTL_SECONDS = tostring(var.user_bootstrap_cache_ttl_seconds)
    UPLOAD_EXPIRATION_SECONDS        = tostring(var.presigned_upload_expiration_seconds)
    ALLOWED_UPLOAD_CONTENT_TYPES     = local.allowed_upload_content_types_csv
    ADMIN_GROUPS                     = "${var.cognito_admin_group_name},${var.cognito_moderator_group_name}"
  }

  lambda_request_vtl  = file("${path.module}/templates/lambda_request.vtl")
  lambda_response_vtl = file("${path.module}/templates/lambda_response.vtl")
}

resource "aws_lambda_function" "sync_discoveries" {
  function_name    = "${local.name_prefix}-sync-discoveries"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "python3.12"
  handler          = "sync_discoveries.index.handler"
  architectures    = ["arm64"]
  filename         = data.archive_file.lambda_bundle.output_path
  source_code_hash = data.archive_file.lambda_bundle.output_base64sha256
  timeout          = 15
  memory_size      = 256

  environment {
    variables = local.lambda_env
  }

  tags = local.tags
}

resource "aws_lambda_function" "get_shared_viewport" {
  function_name    = "${local.name_prefix}-get-shared-viewport"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "python3.12"
  handler          = "get_shared_viewport.index.handler"
  architectures    = ["arm64"]
  filename         = data.archive_file.lambda_bundle.output_path
  source_code_hash = data.archive_file.lambda_bundle.output_base64sha256
  timeout          = 20
  memory_size      = 256

  environment {
    variables = local.lambda_env
  }

  tags = local.tags
}

resource "aws_lambda_function" "get_shared_presence" {
  function_name    = "${local.name_prefix}-get-shared-presence"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "python3.12"
  handler          = "get_shared_presence.index.handler"
  architectures    = ["arm64"]
  filename         = data.archive_file.lambda_bundle.output_path
  source_code_hash = data.archive_file.lambda_bundle.output_base64sha256
  timeout          = 15
  memory_size      = 256

  environment {
    variables = local.lambda_env
  }

  tags = local.tags
}

resource "aws_lambda_function" "create_landmark_upload_ticket" {
  function_name    = "${local.name_prefix}-create-landmark-upload-ticket"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "python3.12"
  handler          = "create_landmark_upload_ticket.index.handler"
  architectures    = ["arm64"]
  filename         = data.archive_file.lambda_bundle.output_path
  source_code_hash = data.archive_file.lambda_bundle.output_base64sha256
  timeout          = 20
  memory_size      = 256

  environment {
    variables = local.lambda_env
  }

  tags = local.tags
}

resource "aws_lambda_function" "finalize_landmark_upload" {
  function_name    = "${local.name_prefix}-finalize-landmark-upload"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "python3.12"
  handler          = "finalize_landmark_upload.index.handler"
  architectures    = ["arm64"]
  filename         = data.archive_file.lambda_bundle.output_path
  source_code_hash = data.archive_file.lambda_bundle.output_base64sha256
  timeout          = 15
  memory_size      = 256

  environment {
    variables = local.lambda_env
  }

  tags = local.tags
}

resource "aws_lambda_function" "list_pending_landmarks" {
  function_name    = "${local.name_prefix}-list-pending-landmarks"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "python3.12"
  handler          = "list_pending_landmarks.index.handler"
  architectures    = ["arm64"]
  filename         = data.archive_file.lambda_bundle.output_path
  source_code_hash = data.archive_file.lambda_bundle.output_base64sha256
  timeout          = 15
  memory_size      = 256

  environment {
    variables = local.lambda_env
  }

  tags = local.tags
}

resource "aws_lambda_function" "get_pending_landmark_review_url" {
  function_name    = "${local.name_prefix}-get-pending-landmark-review-url"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "python3.12"
  handler          = "get_pending_landmark_review_url.index.handler"
  architectures    = ["arm64"]
  filename         = data.archive_file.lambda_bundle.output_path
  source_code_hash = data.archive_file.lambda_bundle.output_base64sha256
  timeout          = 15
  memory_size      = 256

  environment {
    variables = local.lambda_env
  }

  tags = local.tags
}

resource "aws_lambda_function" "moderate_landmark" {
  function_name    = "${local.name_prefix}-moderate-landmark"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "python3.12"
  handler          = "moderate_landmark.index.handler"
  architectures    = ["arm64"]
  filename         = data.archive_file.lambda_bundle.output_path
  source_code_hash = data.archive_file.lambda_bundle.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = local.lambda_env
  }

  tags = local.tags
}

resource "aws_lambda_function" "get_landmark_view_url" {
  function_name    = "${local.name_prefix}-get-landmark-view-url"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "python3.12"
  handler          = "get_landmark_view_url.index.handler"
  architectures    = ["arm64"]
  filename         = data.archive_file.lambda_bundle.output_path
  source_code_hash = data.archive_file.lambda_bundle.output_base64sha256
  timeout          = 15
  memory_size      = 256

  environment {
    variables = local.lambda_env
  }

  tags = local.tags
}

resource "aws_lambda_function" "get_my_discovery_bootstrap" {
  function_name    = "${local.name_prefix}-get-my-discovery-bootstrap"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "python3.12"
  handler          = "get_my_discovery_bootstrap.index.handler"
  architectures    = ["arm64"]
  filename         = data.archive_file.lambda_bundle.output_path
  source_code_hash = data.archive_file.lambda_bundle.output_base64sha256
  timeout          = 60
  memory_size      = 512

  environment {
    variables = local.lambda_env
  }

  tags = local.tags
}

resource "aws_lambda_function" "rebuild_shared_tiles" {
  function_name    = "${local.name_prefix}-rebuild-shared-tiles"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "python3.12"
  handler          = "rebuild_shared_tiles.index.handler"
  architectures    = ["arm64"]
  filename         = data.archive_file.lambda_bundle.output_path
  source_code_hash = data.archive_file.lambda_bundle.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = local.lambda_env
  }

  tags = local.tags
}

resource "aws_lambda_event_source_mapping" "rebuild_shared_tiles" {
  event_source_arn                   = aws_sqs_queue.shared_tile_rebuild.arn
  function_name                      = aws_lambda_function.rebuild_shared_tiles.arn
  batch_size                         = 10
  maximum_batching_window_in_seconds = 2
  enabled                            = true
}

resource "aws_iam_role_policy" "appsync_lambda" {
  name = "${local.name_prefix}-appsync-lambda"
  role = aws_iam_role.appsync_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["lambda:InvokeFunction"]
        Resource = [
          aws_lambda_function.sync_discoveries.arn,
          aws_lambda_function.get_shared_viewport.arn,
          aws_lambda_function.get_shared_presence.arn,
          aws_lambda_function.create_landmark_upload_ticket.arn,
          aws_lambda_function.finalize_landmark_upload.arn,
          aws_lambda_function.list_pending_landmarks.arn,
          aws_lambda_function.get_pending_landmark_review_url.arn,
          aws_lambda_function.moderate_landmark.arn,
          aws_lambda_function.get_landmark_view_url.arn,
          aws_lambda_function.get_my_discovery_bootstrap.arn
        ]
      }
    ]
  })
}

# AppSync
resource "aws_appsync_graphql_api" "main" {
  name                = local.name_prefix
  authentication_type = "AMAZON_COGNITO_USER_POOLS"
  xray_enabled        = false
  schema              = file("${path.module}/graphql/schema.graphql")

  user_pool_config {
    aws_region          = var.aws_region
    user_pool_id        = aws_cognito_user_pool.main.id
    default_action      = "ALLOW"
    app_id_client_regex = aws_cognito_user_pool_client.mobile.id
  }

  tags = local.tags
}

resource "aws_appsync_datasource" "sync_discoveries" {
  api_id           = aws_appsync_graphql_api.main.id
  name             = "SyncDiscoveriesLambda"
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_lambda.arn

  lambda_config {
    function_arn = aws_lambda_function.sync_discoveries.arn
  }
}

resource "aws_appsync_datasource" "get_shared_viewport" {
  api_id           = aws_appsync_graphql_api.main.id
  name             = "GetSharedViewportLambda"
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_lambda.arn

  lambda_config {
    function_arn = aws_lambda_function.get_shared_viewport.arn
  }
}

resource "aws_appsync_datasource" "get_shared_presence" {
  api_id           = aws_appsync_graphql_api.main.id
  name             = "GetSharedPresenceLambda"
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_lambda.arn

  lambda_config {
    function_arn = aws_lambda_function.get_shared_presence.arn
  }
}

resource "aws_appsync_datasource" "create_landmark_upload_ticket" {
  api_id           = aws_appsync_graphql_api.main.id
  name             = "CreateLandmarkUploadTicketLambda"
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_lambda.arn

  lambda_config {
    function_arn = aws_lambda_function.create_landmark_upload_ticket.arn
  }
}

resource "aws_appsync_datasource" "finalize_landmark_upload" {
  api_id           = aws_appsync_graphql_api.main.id
  name             = "FinalizeLandmarkUploadLambda"
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_lambda.arn

  lambda_config {
    function_arn = aws_lambda_function.finalize_landmark_upload.arn
  }
}

resource "aws_appsync_datasource" "list_pending_landmarks" {
  api_id           = aws_appsync_graphql_api.main.id
  name             = "ListPendingLandmarksLambda"
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_lambda.arn

  lambda_config {
    function_arn = aws_lambda_function.list_pending_landmarks.arn
  }
}

resource "aws_appsync_datasource" "get_pending_landmark_review_url" {
  api_id           = aws_appsync_graphql_api.main.id
  name             = "GetPendingLandmarkReviewUrlLambda"
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_lambda.arn

  lambda_config {
    function_arn = aws_lambda_function.get_pending_landmark_review_url.arn
  }
}

resource "aws_appsync_datasource" "moderate_landmark" {
  api_id           = aws_appsync_graphql_api.main.id
  name             = "ModerateLandmarkLambda"
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_lambda.arn

  lambda_config {
    function_arn = aws_lambda_function.moderate_landmark.arn
  }
}

resource "aws_appsync_datasource" "get_landmark_view_url" {
  api_id           = aws_appsync_graphql_api.main.id
  name             = "GetLandmarkViewUrlLambda"
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_lambda.arn

  lambda_config {
    function_arn = aws_lambda_function.get_landmark_view_url.arn
  }
}

resource "aws_appsync_datasource" "get_my_discovery_bootstrap" {
  api_id           = aws_appsync_graphql_api.main.id
  name             = "GetMyDiscoveryBootstrapLambda"
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_lambda.arn

  lambda_config {
    function_arn = aws_lambda_function.get_my_discovery_bootstrap.arn
  }
}

resource "aws_appsync_resolver" "sync_discoveries" {
  api_id            = aws_appsync_graphql_api.main.id
  type              = "Mutation"
  field             = "syncDiscoveries"
  data_source       = aws_appsync_datasource.sync_discoveries.name
  request_template  = local.lambda_request_vtl
  response_template = local.lambda_response_vtl

}

resource "aws_appsync_resolver" "get_shared_viewport" {
  api_id            = aws_appsync_graphql_api.main.id
  type              = "Query"
  field             = "getSharedViewport"
  data_source       = aws_appsync_datasource.get_shared_viewport.name
  request_template  = local.lambda_request_vtl
  response_template = local.lambda_response_vtl

}

resource "aws_appsync_resolver" "get_shared_presence" {
  api_id            = aws_appsync_graphql_api.main.id
  type              = "Query"
  field             = "getSharedPresence"
  data_source       = aws_appsync_datasource.get_shared_presence.name
  request_template  = local.lambda_request_vtl
  response_template = local.lambda_response_vtl

}

resource "aws_appsync_resolver" "create_landmark_upload_ticket" {
  api_id            = aws_appsync_graphql_api.main.id
  type              = "Mutation"
  field             = "createLandmarkUploadTicket"
  data_source       = aws_appsync_datasource.create_landmark_upload_ticket.name
  request_template  = local.lambda_request_vtl
  response_template = local.lambda_response_vtl

}

resource "aws_appsync_resolver" "finalize_landmark_upload" {
  api_id            = aws_appsync_graphql_api.main.id
  type              = "Mutation"
  field             = "finalizeLandmarkUpload"
  data_source       = aws_appsync_datasource.finalize_landmark_upload.name
  request_template  = local.lambda_request_vtl
  response_template = local.lambda_response_vtl

}

resource "aws_appsync_resolver" "list_pending_landmarks" {
  api_id            = aws_appsync_graphql_api.main.id
  type              = "Query"
  field             = "listPendingLandmarks"
  data_source       = aws_appsync_datasource.list_pending_landmarks.name
  request_template  = local.lambda_request_vtl
  response_template = local.lambda_response_vtl

}

resource "aws_appsync_resolver" "get_pending_landmark_review_url" {
  api_id            = aws_appsync_graphql_api.main.id
  type              = "Query"
  field             = "getPendingLandmarkReviewUrl"
  data_source       = aws_appsync_datasource.get_pending_landmark_review_url.name
  request_template  = local.lambda_request_vtl
  response_template = local.lambda_response_vtl

}

resource "aws_appsync_resolver" "moderate_landmark" {
  api_id            = aws_appsync_graphql_api.main.id
  type              = "Mutation"
  field             = "moderateLandmark"
  data_source       = aws_appsync_datasource.moderate_landmark.name
  request_template  = local.lambda_request_vtl
  response_template = local.lambda_response_vtl

}

resource "aws_appsync_resolver" "get_landmark_view_url" {
  api_id            = aws_appsync_graphql_api.main.id
  type              = "Query"
  field             = "getLandmarkViewUrl"
  data_source       = aws_appsync_datasource.get_landmark_view_url.name
  request_template  = local.lambda_request_vtl
  response_template = local.lambda_response_vtl

}

resource "aws_appsync_resolver" "get_my_discovery_bootstrap" {
  api_id            = aws_appsync_graphql_api.main.id
  type              = "Query"
  field             = "getMyDiscoveryBootstrap"
  data_source       = aws_appsync_datasource.get_my_discovery_bootstrap.name
  request_template  = local.lambda_request_vtl
  response_template = local.lambda_response_vtl

}
