# Single-host staging deployment

The temporary staging environment runs all Reverie components on one virtual
machine while preserving container boundaries:

- Caddy is the only public service and terminates HTTPS;
- the Next.js web application and generation worker use one immutable image;
- PostgreSQL and MinIO are available only inside the Docker network;
- Mailpit is intentionally excluded;
- public self-registration is disabled;
- email delivery and mandatory email verification are disabled;
- runtime secrets exist only in `/opt/image-prodaction/.env.production`.
- the canonical public origin is `https://reverieapp.ru`;
- Caddy obtains and renews the domain certificate automatically.

## Deployment flow

Every pull request and push to `main` must pass the full CI workflow. A
successful push to `main` then:

1. builds the production image on the GitHub runner;
2. synchronizes the allow-listed Compose and Caddy files;
3. streams the image over SSH without using a container registry;
4. runs database migrations;
5. starts web, worker, PostgreSQL, MinIO, and Caddy;
6. recreates Caddy so a synchronized ingress configuration is always loaded;
7. checks both application readiness and worker health;
8. rolls back the application image when either health check fails.

The GitHub Actions SSH key is restricted on the server to the
`reverie-ci-deploy` command. It cannot open a shell or port forwarding session.

## Server layout

```text
/opt/image-prodaction/
  .env.production       # server-only secrets
  .release.env          # deployed commit SHA
  compose.production.yaml
  deploy/Caddyfile
```

Persistent Docker volumes contain PostgreSQL, MinIO, and Caddy state.

## Access

The application is available at `https://reverieapp.ru`. Plain HTTP requests to
the server IP are redirected to the canonical domain; HTTPS on the bare IP is
not part of the public contract. Deployment health checks use the canonical
domain and therefore verify DNS, TLS, ingress, database, object storage, and the
worker together. The public DNS zone contains only the apex
`A reverieapp.ru -> 89.124.115.57` record; `www` is intentionally not used.
PostgreSQL and MinIO
must not publish host ports. Administrative access to them is performed through
an explicitly created SSH tunnel or a short-lived diagnostic container.

`PUBLIC_APP_URL` is the single source of truth for application, authentication,
and OpenRouter callback origins. `PUBLIC_TRUSTED_ORIGINS` contains only exact
frontend origins. These values are public configuration; database, S3,
authentication, and provider secrets remain server-only.

## Test accounts

The public `/register` route redirects to `/login`, and the email sign-up API
returns `403` while `AUTH_ALLOW_SIGN_UP=false`. Create an approved test account
from an interactive SSH session instead:

```bash
/opt/image-prodaction/deploy/server/reverie-create-user
```

The command reads the temporary password without echoing it or placing it in the
process arguments. It calls Better Auth inside the running application, so the
normal user, account, personal Workspace, and terms records are created
consistently. The partner can then change the temporary password in Settings.

## Backups

`reverie-backup` creates a PostgreSQL custom dump and a MinIO mirror with
seven-day local retention. These copies protect against accidental application
changes but not against loss of the whole VM. Provider snapshots or an external
S3 destination are still required for off-host disaster recovery.
