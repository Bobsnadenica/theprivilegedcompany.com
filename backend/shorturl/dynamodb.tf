# Link store. One item per short link, keyed by slug.
# expiresAt (epoch seconds) is optional; DynamoDB TTL reaps expired links.
resource "aws_dynamodb_table" "links" {
  name         = "${var.project}-links"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "slug"

  attribute {
    name = "slug"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }
}
