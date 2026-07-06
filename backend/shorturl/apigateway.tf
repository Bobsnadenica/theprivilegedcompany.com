resource "aws_apigatewayv2_api" "shorturl" {
  name          = "${var.project}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.cors_allowed_origins
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["content-type", "x-create-key"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "redirector" {
  api_id                 = aws_apigatewayv2_api.shorturl.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.redirector.invoke_arn
  payload_format_version = "2.0"
}

locals {
  routes = [
    "GET /",
    "GET /{slug}",
    "POST /api/links",
    "GET /api/links/{slug}/stats",
  ]
}

resource "aws_apigatewayv2_route" "routes" {
  for_each  = toset(local.routes)
  api_id    = aws_apigatewayv2_api.shorturl.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.redirector.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.shorturl.id
  name        = "$default"
  auto_deploy = true

  # Keep abuse in check: the whole API is small and human-driven.
  default_route_settings {
    throttling_rate_limit  = 10
    throttling_burst_limit = 25
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.redirector.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.shorturl.execution_arn}/*/*"
}
