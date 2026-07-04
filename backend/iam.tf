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

  # Admin-only: read and manage the contact-form inbox. Gated on the caller's
  # email principal tag matching var.admin_email, so only the admin sees briefs
  # even though every authenticated user assumes this same role.
  statement {
    sid       = "AdminListInbox"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.uploads.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["inbox/*"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalTag/email"
      values   = [var.admin_email]
    }
  }

  statement {
    sid    = "AdminManageInbox"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${aws_s3_bucket.uploads.arn}/inbox/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalTag/email"
      values   = [var.admin_email]
    }
  }
}

resource "aws_iam_role_policy" "authenticated_s3" {
  name   = "${var.project}-s3-personal-space"
  role   = aws_iam_role.authenticated.id
  policy = data.aws_iam_policy_document.authenticated_s3.json
}

# --- Guest (unauthenticated) role: the public contact form ------------------
# Anonymous visitors get temporary credentials that can ONLY drop a brief JSON
# into inbox/new/*. No read, no list, no access to any user's files.
data "aws_iam_policy_document" "unauthenticated_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

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
      values   = ["unauthenticated"]
    }
  }
}

resource "aws_iam_role" "unauthenticated" {
  name               = "${var.project}-unauthenticated"
  assume_role_policy = data.aws_iam_policy_document.unauthenticated_trust.json
}

data "aws_iam_policy_document" "unauthenticated_s3" {
  statement {
    sid       = "DropBriefInInbox"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.uploads.arn}/inbox/new/*"]
  }
}

resource "aws_iam_role_policy" "unauthenticated_s3" {
  name   = "${var.project}-s3-inbox-write"
  role   = aws_iam_role.unauthenticated.id
  policy = data.aws_iam_policy_document.unauthenticated_s3.json
}
