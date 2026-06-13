variable "project_name" {
  type    = string
  default = "world-of-fog"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "aws_region" {
  type    = string
  default = "eu-west-2"
}

variable "allowed_upload_content_types" {
  type    = list(string)
  default = ["image/jpeg", "image/png", "image/webp"]
}

variable "max_landmark_upload_bytes" {
  type    = number
  default = 5242880
}

variable "max_pending_landmarks_per_user" {
  type    = number
  default = 10
}

variable "max_landmark_uploads_per_day" {
  type    = number
  default = 20
}

variable "presence_ttl_seconds" {
  type    = number
  default = 60

  validation {
    condition     = var.presence_ttl_seconds >= 15
    error_message = "presence_ttl_seconds must be at least 15 seconds."
  }
}

variable "shared_tile_cache_ttl_seconds" {
  type    = number
  default = 2592000

  validation {
    condition     = var.shared_tile_cache_ttl_seconds >= 60
    error_message = "shared_tile_cache_ttl_seconds must be at least 60 seconds."
  }
}

variable "shared_tile_edge_cache_seconds" {
  type    = number
  default = 30

  validation {
    condition     = var.shared_tile_edge_cache_seconds >= 5
    error_message = "shared_tile_edge_cache_seconds must be at least 5 seconds."
  }
}

variable "user_bootstrap_cache_ttl_seconds" {
  type    = number
  default = 2592000

  validation {
    condition     = var.user_bootstrap_cache_ttl_seconds >= 300
    error_message = "user_bootstrap_cache_ttl_seconds must be at least 300 seconds."
  }
}

variable "presigned_upload_expiration_seconds" {
  type    = number
  default = 600
}

variable "pending_landmark_retention_days" {
  type    = number
  default = 30

  validation {
    condition     = var.pending_landmark_retention_days >= 1
    error_message = "pending_landmark_retention_days must be at least 1 day."
  }
}

variable "approved_landmark_noncurrent_retention_days" {
  type    = number
  default = 30

  validation {
    condition     = var.approved_landmark_noncurrent_retention_days >= 1
    error_message = "approved_landmark_noncurrent_retention_days must be at least 1 day."
  }
}

variable "discovery_cache_retention_days" {
  type    = number
  default = 30

  validation {
    condition     = var.discovery_cache_retention_days >= 1
    error_message = "discovery_cache_retention_days must be at least 1 day."
  }
}

variable "cognito_admin_group_name" {
  type    = string
  default = "admin"
}

variable "cognito_moderator_group_name" {
  type    = string
  default = "moderator"
}

variable "cognito_user_group_name" {
  type    = string
  default = "user"
}

variable "cognito_callback_urls" {
  type    = list(string)
  default = []
}

variable "cognito_logout_urls" {
  type    = list(string)
  default = []
}

variable "cors_allowed_origins" {
  type    = list(string)
  default = ["*"]
}
