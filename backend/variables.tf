variable "region" {
  description = "AWS region for all resources."
  type        = string
  default     = "eu-west-1"
}

variable "project" {
  description = "Project name; used as a resource prefix and tag."
  type        = string
  default     = "tpc-portal"
}

variable "bucket_name" {
  description = "Globally-unique S3 bucket name for user uploads."
  type        = string
  default     = "theprivilegedcompany-bucket"
}

variable "admin_email" {
  description = "Email of the admin who may read the contact-form inbox. Set this in terraform.tfvars (gitignored) — do not commit it, the repo is public."
  type        = string
}

variable "cors_allowed_origins" {
  description = "Browser origins allowed to call the uploads bucket directly."
  type        = list(string)
  default = [
    "https://www.theprivilegedcompany.com",
    "https://theprivilegedcompany.com",
    "http://localhost:5173",
  ]
}
