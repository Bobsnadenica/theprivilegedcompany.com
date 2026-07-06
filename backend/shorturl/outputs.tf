output "api_endpoint" {
  description = "Raw HTTP API endpoint (works before the custom domain is up)."
  value       = aws_apigatewayv2_api.shorturl.api_endpoint
}

output "acm_validation_records" {
  description = "Add this CNAME in Cloudflare (DNS only / grey cloud) to validate the cert."
  value = [
    for dvo in aws_acm_certificate.short_domain.domain_validation_options : {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  ]
}

output "short_domain_target" {
  description = "CNAME target for go.<domain> in Cloudflare (DNS only / grey cloud). Null until dns_ready=true."
  value       = try(aws_apigatewayv2_domain_name.short_domain[0].domain_name_configuration[0].target_domain_name, null)
}
