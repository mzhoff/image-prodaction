# Quality Gates

## Scope

Quality gates cover the browser product, authentication, PostgreSQL persistence,
private S3-compatible storage and local email delivery. A green unit-test suite
alone is not enough for changes that affect the backend critical path.

## Gate levels

- **Hard gate (must hold):** no data loss, no connector corruption, stable persistence.
- **Soft gate:** UX polish and visual consistency.

## Mandatory checks (local, before commit)

1. `npm run db:check`
2. `npm run db:migrate` twice (migrations must be repeatable)
3. `npm run typecheck`
4. `npm test`
5. `npm run build`
6. `npm audit --omit=dev --audit-level=high`
7. `npm run test:backend-smoke` against a running full local contour
8. `npm run test:e2e` against PostgreSQL, MinIO, Mailpit and the running app
9. manual regression pass for publish/canvas flows affected by the change

CI executes the same hard gates and also builds the production Docker image.
Failed Playwright runs retain a trace, screenshot and video; CI additionally
uploads the application, MinIO and Mailpit logs.

## Critical scenarios (hard)

### Authentication and storage

1. Register without receiving a session before email verification.
2. Receive a verification email in Mailpit and verify through its real link.
3. Create a personal workspace and document.
4. Upload an image to private MinIO, autosave the document and restore it after reload.
5. Sign out and sign in again.
6. Request a password reset through Mailpit and replace the password.
7. Reject the old password and accept the new password.
8. Revoke old sessions after a reset.
9. Return `404` when another tenant requests a foreign asset.
10. Delete the stored object when its asset or permanently deleted document is cleaned up.

### Canvas and graph

1. Create node.
2. Create and verify connection.
3. Remove connection.
4. Text generation run + successful text result injection.
5. Image generation run + successful image result injection.
6. Undo/Redo after rename and move/resize/config actions.
7. Text formatting operations in rich text nodes.
8. Reorder media blocks in `telegramPublication`.
9. Import/export pipeline template.
10. Every concrete node type functionality smoke path.

## Additional hard constraints

- No silent connector order loss (especially for concatenated and dynamic input nodes).
- Source text and outputs must not disappear on unrelated UI actions.
- Node state must survive reloads (position, ports, collapsed/expanded UI state).
- Runtime should not crash on malformed/partial formatting payload.

## Soft constraints

- Output visual correctness and exact per-pixel similarity are not guaranteed while AI formatting transforms text.
- Minor token-level diff is accepted for LLM formatting operations.
- Rendering polish and spacing should follow current UX backlog.

## Regression budget

When output is produced by AI:

- do not require zero-character diffs from source text;
- require deterministic execution order and stable structural semantics.

## Test coverage matrix by component area

- Canvas graph structure
- Node-level actions
- Publish text formatting
- Sectioning and grouping
- Import/export
- History (undo/redo)

## Delivery rule

Hard gate failures block merge.
Soft gate failures are logged and triaged by priority.

Do not weaken or skip the email-verification gate to make smoke tests pass.
For deliberate local debugging, policy can be disabled with
`AUTH_REQUIRE_EMAIL_VERIFICATION=false`, but CI always sets it to `true`.
