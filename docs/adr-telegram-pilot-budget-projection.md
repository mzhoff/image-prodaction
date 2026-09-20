# Telegram pilot: platform budget projection

Accepted scope: 19 September 2026, owner instructed implementation. Identity and
products use separate origins. Identity owns Telegram subjects; the platform
budget module runs alongside Identity and owns manual credit ledger, managed
OpenRouter keys, notifications and reserve monitoring. Image Production does
not become the billing service and never receives the management key.

`POST /v1/platform/budget-connection` accepts a server HMAC signed exact request,
expires after 60 seconds and validates the configured issuer. As of the approved
[Workspace budget update](workspace-budget-adr.md), it requires an explicit Workspace
ID and resolves its current owner. It never creates a Workspace implicitly.
`POST /v1/platform/budget-workspaces` resolves owned Workspaces by local identitySubject
under the same service authentication. First product login is required before a
receipt can choose a Workspace. No cross-database writes.

The child credential uses the existing encrypted provider store. Repeated attachment
of the same key is safe. A different managed key hash requires an explicit rotation
process; it cannot overwrite an attached key through replay. Ask AI resolves the
workspace credential for each turn, as generation does. No shared owner key fallback.

Existing workspace IDs and ownership are preserved. Team spaces, onboarding,
subscriptions and referrals are deferred to separate approved work.
