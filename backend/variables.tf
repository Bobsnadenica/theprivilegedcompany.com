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

variable "cors_allowed_origins" {
  description = "Browser origins allowed to call the uploads bucket directly."
  type        = list(string)
  default = [
    "https://www.theprivilegedcompany.com",
    "https://theprivilegedcompany.com",
    "http://localhost:5173",
  ]
}
