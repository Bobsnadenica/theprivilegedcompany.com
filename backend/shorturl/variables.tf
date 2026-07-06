variable "region" {
  description = "AWS region for all resources."
  type        = string
  default     = "eu-west-1"
}

variable "project" {
  description = "Project name; used as a resource prefix and tag."
  type        = string
  default     = "tpc-shorturl"
}

variable "short_domain" {
  description = "Custom domain the short links live on."
  type        = string
  default     = "go.theprivilegedcompany.com"
}

variable "frontend_url" {
  description = "Where GET / on the short domain redirects to (the shortener UI)."
  type        = string
  default     = "https://www.theprivilegedcompany.com/dev/shorturl/"
}

variable "create_key" {
  description = "Shared secret required to create links / read stats. Set this in terraform.tfvars (gitignored) — do not commit it, the repo is public."
  type        = string
  sensitive   = true
}

variable "dns_ready" {
  description = "Set to true after the ACM validation CNAME has been added in Cloudflare; enables cert validation wait + custom domain + mapping."
  type        = bool
  default     = false
}

variable "cors_allowed_origins" {
  description = "Browser origins allowed to call the create/stats API."
  type        = list(string)
  default = [
    "https://www.theprivilegedcompany.com",
    "https://theprivilegedcompany.com",
    "http://localhost:5173",
  ]
}
