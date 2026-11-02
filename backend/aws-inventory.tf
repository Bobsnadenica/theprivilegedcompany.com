data "archive_file" "aws_inventory" {
  type        = "zip"
  source_dir  = "${path.module}/aws-inventory/src"
  output_path = "${path.module}/.terraform-build/aws-inventory.zip"
}

resource "aws_cloudwatch_log_group" "aws_inventory" {
  name              = "/aws/lambda/tpc-aws-inventory"
  retention_in_days = 14
}

resource "aws_iam_role" "aws_inventory" {
  name = "tpc-aws-inventory"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "aws_inventory" {
  name = "tpc-aws-inventory-read-only"
  role = aws_iam_role.aws_inventory.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.aws_inventory.arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["resource-explorer-2:Get*", "resource-explorer-2:List*", "resource-explorer-2:Search"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListAllMyBuckets"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["lambda:ListFunctions"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["cloudwatch:GetMetricStatistics"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetBucketLocation", "s3:ListBucket"]
        Resource = "arn:aws:s3:::*"
        Condition = {
          StringEquals = { "aws:ResourceAccount" = data.aws_caller_identity.current.account_id }
        }
      }
    ]
  })
}

resource "aws_lambda_function" "aws_inventory" {
  function_name    = "tpc-aws-inventory"
  description      = "Read-only, on-demand AWS resource inventory for the private admin portal."
  role             = aws_iam_role.aws_inventory.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.aws_inventory.output_path
  source_code_hash = data.archive_file.aws_inventory.output_base64sha256
  memory_size      = 512
  timeout          = 120
  environment {
    variables = {
      HOME_REGION     = var.region
      ALLOWED_ORIGINS = join(",", concat(var.cors_allowed_origins, ["http://localhost:5189", "http://127.0.0.1:5189"]))
    }
  }
  depends_on = [aws_iam_role_policy.aws_inventory, aws_cloudwatch_log_group.aws_inventory]
}

resource "aws_lambda_function_url" "aws_inventory" {
  function_name      = aws_lambda_function.aws_inventory.function_name
  authorization_type = "AWS_IAM"
  cors {
    allow_origins = concat(var.cors_allowed_origins, ["http://localhost:5189", "http://127.0.0.1:5189"])
    allow_methods = ["GET"]
    allow_headers = ["authorization", "x-amz-date", "x-amz-security-token", "x-amz-content-sha256"]
    max_age       = 3600
  }
}

data "aws_iam_policy_document" "authenticated_aws_inventory" {
  statement {
    sid       = "AdminInvokeAwsInventoryUrl"
    effect    = "Allow"
    actions   = ["lambda:InvokeFunctionUrl"]
    resources = [aws_lambda_function.aws_inventory.arn]
    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalTag/email"
      values   = [var.admin_email]
    }
    condition {
      test     = "StringEquals"
      variable = "lambda:FunctionUrlAuthType"
      values   = ["AWS_IAM"]
    }
  }
  statement {
    sid       = "AdminInvokeOnlyThroughInventoryUrl"
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.aws_inventory.arn]
    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalTag/email"
      values   = [var.admin_email]
    }
    condition {
      test     = "Bool"
      variable = "lambda:InvokedViaFunctionUrl"
      values   = ["true"]
    }
  }
}

resource "aws_iam_role_policy" "authenticated_aws_inventory" {
  name   = "${var.project}-admin-aws-inventory"
  role   = aws_iam_role.authenticated.id
  policy = data.aws_iam_policy_document.authenticated_aws_inventory.json
}

output "aws_inventory_url" {
  description = "IAM-authenticated, admin-only AWS inventory endpoint."
  value       = aws_lambda_function_url.aws_inventory.function_url
}
