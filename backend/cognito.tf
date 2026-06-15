# --- User Pool: authentication only -----------------------------------------
# Users are created manually by an admin (no self sign-up). Sign-in is by email.
resource "aws_cognito_user_pool" "portal" {
  name = var.project

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }
}

# Public SPA client — no secret (browsers cannot keep one). SRP keeps the
# password off the wire.
resource "aws_cognito_user_pool_client" "portal" {
  name         = "${var.project}-web"
  user_pool_id = aws_cognito_user_pool.portal.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.portal.id
  description  = "Administrators with a personal upload space."
}

# --- Identity Pool: trades a logged-in token for temporary AWS credentials ----
resource "aws_cognito_identity_pool" "portal" {
  identity_pool_name               = var.project
  allow_unauthenticated_identities = false

  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.portal.id
    provider_name           = aws_cognito_user_pool.portal.endpoint
    server_side_token_check = true
  }
}

resource "aws_cognito_identity_pool_roles_attachment" "portal" {
  identity_pool_id = aws_cognito_identity_pool.portal.id

  roles = {
    authenticated = aws_iam_role.authenticated.arn
  }
}
