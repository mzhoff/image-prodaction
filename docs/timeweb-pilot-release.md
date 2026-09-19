# Timeweb pilot release

19 September 2026. Current server was read and SSH identity verified:
`77.233.223.85`, host `ludimogut-prod-01`. Existing Content Hub is under
`/opt/ludimogut`, public domain `apption.space`, Docker ingress network `ludimogut`.
The user deferred real secret configuration and production activation to a separate
step; this change prepares code, migrations, tests and deployable artifacts.

## Independent deployment

Use `compose.production.yaml` plus `compose.timeweb.yaml` together, project
`reverie-image-production`. The overlay keeps Image Production's own databases,
objects and workers; web joins the existing ingress network with alias
`reverie-image-production`. The old standalone Caddy is behind an explicit profile
and does not claim ports 80/443. Do not replace the existing Hub Compose stack.

Paid execution and credential projection use a separate PostgreSQL coordination
pool (four connections per application process, two-second acquisition timeout).
Long video operations cannot exhaust the ordinary auth/document database pool.
Include these connections when sizing PostgreSQL; saturation rejects new work
before paid dispatch and allows a retry.

The standalone Identity image and Compose definition live in the platform repo:
`apps/identity/Dockerfile`, `deploy/identity/compose.yaml`. Its own PostgreSQL contains
Identity records and the platform budget schema. Neither product writes another
product's database. Register the exact HTTPS callback for each deployed client.

Create DNS A records `production.apption.space` and `id.apption.space` to the server.
Append their proxy blocks to the server's actual Caddyfile only after validation;
retain the existing main website and `/admin` routes. The future `hub` subdomain is
reserved but Hub routing is not migrated by this change.

## Release flow

1. Run checks and build immutable images in CI. Image artifacts are retained for
   three days and identify the exact commit. Verify matching successful run/SHA.
2. Install environment files 0600. Generate new per-service database/encryption
   secrets; inject bot/management secrets through the protected configuration helper.
3. Take a backup of the existing stack/configuration. Start the new storage services
   under stable Compose project names. Apply reviewed migrations with `run --rm`.
4. Start the product and Identity, check readiness, configure the dedicated test bot
   webhook, then validate and reload Caddy. No paid generation before smoke acceptance.
5. Verify real Telegram login, deep link, personal owner workspace and tiny controlled
   budget application; then Ask AI/generation debit the same key. Inspect operator alerts.

Automatic deployment to the former `reverieapp.ru` staging host now requires explicit
repository variable `DEPLOY_TARGET=legacy-stage`. Merging launch code must not send it
to that old host. Timeweb activation is intentionally a separate configured step.

On the inspected server: 21 GB free, 2.4 GiB memory available, 2 GiB swap. Recheck before
release. Existing data, volumes, images and running services were not changed. Local
production builds are delegated to CI because the Mac has little free disk space.

The `.env.production.example` is documentation, never a usable secret file. Set
`AUTH_ALLOW_SIGN_UP=true` for the pilot: new accounts enter through Identity; local
email signup remains blocked when Identity is configured. SMTP remains disabled.
