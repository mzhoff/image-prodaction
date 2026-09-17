# Content Hub: canonical Workspace projection and starter preset

Status: approved by product owner in the 2026-09-10 task.

The owner requested projection of the existing Yulia Baldina Workspace into
Image Production, an administrator membership for his existing IP user, isolated
copies of all five Content Hub capabilities, and a reusable onboarding preset.

## Boundaries

- Preserve the canonical Content Hub Workspace UUID. An operator projects that
  TEAM workspace locally; this is not a new Identity issuer or an automatic
  invitation API. Never infer membership from a name or email.
- Existing personal Workspaces, documents, assets, provider keys and execution
  history remain unchanged. The operator must explicitly supply the canonical
  Workspace ID and the existing IP administrator user ID.
- Content Hub connections must have provider Workspace ID = consumer Workspace
  ID = externalWorkspaceRef. A token issued by an unrelated personal Workspace
  is rejected, even if its external reference names the consumer.
- The reusable `content-hub.starter.v1` preset contains five asset-free editable
  graphs. Installation creates independent documents with deterministic,
  workspace-scoped IDs. Retrying never overwrites existing documents or repins
  an edited pipeline. Connection setup publishes initial immutable versions and
  grants their capabilities; it does not execute a model or publish content.
- Every editable document bound to a Content Hub Runtime client is organized in
  one protected `Content Hub` Studio project. The project is identified by the
  Workspace-scoped system key `content-hub`, never by a localized display name.
  Preset retries reconcile existing granted documents into this project, while
  documents and projects in other Workspaces remain untouched. Users can create
  additional drafts inside the project, but cannot rename or remove the system
  project from the ordinary folder UI.
- The authorized one-off copy uses the five pinned source versions, reconstructs
  only supported executable graph configuration, and verifies compilation
  equality. No sample inputs, generated results, assets or credentials cross
  the Workspace boundary. The generic preset has brand-neutral defaults.
- Replacing the legacy Content Hub connection is an explicit operator migration,
  not ordinary key rotation. It requires all prior local operations to be
  terminal, disables old bindings until individually revalidated, and preserves
  operation identities, snapshots, cached outputs, media and usage. Historical
  terminal reads use their stored result after client replacement; never send
  an old operation through the new credential.
- Provider credentials must be configured for the destination Workspace or use
  an already approved platform-provider policy. Never copy personal keys as
  part of a preset.

## Verification

Check two-Workspace membership and catalog isolation, all five compiled
contracts, retry/no-overwrite behavior, rejection of mismatched connections,
terminal-history preservation and absence of active operations before migration.
No shared SSO, public team onboarding, billing, or production deployment is
included in this local slice.

## Local verification, 2026-09-10

- Canonical Yulia Workspace: `9d1f2f02-4ec3-4a3c-bfcc-098cd68d56f8`.
- Existing Mikhail account can list both Workspaces: personal owner, Yulia admin.
- Five copied documents compile to the same plans as the old pinned versions;
  originals are preserved. Five new bindings pass the real Runtime v2 check.
- The new consumer credential cannot read a personal Workspace pipeline (404).
- Twelve prior Content Hub operations (nine succeeded, three failed) return their
  preserved local results without changing records or using the new credential.
- Repeated installation leaves complete document snapshots and pins unchanged.
  A PostgreSQL Workspace-scoped advisory lock rejects concurrent installations
  before writes. A retry after lock release succeeds without duplicates.
- Provider connection is separate from consumer connection: the Starter preset
  never copies credentials. Connecting Yulia's existing Content Hub provider key
  to the same Image Production Workspace requires operator approval.

The preset is installed by server-side Content Hub connection creation and resumed
before issuing a consumer key. Existing customized or disabled grants are not
silently overwritten. The operator projection CLI is
`scripts/provision-content-hub-workspace.ts`; it is a dry run unless `--apply` is
present. Canonical Workspace creation in a future public self-service flow still
belongs to the Platform Control Plane, not a browser selector.
