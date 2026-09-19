# Telegram pilot: platform budget projection

Accepted scope: 19 September 2026, owner instructed implementation. Identity and
products use separate origins. Identity owns Telegram subjects; the platform
budget module runs alongside Identity and owns manual credit ledger, managed
OpenRouter keys, notifications and reserve monitoring. Image Production does
not become the billing service and never receives the management key.

`POST /v1/platform/budget-connection` accepts a server HMAC signed exact request,
expires after 60 seconds, validates the configured issuer and resolves an existing
local identitySubject. It creates/reuses the personal workspace through the existing
owner/membership function. The first product login is required; until then the
platform retains the approved credit and retries attachment. No cross-database writes.

The child credential uses the existing encrypted provider store. Repeated attachment
of the same key is safe. A different managed key hash requires an explicit rotation
process; it cannot overwrite an attached key through replay. Ask AI resolves the
workspace credential for each turn, as generation does. No shared owner key fallback.

Existing workspace IDs and ownership are preserved. Team spaces, onboarding,
subscriptions and referrals are deferred to separate approved work.
