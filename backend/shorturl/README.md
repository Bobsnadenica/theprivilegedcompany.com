# TPC Short Links — backend

Serverless URL shortener behind `https://go.theprivilegedcompany.com`.
UI lives at [`/dev/shorturl/`](../../dev/shorturl/index.html); this module owns everything else:

- **API Gateway HTTP API** — `GET /{slug}` (redirect), `POST /api/links` (create),
  `GET /api/links/{slug}/stats` (stats), `GET /` (bounce to the UI). Throttled at
  10 rps / 25 burst.
- **Lambda** `tpc-shorturl-fn` (Node 22, arm64) — [lambda/index.mjs](lambda/index.mjs).
- **DynamoDB** `tpc-shorturl-links` — on-demand, TTL on `expiresAt`, PITR on.
- **ACM cert + API GW custom domain** for `go.theprivilegedcompany.com`.

Create/stats calls require the `x-create-key` header (`create_key` in
`terraform.tfvars`, gitignored — the repo is public). Redirects are public.
Generated slugs are 6 crypto-random base62 chars written with a
`attribute_not_exists` condition; custom slugs allowed (`[A-Za-z0-9_-]{3,32}`).
Destination URLs must be http(s) and may not point at private/local hosts or
the shortener itself. Redirects are `302 no-store` so click counts stay honest.

## Deploy (two-phase — DNS is manual in Cloudflare)

```sh
terraform init
terraform apply                      # phase 1: everything except the custom domain
# -> add the `acm_validation_records` CNAME in Cloudflare (DNS only / grey cloud)
terraform apply -var dns_ready=true  # phase 2: waits for cert, creates custom domain
# -> CNAME go.theprivilegedcompany.com -> `short_domain_target` output (DNS only)
```

Set `dns_ready = true` in `terraform.tfvars` after phase 2 so plain
`terraform apply` keeps the domain.
