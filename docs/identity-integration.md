# Shared Identity consumer — 17 September 2026

Production keeps its own login, sessions, database, terms policy and personal-workspace
bootstrap. `@reverie/identity-client@0.1.0-canary.2` provides shared UI actions and a Better Auth
1.6.25 OIDC consumer. The exact generic client archive comes from Content Hub's
`packages/identity-client`; it contains no server credentials or private Identity implementation.
The same archive/version is used in Academy. Do not modify the consumer archive locally.

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
is disabled once Identity is configured, while legacy email sign-in stays available for linking.
Telegram-only users have no fabricated email. Verified email is added in Identity's `/account`.

`/account` links to the common profile/security/notifications cabinet and keeps access to
local workspace settings and usage. Global usage aggregation, subscriptions and global
session revocation are not implemented. Resetting the Identity password revokes Identity
sessions; already issued product sessions must be revoked in Production.

Disable the two consumer variables to return to the previous login UI. Do not restore
NOT NULL email or remove identity_subject after Telegram users have signed in. Such users
need a working Identity to sign in; disabling the integration is not an alternate credential.
No production DB, SMTP or Telegram configuration is changed by this code change.
