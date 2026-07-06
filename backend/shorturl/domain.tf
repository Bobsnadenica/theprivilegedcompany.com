# Custom domain is a two-phase apply because DNS lives in Cloudflare and the
# validation CNAME has to be added by hand:
#   1. terraform apply                    -> creates the cert, outputs the
#      validation record; add it in Cloudflare.
#   2. terraform apply -var dns_ready=true -> waits for ISSUED, creates the
#      custom domain + mapping; then point go.<domain> at the output target.
resource "aws_acm_certificate" "short_domain" {
  domain_name       = var.short_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "short_domain" {
  count           = var.dns_ready ? 1 : 0
  certificate_arn = aws_acm_certificate.short_domain.arn

  timeouts {
    create = "15m"
  }
}

resource "aws_apigatewayv2_domain_name" "short_domain" {
  count       = var.dns_ready ? 1 : 0
  domain_name = var.short_domain

  domain_name_configuration {
    certificate_arn = aws_acm_certificate.short_domain.arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  depends_on = [aws_acm_certificate_validation.short_domain]
}

resource "aws_apigatewayv2_api_mapping" "short_domain" {
  count       = var.dns_ready ? 1 : 0
  api_id      = aws_apigatewayv2_api.shorturl.id
  domain_name = aws_apigatewayv2_domain_name.short_domain[0].id
  stage       = aws_apigatewayv2_stage.default.id
}
