output "region" {
  description = "AWS region the backend is deployed in."
  value       = var.region
}

output "user_pool_id" {
  description = "Cognito User Pool id (used by the portal and admin CLI)."
  value       = aws_cognito_user_pool.portal.id
}

output "user_pool_client_id" {
  description = "Cognito App Client id for the web portal."
  value       = aws_cognito_user_pool_client.portal.id
}

output "identity_pool_id" {
  description = "Cognito Identity Pool id."
  value       = aws_cognito_identity_pool.portal.id
}

output "bucket_name" {
  description = "S3 bucket holding per-user uploads."
  value       = aws_s3_bucket.uploads.bucket
}
