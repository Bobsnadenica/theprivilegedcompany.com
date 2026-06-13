output "aws_region" { value = var.aws_region }
output "appsync_api_id" { value = aws_appsync_graphql_api.main.id }
output "appsync_graphql_url" { value = aws_appsync_graphql_api.main.uris["GRAPHQL"] }
output "cognito_user_pool_id" { value = aws_cognito_user_pool.main.id }
output "cognito_user_pool_client_id" { value = aws_cognito_user_pool_client.mobile.id }
output "cognito_group_names" { value = [aws_cognito_user_group.admin.name, aws_cognito_user_group.moderator.name, aws_cognito_user_group.user.name] }
output "pending_landmark_bucket_name" { value = aws_s3_bucket.pending_landmarks.id }
output "approved_landmark_bucket_name" { value = aws_s3_bucket.approved_landmarks.id }
output "discovery_cache_bucket_name" { value = aws_s3_bucket.discovery_cache.id }
output "shared_tile_rebuild_queue_url" { value = aws_sqs_queue.shared_tile_rebuild.id }
output "cloudfront_approved_domain" { value = aws_cloudfront_distribution.approved_landmarks.domain_name }
output "cloudfront_shared_tiles_domain" { value = aws_cloudfront_distribution.shared_tiles.domain_name }
output "user_discoveries_table_name" { value = aws_dynamodb_table.user_discoveries.name }
output "shared_cells_table_name" { value = aws_dynamodb_table.shared_cells.name }
output "player_presence_table_name" { value = aws_dynamodb_table.player_presence.name }
output "landmarks_table_name" { value = aws_dynamodb_table.landmarks.name }
output "lambda_function_names" {
  value = {
    sync_discoveries                = aws_lambda_function.sync_discoveries.function_name
    get_shared_viewport             = aws_lambda_function.get_shared_viewport.function_name
    get_shared_presence             = aws_lambda_function.get_shared_presence.function_name
    create_landmark_upload_ticket   = aws_lambda_function.create_landmark_upload_ticket.function_name
    finalize_landmark_upload        = aws_lambda_function.finalize_landmark_upload.function_name
    list_pending_landmarks          = aws_lambda_function.list_pending_landmarks.function_name
    get_pending_landmark_review_url = aws_lambda_function.get_pending_landmark_review_url.function_name
    moderate_landmark               = aws_lambda_function.moderate_landmark.function_name
    get_landmark_view_url           = aws_lambda_function.get_landmark_view_url.function_name
    get_my_discovery_bootstrap      = aws_lambda_function.get_my_discovery_bootstrap.function_name
    rebuild_shared_tiles            = aws_lambda_function.rebuild_shared_tiles.function_name
  }
}
