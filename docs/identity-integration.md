# Shared Identity consumer — 17 September 2026

Production keeps its own login, sessions, database, terms policy and personal-workspace
bootstrap. `@reverie/identity-client@0.1.0-canary.8` provides shared UI actions and a Better Auth
1.6.25 OIDC consumer. The exact generic client archive comes from Content Hub's
`packages/identity-client`; it contains no server credentials or private Identity implementation.
Other consumers retain their pinned versions until their own update. Do not modify the consumer archive locally.

Enable only after applying `0031_reverie_identity.sql`: nullable unique identity_subject,
nullable email; no ID, membership or ownership changes. Set REVERIE_IDENTITY_ISSUER to the
Identity origin plus `/api/auth`, and REVERIE_IDENTITY_CALLBACK_URL to this product's exact
browser-visible `/api/auth/identity/callback`. Register the same redirect under
`image-production` in IDENTITY_PRODUCTS_JSON and apply Identity's migration command.
Keep BETTER_AUTH_URL and trusted origins aligned with the product origin. HTTPS is required
in production; loopback HTTP is allowed in development only.

A fresh product login exchanges a single-use code with S256 PKCE/state/nonce and verified
ID token/UserInfo. Product session cookies stay in Production. Identity access/ID tokens
are not retained. Existing email collision requires old product login and explicit linking
via `/account`; the original session must be at most ten minutes old. Signup through Identity
honors AUTH_ALLOW_SIGN_UP and stores the current product terms version. Local email signup
is disabled once Identity is configured. The public entry shows only Telegram and email;
email uses Identity. The local password endpoint remains available for controlled account
linking, but the public screen no longer exposes a second competing login form.
Telegram-only users have no fabricated email. Verified email is added in Identity's `/account`.

`/account` links to the common profile/security/notifications cabinet and keeps access to
local workspace settings and usage. Global usage aggregation, subscriptions and global
session revocation are not implemented. Resetting the Identity password revokes Identity
sessions; already issued product sessions must be revoked in Production.

Disable the two consumer variables to return to the previous login UI. Do not restore
NOT NULL email or remove identity_subject after Telegram users have signed in. Such users
need a working Identity to sign in; disabling the integration is not an alternate credential.
No production DB, SMTP or Telegram configuration is changed by this code change.

## Simple entry and local proxies — 20 September 2026

The initial screen has the Reverie logo and Telegram/email choices. Email opens the
central credential form; Telegram opens a browser-bound waiting step with a bot link,
expiry/retry/cancel handling. Technical API/JSON errors are replaced with actionable
messages. A new product account still requires explicit terms acceptance. If missing,
the callback returns to a focused consent step and repeats the original method with the
existing Identity session; no acceptance flag is silently set.

`REVERIE_IDENTITY_CALLBACK_URLS` accepts a JSON array of extra exact callbacks. Mirror
these in the product's `additionalRedirectURIs` under `IDENTITY_PRODUCTS_JSON`, migrate
Identity's client registry, and add their origins to `BETTER_AUTH_TRUSTED_ORIGINS`.
A request selects only a configured callback. The selected callback, method and safe
return path stay bound to the single-use attempt, PKCE and browser proof. Production
keeps its single callback unless an explicit deployment config adds more.

Local callbacks cover localhost:3004, localhost:7310, 127.0.0.1:7310 and 127.0.0.1:3004.
Visual Intent no longer needs a manual move between ports after login. `compose.dev.yaml`
mounts the installed exact Identity package read-only, avoiding a full Docker build for
local shared-login edits. Production still consumes the tracked versioned archive.

Browser acceptance: an existing local fixture signed in through 127.0.0.1:7310, opened
its personal Workspace, then signed out. Identity and Image Production session tests
passed. Real local Telegram requires a separate development bot; the beta bot's webhook
remains on the Amsterdam/beta route. An unconfigured local bot is shown as unavailable,
never as successful or indefinitely waiting. No production deployment was performed.

## Product consent presentation — 21 September 2026

The focused terms state omits the generic welcome description and the already-used
Telegram waiting instruction. Its terms-text action is an interactive placeholder,
does not navigate or check the consent box, and explains that the link is coming.
The product-specific consent view uses the SDK's embedded Telegram completion
endpoint (and `/identity/start` for the legacy redirect flow). OIDC, browser proof,
exact callback selection and explicit consent enforcement stay in the exact-version
package. Terms are never submitted before the user checks the box and presses Continue.

## Embedded Telegram and restart — 21 September 2026

Canary.7 is built from the upstream Identity client, with the matching additive
Identity routes from ADR `2026-09-21-embedded-telegram-login.md` in Content Hub.
`IdentityActions telegramMode="embedded"` keeps start, waiting and consent inside
the product's welcome card. Only the explicit Telegram link opens another tab;
the original product/proxy address remains unchanged until successful login.
The product backend stores the challenge proof, PKCE/state/nonce and verified
profile for at most five minutes. The browser receives a short-lived HttpOnly
attempt cookie; central session cookies and OAuth tokens are never exposed to it.
The temporary central session is bounded to 60 seconds and revoked after exchange.

“Выбрать другой способ входа” cancels the pending challenge and clears the current
product session/attempt. A browser-bound front-channel reset then revokes the
current Identity session and returns to the chooser at the initiating allowlisted
product origin, including Visual Intent. Other devices and accounts are preserved.

Deploy the matching Identity server before enabling embedded mode in a consumer.
For a reverse-proxied deployment, configure the consumer's trusted client-IP
resolution and allow only its actual server/proxy IPs in Identity's
`IDENTITY_TRUSTED_PROXY_IPS`. The SDK forwards the resolved client IP; Identity
discards forwarded headers from untrusted peers. Without this explicit trust,
visitors share the product server's existing rate-limit bucket. No limits are
disabled or raised by the feature. Local settings and production secrets are unchanged.

Acceptance covers real local start/cancel navigation plus isolated end-to-end
Telegram approval, OIDC exchange, consent, replay protection and session revocation.
No Telegram messages are sent by the tests; a real user's bot confirmation remains
a manual integration check. No production deployment is implied.
