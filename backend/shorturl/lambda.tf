data "archive_file" "redirector" {
  type        = "zip"
  source_file = "${path.module}/lambda/index.mjs"
  output_path = "${path.module}/.terraform-build/redirector.zip"
}

resource "aws_iam_role" "redirector" {
  name = "${var.project}-fn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "redirector" {
  name = "${var.project}-fn-policy"
  role = aws_iam_role.redirector.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
        ]
        Resource = aws_dynamodb_table.links.arn
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "${aws_cloudwatch_log_group.redirector.arn}:*"
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "redirector" {
  name              = "/aws/lambda/${var.project}-fn"
  retention_in_days = 30
}

resource "aws_lambda_function" "redirector" {
  function_name    = "${var.project}-fn"
  role             = aws_iam_role.redirector.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.redirector.output_path
  source_code_hash = data.archive_file.redirector.output_base64sha256
  timeout          = 10
  memory_size      = 128
  architectures    = ["arm64"]

  environment {
    variables = {
      TABLE_NAME   = aws_dynamodb_table.links.name
      DOMAIN_URL   = "https://${var.short_domain}"
      FRONTEND_URL = var.frontend_url
      CREATE_KEY   = var.create_key
    }
  }

  depends_on = [aws_cloudwatch_log_group.redirector]
}
