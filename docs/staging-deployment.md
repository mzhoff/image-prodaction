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

## Deployment flow

Every pull request and push to `main` must pass the full CI workflow. A
successful push to `main` then:

1. builds the production image on the GitHub runner;
2. synchronizes the allow-listed Compose and Caddy files;
3. streams the image over SSH without using a container registry;
4. runs database migrations;
5. starts web, worker, PostgreSQL, MinIO, and Caddy;
6. checks both application readiness and worker health;
7. rolls back the application image when either health check fails.

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

The application is available at `https://89.124.115.57`. PostgreSQL and MinIO
must not publish host ports. Administrative access to them is performed through
an explicitly created SSH tunnel or a short-lived diagnostic container.

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
