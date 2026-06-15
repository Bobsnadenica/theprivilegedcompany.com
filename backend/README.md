# Backend — Cognito + S3 login & personal file storage

Terraform that stands up the login + private file-upload backend for the portal at
[`/portal/`](../portal). **No servers** — the browser authenticates against a Cognito
User Pool, swaps the login token for short-lived AWS credentials via a Cognito Identity
Pool, and talks straight to S3. The user's **email** claim is mapped into a session
**principal tag**, and IAM scopes every user to `users/<their-email>/*`, so each person
only ever sees their own files.

```
Browser ──login──▶ Cognito User Pool ──token (email)──▶ Cognito Identity Pool
                                                          │ temp creds + email principal tag
                                                          ▼
                              S3  theprivilegedcompany-bucket / users/<email>/*
```

Region: **eu-west-1**. Bucket: **`theprivilegedcompany-bucket`**. Users are **created
manually** (no self sign-up). Single `admin` group for now.

## What gets created

| Resource | Purpose |
| --- | --- |
| `aws_cognito_user_pool` | Authentication (email login, admin-create-only) |
| `aws_cognito_user_pool_client` | Public SPA client, no secret, SRP auth |
| `aws_cognito_user_group.admin` | The `admin` group |
| `aws_cognito_identity_pool` | Exchanges login token → temporary AWS creds |
| `aws_cognito_identity_pool_provider_principal_tag` | Maps the `email` claim → a session principal tag |
| `aws_iam_role.authenticated` | Role assumed by logged-in users, scoped to `users/<email>/*` |
| `aws_s3_bucket.uploads` | Private, encrypted, versioned upload bucket (`theprivilegedcompany-bucket`) |
| `local_file.portal_config` | Writes `../portal/config.js` for the static page |

## Prerequisites

- Terraform >= 1.5, AWS CLI v2
- AWS credentials with permission to manage Cognito / IAM / S3 (the `aws sts
  get-caller-identity` account you intend to deploy into)

## Deploy

```bash
cd backend
terraform init
terraform plan      # review — expect ~14 resources, no deletions
terraform apply     # creates everything and writes ../portal/config.js
```

After apply, view the values any time with:

```bash
terraform output
```

## Create a user (manual)

There is no self sign-up. Create users with the CLI, then add them to `admin`:

```bash
POOL=$(terraform output -raw user_pool_id)

aws cognito-idp admin-create-user \
  --region eu-west-1 \
  --user-pool-id "$POOL" \
  --username you@example.com \
  --user-attributes Name=email,Value=you@example.com Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL          # emails a temporary password
# (or add --temporary-password 'Temp-Passw0rd!' to set one yourself and skip email)

aws cognito-idp admin-add-user-to-group \
  --region eu-west-1 \
  --user-pool-id "$POOL" \
  --username you@example.com \
  --group-name admin
```

On first login the portal will prompt you to set a permanent password
(Cognito `FORCE_CHANGE_PASSWORD`).

## Frontend config

`terraform apply` regenerates [`../portal/config.js`](../portal/config.js) with the pool
/client/identity-pool ids and bucket name. These are **public** client identifiers (no
secrets), so the file is committed and served by GitHub Pages. Rebuild & deploy the
portal after the first apply — see [`../portal/README.md`](../portal/README.md).

## Tear down

```bash
terraform destroy
```

The bucket has versioning enabled; if it contains objects you may need to empty it first
(`aws s3 rm s3://$(terraform output -raw bucket_name) --recursive`) and delete versions.

## State

Local state for now (`terraform.tfstate`, gitignored). For team use, migrate to a remote
S3 backend with DynamoDB locking — left as a follow-up.
