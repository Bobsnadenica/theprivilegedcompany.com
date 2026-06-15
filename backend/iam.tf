# Trust policy: only identities authenticated through THIS identity pool may
# assume the role.
data "aws_iam_policy_document" "authenticated_trust" {
  statement {
    effect = "Allow"
    # TagSession is required so the email claim can be attached as a principal
    # tag (used by the S3 policy below for per-user isolation).
    actions = ["sts:AssumeRoleWithWebIdentity", "sts:TagSession"]

    principals {
      type        = "Federated"
      identifiers = ["cognito-identity.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "cognito-identity.amazonaws.com:aud"
      values   = [aws_cognito_identity_pool.portal.id]
    }

    condition {
      test     = "ForAnyValue:StringLike"
      variable = "cognito-identity.amazonaws.com:amr"
      values   = ["authenticated"]
    }
  }
}

resource "aws_iam_role" "authenticated" {
  name               = "${var.project}-authenticated"
  assume_role_policy = data.aws_iam_policy_document.authenticated_trust.json
}

# Personal-space policy: ${aws:PrincipalTag/email} resolves at request time to
# the caller's own email (mapped from the Cognito token by the identity-pool
# principal tag in cognito.tf), so each user is boxed into users/<their-email>/*
# and can never see anyone else's files.
# NOTE: $${...} escapes Terraform interpolation so the literal IAM policy
# variable reaches AWS.
data "aws_iam_policy_document" "authenticated_s3" {
  statement {
    sid       = "ListOwnPrefix"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.uploads.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["users/$${aws:PrincipalTag/email}/*"]
    }
  }

  statement {
    sid    = "ReadWriteOwnObjects"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      "${aws_s3_bucket.uploads.arn}/users/$${aws:PrincipalTag/email}/*",
    ]
  }
}

resource "aws_iam_role_policy" "authenticated_s3" {
  name   = "${var.project}-s3-personal-space"
  role   = aws_iam_role.authenticated.id
  policy = data.aws_iam_policy_document.authenticated_s3.json
}
